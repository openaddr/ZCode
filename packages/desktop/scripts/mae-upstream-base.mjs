/**
 * mae 上游基线解析(构建期唯一出口)——specs/mae/versioning-branding.md(#11)。
 *
 * "上游基线" = mae 定制栈最后一次同步落位的上游提交(上游 `main@upstream` 由 Sync Bot
 * 每日 squash 发布,其本地 ref 尖可能已前进,故取 `merge-base HEAD <上游 ref>` 而非
 * ref 尖),基线版本 = 该提交上仓库根 package.json 的 version。
 *
 * 解析优先级(CI 与本地均可靠):
 * 1. 显式 env `ZCODE_UPSTREAM_BASE`(可选 `ZCODE_UPSTREAM_BASE_COMMIT` 带短 hash)
 *    —— jj workspace 无 .git、浅克隆等场景的唯一可靠来源;
 * 2. `refs/remotes/upstream/main`(zai-org/ZCode 官方远程);
 * 3. `refs/remotes/origin/main`(openaddr fork 维护的"上游同步点镜像",见
 *    docs/mae/sync-runbook.md §6);
 * 4. 全部失败 → `unknown`(与 build-metadata 既有 commit 回落口径一致)。
 */

import { execSync } from "node:child_process";

/** 显式覆盖 env:上游基线版本号(如 `3.16.2`)。 */
export const ZCODE_UPSTREAM_BASE_ENV = "ZCODE_UPSTREAM_BASE";
/** 显式覆盖 env:上游基线短 commit(可选)。 */
export const ZCODE_UPSTREAM_BASE_COMMIT_ENV = "ZCODE_UPSTREAM_BASE_COMMIT";

const UPSTREAM_REF_CANDIDATES = ["refs/remotes/upstream/main", "refs/remotes/origin/main"];

function runGitCommand(command, cwd) {
  return execSync(`git ${command}`, {
    cwd,
    stdio: ["ignore", "pipe", "ignore"],
    encoding: "utf-8",
  }).trim();
}

function resolveFromRef(ref, cwd, runGit) {
  // merge-base = mae 栈最后一次同步落位的上游提交;ref 尖可能已前进,不能直接取尖。
  const baseCommit = runGit(`merge-base HEAD ${ref}`, cwd);
  const rootPackageJson = JSON.parse(runGit(`show ${baseCommit}:package.json`, cwd));
  if (typeof rootPackageJson.version !== "string" || rootPackageJson.version.length === 0) {
    throw new Error(`no version in ${ref}@${baseCommit} package.json`);
  }
  return {
    upstreamBase: rootPackageJson.version,
    upstreamBaseCommit: runGit(`rev-parse --short=8 ${baseCommit}`, cwd),
    upstreamBaseSource: ref,
  };
}

/**
 * 解析上游基线。字段名即 build-meta.json 字段名,build-metadata.mjs 直接展开。
 * `runGit` 仅测试注入用,默认走真实 git。
 */
export function resolveUpstreamBase(
  env = process.env,
  cwd = process.cwd(),
  runGit = runGitCommand,
) {
  const overrideVersion = env[ZCODE_UPSTREAM_BASE_ENV]?.trim();
  if (overrideVersion) {
    return {
      upstreamBase: overrideVersion,
      upstreamBaseCommit: env[ZCODE_UPSTREAM_BASE_COMMIT_ENV]?.trim() || "unknown",
      upstreamBaseSource: "env",
    };
  }
  for (const ref of UPSTREAM_REF_CANDIDATES) {
    try {
      return resolveFromRef(ref, cwd, runGit);
    } catch {
      // 该引用不可用(无远程/无 .git/无版本),换下一个候选
    }
  }
  return { upstreamBase: "unknown", upstreamBaseCommit: "unknown", upstreamBaseSource: "none" };
}
