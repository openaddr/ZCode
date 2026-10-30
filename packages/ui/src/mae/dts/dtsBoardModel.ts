/**
 * DTS 看板纯模型:过滤链/版本组/勾选规则/列宽与草稿持久化。
 * 行为口径对齐 mae-flow-cloud Registration.tsx(openaddr/ZCode#58/#59);IO 只限 localStorage。
 */

export interface BoardTicket {
  ticket: string;
  title: string;
  status: string;
  version: string;
  severity: string;
  submitter: string;
  url: string;
  branch: string | null;
  moduleId: string | null;
  actionable: boolean;
}

export interface BoardBindingEntry {
  moduleId: string;
  updatedBy: string;
  updatedAt: string;
}

/** 本平台问题台账的看板投影:发起状态列与查重的唯一口径。 */
export interface BoardIssueRef {
  ticket: string;
  workspacePath: string;
  closedAt: string | null;
  archived: boolean;
}

export const BOARD_ACTIONABLE_STATUS = "开发人员实施修改";

export const TIER_OPTIONS = [
  { value: "full_auto", label: "全自动" },
  { value: "report_first", label: "优先报告" },
  { value: "align_first", label: "优先对齐" },
] as const;

export type TierValue = (typeof TIER_OPTIONS)[number]["value"];
export const TIER_FOLLOW = "follow";

/** 进行中=未收口且未归档(发起状态列与勾选禁用同尺,ADR 同单查重口径)。 */
export function isLiveIssue(issue: BoardIssueRef): boolean {
  return issue.closedAt === null && !issue.archived;
}

export function liveIssueMap(issues: readonly BoardIssueRef[]): Map<string, BoardIssueRef> {
  const map = new Map<string, BoardIssueRef>();
  for (const issue of issues) {
    if (isLiveIssue(issue)) map.set(issue.ticket, issue);
  }
  return map;
}

/** 模块两层口径:人工改选优先于带出值(云平台 ADR-0056)。 */
export function resolvedModuleOf(
  ticket: string,
  bindings: Readonly<Record<string, BoardBindingEntry>>,
  ticketModuleId: string | null,
): string | null {
  return bindings[ticket]?.moduleId ?? ticketModuleId ?? null;
}

/** 工具栏搜索:单号/标题/版本包含匹配(大小写不敏感)。 */
export function fuzzyFilter(tickets: readonly BoardTicket[], query: string): BoardTicket[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...tickets];
  return tickets.filter((t) =>
    t.ticket.toLowerCase().includes(q)
    || t.title.toLowerCase().includes(q)
    || t.version.toLowerCase().includes(q));
}

/** 列头过滤:单号/标题包含匹配,与工具栏搜索 AND 叠加。 */
export function columnFilter(
  tickets: readonly BoardTicket[],
  ticketFilter: string,
  titleFilter: string,
): BoardTicket[] {
  const byTicket = ticketFilter.trim().toLowerCase();
  const byTitle = titleFilter.trim().toLowerCase();
  if (!byTicket && !byTitle) return [...tickets];
  return tickets.filter((t) =>
    (!byTicket || t.ticket.toLowerCase().includes(byTicket))
    && (!byTitle || t.title.toLowerCase().includes(byTitle)));
}

/** 版本过滤:单据版本剥 B 段后落在勾选组内即命中;空勾选=不过滤。 */
export function versionFilter(tickets: readonly BoardTicket[], selectedGroups: readonly string[]): BoardTicket[] {
  if (selectedGroups.length === 0) return [...tickets];
  return tickets.filter((t) => t.version !== "" && selectedGroups.includes(dtsVersionGroup(t.version)));
}

/** 发起状态过滤:默认只看未发起(云端 load() 复位口径)。 */
export function launchFilter(
  tickets: readonly BoardTicket[],
  liveMap: ReadonlyMap<string, unknown>,
  showUnlaunched: boolean,
  showLaunched: boolean,
): BoardTicket[] {
  if (showUnlaunched && showLaunched) return [...tickets];
  return tickets.filter((t) => (liveMap.has(t.ticket) ? showLaunched : showUnlaunched));
}

/** 版本组:剥尾部 B 段;解析不出返回原串。 */
export function dtsVersionGroup(version: string): string {
  return version.replace(/B\d+$/, "");
}

/** 版本排序键:R/C 段数字;解析不出按 -1(沉底)。 */
export function dtsVersionKey(version: string): [number, number] {
  const match = /R(\d+)C(\d+)/.exec(version);
  return match === null ? [-1, -1] : [Number.parseInt(match[1] ?? "-1", 10), Number.parseInt(match[2] ?? "-1", 10)];
}

export function sortVersionGroupsDesc(groups: readonly string[]): string[] {
  return [...groups].sort((a, b) => {
    const ka = dtsVersionKey(a);
    const kb = dtsVersionKey(b);
    if (ka[0] !== kb[0]) return kb[0] - ka[0];
    if (ka[1] !== kb[1]) return kb[1] - ka[1];
    return b.localeCompare(a);
  });
}

/** 名下可发起单的版本组并集,降序。 */
export function listVersionGroups(tickets: readonly BoardTicket[]): string[] {
  const set = new Set<string>();
  for (const ticket of tickets) {
    if (ticket.actionable && ticket.version) set.add(dtsVersionGroup(ticket.version));
  }
  return sortVersionGroupsDesc([...set]);
}

