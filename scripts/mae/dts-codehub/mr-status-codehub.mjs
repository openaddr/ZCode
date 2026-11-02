/**
 * DTS 流程内网适配:mrStatus 适配器实现(CodeHub 版,#580)。
 * 用法:node mr-status-codehub.mjs <MR URL>
 * 输出 {"pipeline":"green|red|running"} —— platformAdapter.mrStatus 模板的输出契约
 * (specs/mae/dts-flow.md D15:三态裁决吃这个 JSON)。
 *
 * 数据路:codehub-cli mr pipeline <iid> -p <project>(MR URL 自含 project+iid 与
 * host,无需 host 别名;-p 收项目路径或 URL)。多条 run 取数值 id 最大者为最新
 * (平台 orderStatusRuns 同纪律:historical run 不准当现况)。
 *
 * 失败语义(fail-loud,不猜;服务侧把非零退出记 pipeline_probe_failed 后继续轮询,
 * 轮询预算耗尽自然转人工):
 * - CLI 缺失/非零退出/URL 解析不动 → 退出码 1 + stderr 人话;
 * - 认不出的流水线状态词 → 退出码 1(同平台 mapStatus「拒绝猜测」纪律);
 * - 空数组 = running(MR 刚建、流水线自动触发延迟是真实等待态)。
 *
 * 内网替换点(README 有当天 runbook):本脚本+platform-adapter.codehub.example.json
 * 即 mrStatus 腿的全部;CI 红灯诊断口子(mr gate --action … --log)见 README「未来」。
 */
import { execFileSync } from "node:child_process";

/** MR URL → {project, iid}。兼容 /merge_requests/<iid> 与 /-/merge_requests/<iid>;
 * 解析不动返回 null(URL 不是合同的一部分,别猜)。 */
export function parseMrUrl(mrUrl) {
  const match = String(mrUrl ?? "").match(
    /^(https?:\/\/[^/]+)\/(.+?)\/(?:-\/)?merge_requests\/(\d+)(?:[/?#]|$)/,
  );
  if (!match) return null;
  return { project: decodeURIComponent(match[2]), iid: match[3] };
}

/** 流水线状态词 → 三态。与平台 adapter.codehub.json 的 status_map 一字对应:
 * canceled/skipped 判 red(平台同款),created/pending/manual 算 running。 */
export function mapPipelineStatus(raw) {
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
      throw new Error(
        `流水线状态 "${raw}" 不在映射表里,拒绝猜测——`
        + "请在 mr-status-codehub.mjs 的 mapPipelineStatus 补上映射",
      );
  }
}

/** 多条 run 取最新:数值 id 最大者。id 缺失的多 run 形状无法判新旧,
 * 宁可失败也不拿历史绿灯放行(平台 orderStatusRuns 同纪律)。 */
export function pickLatestRun(runs) {
  if (!Array.isArray(runs)) throw new Error("mr pipeline 输出不是数组");
  if (runs.length === 0) return null;
  if (runs.length === 1) return runs[0];
  const withIds = runs.map((run) => ({
    run,
    id: /^\d+$/.test(String(run?.id ?? "")) ? BigInt(run.id) : undefined,
  }));
  if (withIds.some((row) => row.id === undefined)) {
    throw new Error(
      "mr pipeline 返回多条 run 但部分缺数值 id,无法判最新;拒绝猜测",
    );
  }
  const sorted = withIds.sort((left, right) =>
    left.id > right.id ? 1 : left.id < right.id ? -1 : 0);
  return sorted[sorted.length - 1].run;
}

function main() {
  const mrUrl = process.argv[2];
  if (!mrUrl) {
    console.error("用法: node mr-status-codehub.mjs <MR URL>");
    process.exit(2);
  }
  const target = parseMrUrl(mrUrl);
  if (!target) {
    console.error(`[mr-status] MR URL 解析不动(要 .../<project>/merge_requests/<iid>): ${mrUrl}`);
    process.exit(1);
  }
  const cli = process.env["CODEHUB_CLI"] ?? "codehub-cli";
  let stdout;
  try {
    stdout = execFileSync(
      cli,
      ["mr", "pipeline", target.iid, "-p", target.project, "--format", "json", "--no-cache", "-k"],
      { encoding: "utf8", timeout: 60_000, windowsHide: true },
    );
  } catch (error) {
    console.error(`[mr-status] ${cli} 查询失败: ${error.message}`);
    process.exit(1);
  }
  let runs;
  try {
    runs = JSON.parse(stdout);
  } catch {
    console.error(`[mr-status] 输出不是 JSON: ${String(stdout).slice(0, 200)}`);
    process.exit(1);
  }
  const latest = pickLatestRun(runs);
  if (latest === null) {
    console.log(JSON.stringify({ pipeline: "running" }));
    return;
  }
  try {
    console.log(JSON.stringify({ pipeline: mapPipelineStatus(latest?.status) }));
  } catch (error) {
    console.error(`[mr-status] ${error.message}`);
    process.exit(1);
  }
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop());
if (isMain) {
  main();
}
