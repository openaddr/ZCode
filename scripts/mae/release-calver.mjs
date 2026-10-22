/**
 * mae 发布入口:CalVer 版本决策 + release-it 透传——specs/mae/versioning-branding.md(#11)。
 *
 * 根 package.json 的 `release` 脚本指向本包装(默认语义化 bump 不适用于 CalVer):
 * - `pnpm release` → 自动计算:当日首发 `YYYY.MMDD.0`,同日多发 PATCH 递增;
 * - `pnpm release 2026.1023.0` → 显式指定(必须是合法 CalVer,否则拒绝);
 * - 其余参数(如 `--dry-run`、`-n`)原样透传给 release-it,配置仍读 .release-it.mjs。
 *
 * 版本比较/递增语义的唯一所有者是 ./calver.mjs(P3 更新通道复用),本文件只做参数
 * 解析与进程转发,不含版本逻辑。
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { resolveReleaseVersion } from "./calver.mjs";

const rootPackageJsonPath = resolve(import.meta.dirname, "../../package.json");

function resolveReleaseItBinPath() {
  const require = createRequire(import.meta.url);
  const releaseItPackageJsonPath = require.resolve("release-it/package.json");
  const releaseItDir = dirname(releaseItPackageJsonPath);
  const releaseItPackage = JSON.parse(readFileSync(releaseItPackageJsonPath, "utf-8"));
  const binRelativePath = releaseItPackage.bin?.["release-it"] ?? "bin/release-it.js";
  return join(releaseItDir, binRelativePath);
}

const args = process.argv.slice(2);
const rootVersion = JSON.parse(readFileSync(rootPackageJsonPath, "utf-8")).version;
const { version, source } = resolveReleaseVersion(args, { currentVersion: rootVersion });

// 显式版本已转成本包装的 --increment;透传里残留的 --increment* 一律剥除,防绕过 CalVer
const passthroughArgs = args.filter((arg) => arg !== version && !arg.startsWith("--increment"));
process.stdout.write(
  `[release-calver] ${source === "computed" ? "自动计算" : "显式指定"}版本:${version}\n`,
);

const result = spawnSync(
  process.execPath,
  [resolveReleaseItBinPath(), `--increment=${version}`, ...passthroughArgs],
  { stdio: "inherit" },
);
process.exit(result.status ?? (result.error ? 1 : 0));
