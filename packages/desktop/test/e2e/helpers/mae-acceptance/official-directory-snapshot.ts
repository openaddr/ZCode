import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * mae 全局验收(#34):官方用户级目录快照与 diff 纯逻辑。
 *
 * 零交集断言的口径来自 specs/mae/identity-isolation.md「D3 定稿」:
 * `~/.zcode` 的有意共享子树(agent 日志、rollout/debug 轨迹、用户手写 commands)
 * 是双端 append 型共享资产,不纳入"零变化"对比;其余一切条目(含 cli/db、v2、
 * security 等)都必须零 added / removed / changed。`%APPDATA%\ZCode` 无豁免。
 */
export const MAE_D3_INTENTIONAL_SHARED_RELATIVE_EXCLUSIONS: readonly string[] = [
  "commands",
  "cli/log",
  "cli/rollout",
  "cli/debug",
];

/**
 * 官方实例自身运行写入面。仅当检测到官方 ZCode.exe 进程常驻时,从对应官方根的
 * 零交集 diff 豁免这些"官方自己也在写"的不可归属子树——mae 若真的误用官方目录,
 * 启动/单实例的进程级断言(实例起不来或激活官方窗口)会先行失败,这里剔除的只是
 * 双方写入无法归因的灰区。独占机器(官方未运行)时不豁免,全文严格。
 *
 * `%APPDATA%\ZCode`:Chromium sessionData(session/)与 ARMS RUM 本地存储
 * (rum-electron-store/);`~/.zcode`:桌面应用日志(v2/logs,与 D3 豁免的 agent
 * 日志 cli/log 不同轴)、Bots 运行锁租约(v2/bots-runtime-locks)、运行时组件
 * 目录(v2/runtime)。v2 下身份/数据承载文件(setting/credentials/agents-state
 * 等)与一切新增条目仍严格。
 */
export const OFFICIAL_USER_DATA_SELF_CHURN_RELATIVE_EXCLUSIONS: readonly string[] = [
  "session",
  "rum-electron-store",
];
export const OFFICIAL_DATA_ROOT_SELF_CHURN_RELATIVE_EXCLUSIONS: readonly string[] = [
  "v2/logs",
  "v2/bots-runtime-locks",
  "v2/runtime",
];

const DEFAULT_HASH_FILE_LIMIT_BYTES = 256 * 1024;
const DEFAULT_MAX_ENTRIES = 50_000;
const SNAPSHOT_OVERFLOW_MARKER = "__mae_acceptance_snapshot_overflow__";

export interface DirectorySnapshotEntry {
  /** stat/读失败时的错误码(锁文件等被占用场景);前后两次同错误视为未变化。 */
  error?: string;
  mtimeMs?: number;
  /** 仅对 ≤ hashFileLimitBytes 的文件计算,提供内容级零变化证据。 */
  sha1?: string;
  sizeBytes?: number;
  type: "directory" | "file" | "other";
}

export interface DirectorySnapshot {
  entries: Record<string, DirectorySnapshotEntry>;
  /** 根目录在快照时刻不存在。零交集要求"缺失保持缺失",与存在但为空区分。 */
  rootAbsent: boolean;
}

export interface DirectorySnapshotDiffEntry {
  after: DirectorySnapshotEntry;
  before: DirectorySnapshotEntry;
  path: string;
}

export interface DirectorySnapshotDiff {
  added: string[];
  changed: DirectorySnapshotDiffEntry[];
  removed: string[];
}

export function normalizeRelativeSnapshotPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\/+/u, "").replace(/\/+$/u, "");
}

export function isRelativePathExcluded(
  path: string,
  exclusions: readonly string[],
): boolean {
  const normalized = normalizeRelativeSnapshotPath(path);
  if (!normalized) {
    return false;
  }
  return exclusions.some((exclusion) => {
    const normalizedExclusion = normalizeRelativeSnapshotPath(exclusion);
    if (!normalizedExclusion) {
      return false;
    }
    return normalized === normalizedExclusion || normalized.startsWith(`${normalizedExclusion}/`);
  });
}

export interface SnapshotDirectoryTreeOptions {
  /** 超过该尺寸的文件只记录 stat(大 DB/缓存不做内容哈希)。 */
  hashFileLimitBytes?: number;
  /** D3 有意共享子树等豁免(相对根,posix 风格)。 */
  exclusions?: readonly string[];
  maxEntries?: number;
}

