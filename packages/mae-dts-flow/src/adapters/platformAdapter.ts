/** MR 平台适配:具名适配器三选一(mock/github/codehub,ADR-0002)。
 * 真实平台只有两个,命令形状固化为类内知识(不搞配置模板层);CLI 二进制照旧
 * binDir 优先解析;测试经 exec port 注入假执行器。 */
import { execFile } from "node:child_process";

import { type PipelineState, type MrAccount } from "../domain/mrGate.js";
import { type MrPlatform } from "../domain/config.js";
import { requireDependency } from "../domain/depsProbe.js";
import { fsProbeOptions } from "./fsProbe.js";

export class PlatformError extends Error {}

export interface MrCreated {
  repo: string;
  url: string;
  branch: string;
}

export interface PlatformAdapter {
  createMr(input: { repo: string; branch: string; title: string; description: string; ticket: string }): Promise<MrCreated>;
  pipelineStatus(url: string): Promise<PipelineState>;
}

/** CLI 执行端口:生产=binDir 优先解析 + Windows .cmd/.bat 经 cmd /c;测试注入假执行器。 */
export type CliExec = (command: string[], timeoutMs: number) => Promise<string>;

export interface CliAdapterDeps {
  binDir: string;
  pathEnv?: string;
  /** 缺省=真实进程执行;测试注入假执行器(返回 stdout,失败抛 PlatformError)。 */
  exec?: CliExec;
}

const CLI_TIMEOUT_MS = 120_000;

function makeCliExec(deps: CliAdapterDeps): CliExec {
  if (deps.exec) return deps.exec;
  return (command, timeoutMs) =>
    new Promise((resolve, reject) => {
      void (async () => {
        const resolved = await requireDependency(command[0] as string, fsProbeOptions(deps.binDir, deps.pathEnv, process.platform));
        // Windows 上 .cmd/.bat 不能被 execFile 直启,经 cmd /c 转发。
        const isWinWrapper = process.platform === "win32" && /\.(cmd|bat)$/i.test(resolved);
        const file = isWinWrapper ? "cmd.exe" : resolved;
        const args = isWinWrapper ? ["/c", resolved, ...command.slice(1)] : command.slice(1);
        execFile(
          file,
          args,
          { timeout: timeoutMs, windowsHide: true, encoding: "utf8" },
          (error, stdout, stderr) => {
            if (error) {
              reject(new PlatformError(`命令失败(${command[0]}):${error.message}${stderr ? ` | ${stderr.trim()}` : ""}`));
              return;
            }
            resolve(stdout);
          },
        );
      })().catch(reject);
    });
}

/** mock 平台:免外部 CLI;MR 即建即 running,第二次查询转绿(外网全流程演练)。 */
export class MockPlatformAdapter implements PlatformAdapter {
  private readonly polls = new Map<string, number>();

  async createMr(input: { repo: string; branch: string }): Promise<MrCreated> {
    const seq = (this.polls.size + 1).toString();
    return { repo: input.repo, url: `https://mr.mock/${seq}`, branch: input.branch };
  }

  async pipelineStatus(url: string): Promise<PipelineState> {
    const count = (this.polls.get(url) ?? 0) + 1;
    this.polls.set(url, count);
    return count >= 2 ? "green" : "running";
  }
}

/** GitHub 平台(外网靶场/验证):gh CLI。MR=pr create;状态=pr view 的 state+checks rollup。 */
export class GithubPlatformAdapter implements PlatformAdapter {
  private readonly exec: CliExec;

  constructor(deps: CliAdapterDeps) {
    this.exec = makeCliExec(deps);
  }

  async createMr(input: {
    repo: string;
    branch: string;
    title: string;
    description: string;
    ticket: string;
  }): Promise<MrCreated> {
    const reused = await this.lookupOpenPr(input.repo, input.branch);
    if (reused !== null) {
      return { repo: input.repo, url: reused, branch: input.branch };
    }
    const stdout = await this.exec(
      [
        "gh", "pr", "create",
        "--repo", input.repo,
        "--head", input.branch,
        "--title", input.title,
        "--body", input.description,
      ],
      CLI_TIMEOUT_MS,
    );
    const url = stdout.trim().split("\n").filter((line) => line.trim()).at(-1) ?? "";
    if (!/^https?:\/\//.test(url)) {
      throw new PlatformError(`gh pr create 输出无 PR URL: ${stdout.slice(0, 200)}`);
    }
    return { repo: input.repo, url, branch: input.branch };
  }

  /** 建前先查:同 head 分支已有 open PR 直接复用——部分失败后的重试必撞 gh 的
   * "already exists" 硬错(2026-11-07 靶场实跑实录);与 codehub 腿同一纪律。 */
  private async lookupOpenPr(repo: string, branch: string): Promise<string | null> {
    let stdout: string;
    try {
      stdout = await this.exec(
        ["gh", "pr", "list", "--repo", repo, "--head", branch, "--state", "open", "--json", "url"],
        CLI_TIMEOUT_MS,
      );
    } catch {
      return null; // 查询失败≠查不到:真失败留给创建那一步报,这里不猜。
    }
    try {
      const parsed: unknown = JSON.parse(stdout);
      if (!Array.isArray(parsed)) return null;
      for (const row of parsed as Array<Record<string, unknown>>) {
        const url = String(row["url"] ?? "").trim();
        if (url) return url;
      }
      return null;
    } catch {
      return null;
    }
  }

