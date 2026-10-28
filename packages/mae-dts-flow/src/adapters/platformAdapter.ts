/** 平台适配(MR/流水线):config 驱动的命令模板 + codehubcli 执行;mock 平台用于外网全流程演练。 */
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

import { type PipelineState, type MrAccount } from "../domain/mrGate.js";
import { requireDependency } from "../domain/depsProbe.js";
import { fsProbeOptions } from "./fsProbe.js";

export interface PlatformCommands {
  createMr: string[];
  mrStatus: string[];
}

/**
 * 缺省命令模板(provisional:字段以 {repo}/{branch}/{title}/{description}/{ticket}/{url} 占位,
 * 内网部署后按真实 codehubcli 旗标在 platform-adapter.json 覆盖,不改代码)。
 */
export const DEFAULT_COMMANDS: PlatformCommands = {
  createMr: [
    "codehubcli",
    "mr",
    "create",
    "--repo",
    "{repo}",
    "--source",
    "{branch}",
    "--title",
    "{title}",
    "--description",
    "{description}",
    "--e2e-issues",
    "{ticket}",
  ],
  mrStatus: ["codehubcli", "mr", "status", "--url", "{url}"],
};

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

function fillTemplate(template: string[], vars: Record<string, string>): string[] {
  return template.map((part) =>
    Object.entries(vars).reduce((acc, [key, value]) => acc.replaceAll(`{${key}}`, value), part),
  );
}

function execJson(command: string[], timeoutMs: number, binDir: string, pathEnv?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    void (async () => {
      const resolved = await requireDependency(command[0] as string, fsProbeOptions(binDir, pathEnv, process.platform));
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

export class CliPlatformAdapter implements PlatformAdapter {
  constructor(
    private readonly commands: PlatformCommands,
    private readonly binDir: string,
    private readonly pathEnv?: string,
  ) {}

  private async run(template: string[], vars: Record<string, string>): Promise<string> {
    const command = fillTemplate(template, vars);
    return execJson(command, 120_000, this.binDir, this.pathEnv);
  }

  async createMr(input: {
    repo: string;
    branch: string;
    title: string;
    description: string;
    ticket: string;
  }): Promise<MrCreated> {
    const stdout = await this.run(this.commands.createMr, {
      repo: input.repo,
      branch: input.branch,
      title: input.title,
      description: input.description,
      ticket: input.ticket,
    });
    let url = "";
    try {
      const parsed = JSON.parse(stdout) as Record<string, unknown>;
      url = String(parsed["url"] ?? "");
    } catch {
      url = stdout.trim().split("\n").at(-1) ?? "";
    }
    if (!url) {
      throw new PlatformError(`create_mr 输出无 MR URL: ${stdout.slice(0, 200)}`);
    }
    return { repo: input.repo, url, branch: input.branch };
  }

  async pipelineStatus(url: string): Promise<PipelineState> {
    const stdout = await this.run(this.commands.mrStatus, { url });
    try {
      const parsed = JSON.parse(stdout) as Record<string, unknown>;
      const state = String(parsed["pipeline"] ?? "unknown");
      if (state === "green" || state === "red" || state === "running") return state;
      return "unknown";
    } catch {
      throw new PlatformError(`mr status 输出不是合法 JSON: ${stdout.slice(0, 200)}`);
    }
  }
}

/** mock 平台:免 codehubcli;MR 即建即 running,第二次查询转绿(外网全流程演练)。 */
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

export interface AdapterConfigInput {
  dataDir: string;
  mock: boolean;
  binDir: string;
  pathEnv?: string;
}

export async function createPlatformAdapter(input: AdapterConfigInput): Promise<PlatformAdapter> {
  if (input.mock) return new MockPlatformAdapter();
  const file = path.join(input.dataDir, "platform-adapter.json");
  const raw = await fs.readFile(file, "utf8").catch(() => null);
  let commands = DEFAULT_COMMANDS;
  if (raw !== null) {
    const parsed = JSON.parse(raw) as Partial<PlatformCommands>;
    if (!Array.isArray(parsed.createMr) || !Array.isArray(parsed.mrStatus)) {
      throw new PlatformError("platform-adapter.json 格式非法:createMr/mrStatus 必须是字符串数组");
    }
    commands = { createMr: parsed.createMr, mrStatus: parsed.mrStatus };
  }
  return new CliPlatformAdapter(commands, input.binDir, input.pathEnv);
}

export type { MrAccount };
