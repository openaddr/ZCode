/**
 * DTS 流程外网验证:靶仓重置(GitHub 版,#73)。
 * 语义=「当之前的 PR 没发过」:关掉靶仓全部开启的 PR、删除其远端分支。
 * main 从不被 merge(流程验收只到 PR 建出+流水线绿),bug 恒在 → 同一靶题可无限复跑。
 * 若 main 意外漂移,用 --reforce <本地 seed 分支> 强推回(独立动作,不并入默认路径)。
 * 内网替换点:等价操作=codehub 关 MR+删分支,重写本脚本即可,产品侧零感知。
 * 用法:node reset.mjs <owner/repo>
 */
import { execFileSync } from "node:child_process";

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", windowsHide: true });
}

function main() {
  const repo = process.argv[2];
  if (!repo) {
    console.error("用法: node reset.mjs <owner/repo>");
    process.exit(2);
  }
  const prs = JSON.parse(gh(["pr", "list", "--repo", repo, "--state", "open", "--json", "number,headRefName"]));
  for (const pr of prs) {
    console.log(`[reset] 关 PR #${pr.number}(${pr.headRefName})`);
    gh(["pr", "close", String(pr.number), "--repo", repo, "--delete-branch"]);
  }
  console.log(`[reset] 完成:关闭 ${prs.length} 个 PR。main 未动,靶题可复跑。`);
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop());
if (isMain) {
  main();
}