  async pipelineStatus(url: string): Promise<PipelineState> {
    const stdout = await this.exec(
      ["gh", "pr", "view", url, "--json", "state,statusCheckRollup"],
      CLI_TIMEOUT_MS,
    );
    let parsed: { state?: unknown; statusCheckRollup?: unknown };
    try {
      parsed = JSON.parse(stdout) as typeof parsed;
    } catch {
      throw new PlatformError(`gh pr view 输出不是合法 JSON: ${stdout.slice(0, 200)}`);
    }
    const prState = mapPrState(parsed.state);
    return prState === "running" ? mapChecks(parsed.statusCheckRollup) : prState;
  }
}

/** PR 状态 → 三态:MERGED 即绿(收口语义),CLOSED 即红,其余交给 checks rollup。 */
export function mapPrState(state: unknown): PipelineState {
  const normalized = String(state ?? "").toUpperCase();
  if (normalized === "MERGED") return "green";
  if (normalized === "CLOSED") return "red";
  return "running";
}

/** 纯映射:GitHub statusCheckRollup 条目数组 → 三态(同尺归一 conclusion/status 两形态)。
 * 未知条目按 running 处理(等下一个轮询拍,保守不给绿)。 */
export function mapChecks(entries: unknown): PipelineState {
  if (!Array.isArray(entries) || entries.length === 0) return "running";
  const conclusions = entries.map((entry) => {
    if (typeof entry !== "object" || entry === null) return "running";
    const row = entry as { conclusion?: unknown; state?: unknown };
    const raw = row.conclusion ?? row.state ?? "PENDING";
    const state = String(raw).toUpperCase();
    if (["SUCCESS", "NEUTRAL", "SKIPPED"].includes(state)) return "green";
    if (["FAILURE", "TIMED_OUT", "STARTUP_FAILURE", "CANCELLED", "ERROR", "EXPECTED"].includes(state)) {
      return "red";
    }
    return "running";
  });
  if (conclusions.some((state) => state === "red")) return "red";
  if (conclusions.every((state) => state === "green")) return "green";
  return "running";
}

/** CodeHub 平台(内网):codehub-cli。命令形状=平台生产配置同款(#580 内网手册):
 * mr create 用 `--json web_url,iid` 的常规分支 MR(随 git push 自动推进,禁 mr upload
 * 的 OMEGA 形态);状态=mr pipeline(带 --no-cache 防缓存绿灯),状态词映射与平台
 * status_map 一字对应。 */
export class CodehubCliPlatformAdapter implements PlatformAdapter {
  private readonly exec: CliExec;

  constructor(deps: CliAdapterDeps) {
    this.exec = makeCliExec(deps);
  }

  /** 建前先查:同分支对已有 opened MR 直接复用其 URL——CodeHub 建 MR 幂等语义不统一
   * (CLI 报 stderr/REST 静默空 body,平台生产纪律=查询是唯一稳的路),盲建重试会重复。 */
  async createMr(input: {
    repo: string;
    branch: string;
    title: string;
    description: string;
    ticket: string;
  }): Promise<MrCreated> {
    // 分支名契约=目标分支_工号_单号:目标分支取首段;无下划线段结构=契约外分支,不猜。
    const target = input.branch.includes("_") ? input.branch.split("_")[0] : "";
    if (!target) {
      throw new PlatformError(`分支名无法解析目标分支(约定 目标分支_工号_单号): ${input.branch}`);
    }
    const reused = await this.lookupOpenedMr(input.repo, input.branch, target);
    if (reused !== null) {
      return { repo: input.repo, url: reused, branch: input.branch };
    }
    const stdout = await this.exec(
      [
        "codehub-cli", "mr", "create",
        "-p", input.repo,
        "--source-branch", input.branch,
        "--target-branch", target,
        "--title", input.title,
        "--e2e-issues", input.ticket,
        "--format", "json",
        "--json", "web_url,iid",
        "-k",
      ],
      CLI_TIMEOUT_MS,
    );
    const url = extractMrUrl(stdout);
    if (!url) {
      throw new PlatformError(`create_mr 输出无 MR URL: ${stdout.slice(0, 200)}`);
    }
    return { repo: input.repo, url, branch: input.branch };
  }

