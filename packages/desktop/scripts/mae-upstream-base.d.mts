/**
 * mae:mae-upstream-base.mjs 的手写声明(与 mae-identity.d.mts 同一约定:
 * 仓库未开启 allowJs,TS 侧导入本模块时靠本文件获得类型)。
 */
export const ZCODE_UPSTREAM_BASE_ENV: "ZCODE_UPSTREAM_BASE";
export const ZCODE_UPSTREAM_BASE_COMMIT_ENV: "ZCODE_UPSTREAM_BASE_COMMIT";

export interface MaeUpstreamBase {
  readonly upstreamBase: string;
  readonly upstreamBaseCommit: string;
  readonly upstreamBaseSource: string;
}

export type RunGit = (command: string, cwd: string) => string;

export function resolveUpstreamBase(
  env?: Record<string, string | undefined>,
  cwd?: string,
  runGit?: RunGit,
): MaeUpstreamBase;
