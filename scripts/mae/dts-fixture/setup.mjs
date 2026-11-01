/**
 * DTS 流程外网验证:靶仓一键建仓(GitHub 版,#73)。
 * 从本目录 fixture/ 源建 GitHub 私有仓并推 seed(main)。已存在则跳过建仓、
 * 强推覆盖回 seed(把靶仓拉回「PR 没发过」的初态,等价 reset 的彻底形态)。
 * 用法:node setup.mjs [owner/repo]  (缺省 openaddr/mae-dts-fixture)
 * 依赖:gh 已登录;本机 git 推送凭据走用户本地配置(spec 原则)。
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
}

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", windowsHide: true });
}

function main() {
  const repo = process.argv[2] ?? "openaddr/mae-dts-fixture";
  const fixtureSrc = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixture");
  const worktree = mkdtempSync(path.join(tmpdir(), "dts-fixture-"));
  const repoDir = path.join(worktree, "repo");
  cpSync(fixtureSrc, repoDir, { recursive: true });

  git(repoDir, ["init", "-q", "-b", "main"]);
  git(repoDir, ["config", "user.email", "mae-e2e@local"]);
  git(repoDir, ["config", "user.name", "mae-dts-e2e"]);
  git(repoDir, ["add", "-A"]);
  git(repoDir, ["commit", "-qm", "seed: session TTL bug (DTS 流程外网验证靶题 #73)"]);

  const exists = (() => {
    try {
      gh(["repo", "view", repo, "--json", "name", "--jq", ".name"]);
      return true;
    } catch {
      return false;
    }
  })();
  if (!exists) {
    console.log(`[setup] 建私有仓 ${repo}`);
    gh(["repo", "create", repo, "--private"]);
  } else {
    console.log(`[setup] 仓已存在,强推回 seed`);
  }
  const url = `https://github.com/${repo}.git`;
  git(repoDir, ["remote", "add", "origin", url]);
  git(repoDir, ["push", "-q", "--force", "origin", "main"]);
  rmSync(worktree, { recursive: true, force: true });
  console.log(`[setup] 完成: ${url} (main=seed,bug 恒在)`);
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop());
if (isMain) {
  main();
}
