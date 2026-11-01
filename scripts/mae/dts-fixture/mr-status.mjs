/**
 * DTS 流程外网验证:mrStatus 适配器实现(GitHub 版,#73)。
 * 用法:node dts-fixture-mr-status.mjs <PR URL>
 * 输出 {"pipeline":"green|red|running"} —— platformAdapter.mrStatus 模板的输出契约
 * (specs/mae/dts-flow.md D15:三态裁决吃这个 JSON)。
 * 内网替换点:codehubcli mr status --url <url> 直接满足同一契约,本脚本随即退役。
 */
import { execFileSync } from "node:child_process";

/**
 * 纯映射:GitHub statusCheckRollup 条目数组 → pipeline 三态。
 * 未知条目类型按 running 处理(等下一个轮询拍),保守不给绿。
 */
export function mapChecks(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return "running";
  const conclusions = entries.map((entry) => {
    if (typeof entry !== "object" || entry === null) return "running";
    // CheckRun:conclusion;StatusContext:state。两形态并存时同尺归一。
    const raw = entry.conclusion ?? entry.state ?? "PENDING";
    const state = String(raw).toUpperCase();
    if (["SUCCESS", "NEUTRAL", "SKIPPED"].includes(state)) return "green";
    if (["FAILURE", "TIMED_OUT", "STARTUP_FAILURE", "CANCELLED", "ERROR", "EXPECTED"].includes(state)) return "red";
    return "running";
  });
  if (conclusions.some((state) => state === "red")) return "red";
  if (conclusions.every((state) => state === "green")) return "green";
  return "running";
}

export function mapPrState(state) {
  const normalized = String(state ?? "").toUpperCase();
  if (normalized === "MERGED") return "green";
  if (normalized === "CLOSED") return "red";
  return "running";
}

function main() {
  const prUrl = process.argv[2];
  if (!prUrl) {
    console.error("用法: node dts-fixture-mr-status.mjs <PR URL>");
    process.exit(2);
  }
  let stdout;
  try {
    stdout = execFileSync(
      "gh",
      ["pr", "view", prUrl, "--json", "state,statusCheckRollup"],
      { encoding: "utf8", timeout: 60_000, windowsHide: true },
    );
  } catch (error) {
    // 查询失败(限流/网络)按 running 处理:mrGate 继续轮询,预算耗尽转人工。
    console.error(`[mr-status] gh 查询失败: ${error.message}`);
    console.log(JSON.stringify({ pipeline: "running" }));
    return;
  }
  const parsed = JSON.parse(stdout);
  const prState = mapPrState(parsed.state);
  const pipeline = prState === "running" ? mapChecks(parsed.statusCheckRollup) : prState;
  console.log(JSON.stringify({ pipeline }));
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop());
if (isMain) {
  main();
}