/** 默认勾选最高 R/C 版本组(R/C 并列最高一并勾选,云端拍板口径)。 */
export function defaultSelectedGroups(groups: readonly string[]): string[] {
  if (groups.length === 0) return [];
  const [maxR, maxC] = dtsVersionKey(groups[0] ?? "");
  return groups.filter((group) => {
    const [r, c] = dtsVersionKey(group);
    return r === maxR && c === maxC;
  });
}

/** 远程补查候选:令牌=字母开头+字母数字下划线连字符(≥5)且含数字;分隔=逗号/顿号/空白(云端同款)。 */
export function dtsNoCandidates(query: string): string[] {
  return query
    .split(/[,，、\s]+/)
    .map((token) => token.trim())
    .filter((token) => /^[A-Za-z][A-Za-z0-9_-]{4,}$/.test(token) && /\d/.test(token));
}

/** 远程补查入列:actionable 且与本地不重。 */
export function mergeRemoteTickets(local: readonly BoardTicket[], remote: readonly BoardTicket[]): BoardTicket[] {
  const extra = remote.filter((r) => r.actionable && !local.some((item) => item.ticket === r.ticket));
  return [...local, ...extra];
}

/** 勾选规则:进行中/未配置分支/未匹配模块的行禁勾(云端同款三禁)。 */
export function selectableTickets(
  tickets: readonly BoardTicket[],
  liveMap: ReadonlyMap<string, unknown>,
  bindings: Readonly<Record<string, BoardBindingEntry>>,
): string[] {
  return tickets
    .filter((t) => !liveMap.has(t.ticket) && t.branch !== null && resolvedModuleOf(t.ticket, bindings, t.moduleId) !== null)
    .map((t) => t.ticket);
}

/** 展示中的单存在未配置分支映射时,红条列出涉及版本组。 */
export function unmappedVersionGroups(tickets: readonly BoardTicket[]): { groups: string[]; versionless: boolean } {
  const groups = new Set<string>();
  let versionless = false;
  for (const ticket of tickets) {
    if (ticket.branch !== null) continue;
    if (ticket.version) groups.add(dtsVersionGroup(ticket.version));
    else versionless = true;
  }
  return { groups: [...groups], versionless };
}

/* ---------- 列管理(显隐+列宽,localStorage 持久化) ---------- */

export type ColumnShownKey = Exclude<BoardColKey, "select" | "ticket">;

export type BoardColKey = "select" | "ticket" | "title" | "launch" | "remark" | "module" | "tier";

export const BOARD_COL_KEYS: readonly BoardColKey[] = ["select", "ticket", "title", "launch", "remark", "module", "tier"];

export const BOARD_COL_DEFAULT: Record<BoardColKey, number> = {
  select: 44, ticket: 150, title: 320, launch: 110, remark: 180, module: 180, tier: 150,
};

export const BOARD_COL_MIN: Record<BoardColKey, number> = {
  select: 40, ticket: 120, title: 160, launch: 90, remark: 100, module: 120, tier: 120,
};

/** 标题列是唯一弹性列:不吃定宽,colgroup 不出宽。 */
export const FLEX_COL_KEY: BoardColKey = "title";

export interface BoardColumnPrefs {
  widths: Record<BoardColKey, number>;
  shown: Record<Exclude<BoardColKey, "select" | "ticket">, boolean>;
}

export function defaultColumnPrefs(): BoardColumnPrefs {
  return {
    widths: { ...BOARD_COL_DEFAULT },
    shown: { title: true, launch: true, remark: true, module: true, tier: true },
  };
}

export function sanitizeColumnPrefs(raw: unknown): BoardColumnPrefs {
  const base = defaultColumnPrefs();
  if (raw === null || typeof raw !== "object") return base;
  const record = raw as Record<string, unknown>;
  const widths = record["widths"];
  if (widths !== null && typeof widths === "object") {
    for (const key of BOARD_COL_KEYS) {
      const value = (widths as Record<string, unknown>)[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        base.widths[key] = Math.min(Math.max(Math.round(value), BOARD_COL_MIN[key]), 800);
      }
    }
  }
  const shown = record["shown"];
  if (shown !== null && typeof shown === "object") {
    for (const key of ["title", "launch", "remark", "module", "tier"] as const) {
      const value = (shown as Record<string, unknown>)[key];
      if (typeof value === "boolean") base.shown[key] = value;
    }
  }
  return base;
}

/* ---------- 草稿持久化(附加信息随单,localStorage;发起成功即清) ---------- */

export function loadRemarks(storage: Storage | null): Record<string, string> {
  if (storage === null) return {};
  try {
    const raw = storage.getItem(REMARKS_STORAGE_KEY);
    if (raw === null) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object") return {};
    const out: Record<string, string> = {};
    for (const [ticket, text] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof text === "string" && text.trim()) out[ticket] = text;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveRemarks(storage: Storage | null, remarks: Readonly<Record<string, string>>): void {
  if (storage === null) return;
  try {
    storage.setItem(REMARKS_STORAGE_KEY, JSON.stringify(remarks));
  } catch {
    /* 隐私模式等存不进就算了,草稿退化为会话内 */
  }
}

export const REMARKS_STORAGE_KEY = "mae-dts-board-remarks-v1";
export const COLUMN_PREFS_STORAGE_KEY = "mae-dts-board-cols-v1";