export async function snapshotDirectoryTree(
  root: string,
  options: SnapshotDirectoryTreeOptions = {},
): Promise<DirectorySnapshot> {
  const exclusions = options.exclusions ?? [];
  const hashFileLimitBytes = options.hashFileLimitBytes ?? DEFAULT_HASH_FILE_LIMIT_BYTES;
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const entries: Record<string, DirectorySnapshotEntry> = {};

  let rootStat;
  try {
    rootStat = await stat(root);
  } catch (error) {
    if (readErrorCode(error) === "ENOENT") {
      return { entries: {}, rootAbsent: true };
    }
    throw error;
  }
  if (!rootStat.isDirectory()) {
    throw new Error(`[mae-acceptance] snapshot root is not a directory: ${root}`);
  }

  await collectDirectoryEntries(root, "");

  return { entries, rootAbsent: false };

  async function collectDirectoryEntries(directory: string, relativePrefix: string): Promise<void> {
    const dirents = await readdir(directory, { withFileTypes: true }).catch((error: unknown) => {
      recordErrorEntry(relativePrefix || ".", "directory", readErrorCode(error));
      return null;
    });
    if (!dirents) {
      return;
    }
    for (const dirent of [...dirents].sort((left, right) => left.name.localeCompare(right.name))) {
      const relativePath = relativePrefix ? `${relativePrefix}/${dirent.name}` : dirent.name;
      if (isRelativePathExcluded(relativePath, exclusions)) {
        continue;
      }
      if (Object.keys(entries).length >= maxEntries) {
        entries[SNAPSHOT_OVERFLOW_MARKER] = { type: "other" };
        return;
      }
      const absolutePath = join(directory, dirent.name);
      if (dirent.isDirectory()) {
        await recordDirectoryEntry(absolutePath, relativePath);
        await collectDirectoryEntries(absolutePath, relativePath);
      } else if (dirent.isFile()) {
        await recordFileEntry(absolutePath, relativePath);
      } else {
        entries[relativePath] = { type: "other" };
      }
    }
  }

  async function recordDirectoryEntry(absolutePath: string, relativePath: string): Promise<void> {
    try {
      const stats = await stat(absolutePath);
      entries[relativePath] = { mtimeMs: stats.mtimeMs, type: "directory" };
    } catch (error) {
      recordErrorEntry(relativePath, "directory", readErrorCode(error));
    }
  }

  async function recordFileEntry(absolutePath: string, relativePath: string): Promise<void> {
    try {
      const stats = await stat(absolutePath);
      const entry: DirectorySnapshotEntry = {
        mtimeMs: stats.mtimeMs,
        sizeBytes: stats.size,
        type: "file",
      };
      if (stats.size <= hashFileLimitBytes) {
        try {
          const content = await readFile(absolutePath);
          entry.sha1 = createHash("sha1").update(content).digest("hex");
        } catch (error) {
          entry.error = readErrorCode(error);
        }
      }
      entries[relativePath] = entry;
    } catch (error) {
      recordErrorEntry(relativePath, "file", readErrorCode(error));
    }
  }

  function recordErrorEntry(
    relativePath: string,
    type: DirectorySnapshotEntry["type"],
    code: string,
  ): void {
    entries[relativePath] = { error: code, type };
  }
}

function readErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code) {
      return code;
    }
  }
  return "UNKNOWN";
}

export function diffDirectorySnapshots(
  before: DirectorySnapshot,
  after: DirectorySnapshot,
): DirectorySnapshotDiff {
  const added: string[] = [];
  const changed: DirectorySnapshotDiffEntry[] = [];
  const removed: string[] = [];

  for (const path of Object.keys(after.entries)) {
    const afterEntry = after.entries[path];
    const beforeEntry = before.entries[path];
    if (!afterEntry) {
      continue;
    }
    if (!beforeEntry) {
      added.push(path);
      continue;
    }
    if (!directorySnapshotEntriesEqual(beforeEntry, afterEntry)) {
      changed.push({ after: afterEntry, before: beforeEntry, path });
    }
  }
  for (const path of Object.keys(before.entries)) {
    if (!after.entries[path]) {
      removed.push(path);
    }
  }

  return {
    added: [...added].sort(),
    changed: changed.sort((left, right) => left.path.localeCompare(right.path)),
    removed: [...removed].sort(),
  };
}

function directorySnapshotEntriesEqual(
  before: DirectorySnapshotEntry,
  after: DirectorySnapshotEntry,
): boolean {
  // 目录条目按结构比较(存在性/类型),不比 mtime:Windows 上瞬时建删的子项(官方
  // 应用或系统的临时文件)会推动父目录 mtime 却不留下任何持久条目——那不是数据
  // 交集证据;文件条目保持 mtime+size+sha1 全严格。
  if (before.type === "directory" || after.type === "directory") {
    return before.type === after.type && before.error === after.error;
  }
  return (
    before.type === after.type &&
    before.error === after.error &&
    before.sha1 === after.sha1 &&
    before.sizeBytes === after.sizeBytes &&
    before.mtimeMs === after.mtimeMs
  );
}

export function isDirectorySnapshotDiffEmpty(diff: DirectorySnapshotDiff): boolean {
  return diff.added.length === 0 && diff.changed.length === 0 && diff.removed.length === 0;
}

export function serializeDirectorySnapshotDiffForArtifact(diff: DirectorySnapshotDiff): unknown {
  return {
    added: diff.added,
    changed: diff.changed,
    removed: diff.removed,
  };
}