  private async lookupOpenedMr(repo: string, branch: string, target: string): Promise<string | null> {
    let stdout: string;
    try {
      stdout = await this.exec(
        [
          "codehub-cli", "mr", "list",
          "-p", repo,
          "--source-branch", branch,
          "--target-branch", target,
          "--state", "opened",
          "--format", "json",
          "--json", "web_url,iid",
          "-k",
        ],
        CLI_TIMEOUT_MS,
      );
    } catch {
      // 查询失败≠查不到:真失败留给创建那一步报,这里不猜。
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(stdout);
      if (!Array.isArray(parsed)) return null;
      for (const row of parsed as Array<Record<string, unknown>>) {
        const url = String(row["web_url"] ?? row["url"] ?? "").trim();
        if (url) return url;
      }
      return null;
    } catch {
      return null;
    }
  }

  async pipelineStatus(url: string): Promise<PipelineState> {
    const target = parseMrUrl(url);
    if (!target) {
      throw new PlatformError(`MR URL 解析不动(要 .../<project>/merge_requests/<iid>): ${url}`);
    }
    const stdout = await this.exec(
      ["codehub-cli", "mr", "pipeline", target.iid, "-p", target.project, "--format", "json", "--no-cache", "-k"],
      CLI_TIMEOUT_MS,
    );
    let runs: unknown;
    try {
      runs = JSON.parse(stdout) as unknown;
    } catch {
      throw new PlatformError(`mr pipeline 输出不是合法 JSON: ${stdout.slice(0, 200)}`);
    }
    const latest = pickLatestRun(runs);
    if (latest === null) return "running"; // 流水线未触发(MR 刚建)是真实等待态
    return mapPipelineStatus(latest?.status);
  }
}

/** MR URL → {project, iid}。兼容 /merge_requests/<iid> 与 /-/merge_requests/<iid>;
 * 解析不动返回 null(URL 不是合同的一部分,别猜)。 */
export function parseMrUrl(mrUrl: string): { project: string; iid: string } | null {
  const match = String(mrUrl ?? "").match(
    /^(https?:\/\/[^/]+)\/(.+?)\/(?:-\/)?merge_requests\/(\d+)(?:[/?#]|$)/,
  );
  if (!match) return null;
  return { project: decodeURIComponent(match[2] ?? ""), iid: match[3] ?? "" };
}

/** 流水线状态词 → 三态,与平台 status_map 一字对应:canceled/skipped=red,
 * created/pending/manual=running;认不出的词抛错(拒绝猜测,平台 mapStatus 同纪律)。 */
export function mapPipelineStatus(raw: unknown): PipelineState {
  const key = String(raw ?? "").toLowerCase();
  switch (key) {
    case "success":
      return "green";
    case "failed":
      return "red";
    case "running":
    case "created":
    case "pending":
    case "manual":
      return "running";
    case "canceled":
    case "skipped":
      return "red";
    default:
      throw new PlatformError(
        `流水线状态 "${String(raw ?? "")}" 不在映射表里,拒绝猜测——`
        + "请在 mapPipelineStatus 补上映射",
      );
  }
}

/** 多条 run 取最新:数值 id 最大者。id 缺失的多 run 形状无法判新旧,
 * 宁可失败也不拿历史绿灯放行(平台 orderStatusRuns 同纪律)。 */
export function pickLatestRun(runs: unknown): { status?: unknown } | null {
  if (!Array.isArray(runs)) {
    throw new PlatformError("mr pipeline 输出不是数组");
  }
  if (runs.length === 0) return null;
  if (runs.length === 1) return runs[0] as { status?: unknown };
  const withIds = runs.map((run) => {
    const row = (run ?? {}) as { id?: unknown; status?: unknown };
    const id = /^\d+$/.test(String(row.id ?? "")) ? BigInt(String(row.id)) : undefined;
    return { status: row.status, id };
  });
  if (withIds.some((row) => row.id === undefined)) {
    throw new PlatformError("mr pipeline 返回多条 run 但部分缺数值 id,无法判最新;拒绝猜测");
  }
  const sorted = withIds.sort((left, right) =>
    (left.id as bigint) > (right.id as bigint) ? 1 : (left.id as bigint) < (right.id as bigint) ? -1 : 0);
  return { status: sorted[sorted.length - 1]?.status };
}

/** codehub-cli 建单输出抽 MR URL:`--json web_url,iid` 输出顶层 web_url(#580);
 * 兼容 url 键。JSON 解析不动返回空串(不猜最后一行——codehub-cli 契约是纯 JSON)。 */
function extractMrUrl(stdout: string): string {
  try {
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    return String(parsed["web_url"] ?? parsed["url"] ?? "").trim();
  } catch {
    return "";
  }
}

export function createPlatformAdapter(input: {
  platform: MrPlatform;
  binDir: string;
  pathEnv?: string;
}): PlatformAdapter {
  switch (input.platform) {
    case "mock":
      return new MockPlatformAdapter();
    case "github":
      return new GithubPlatformAdapter({ binDir: input.binDir, pathEnv: input.pathEnv });
    case "codehub":
      return new CodehubCliPlatformAdapter({ binDir: input.binDir, pathEnv: input.pathEnv });
  }
}

export type { MrAccount };
