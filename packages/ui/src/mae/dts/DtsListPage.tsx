/**
 * DTS列表 主视图页签:云平台 Registration.tsx 完整行为的本地对齐(openaddr/ZCode#58/#59)。
 * 七列看板(勾选/单号/标题/发起状态/附加信息/所属模块/介入档位)+版本组/列头过滤+
 * 列显隐列宽拖拽+勾选批量发起;数据经本地服务 HTTP(同源 mae-flow-cloud,#57)。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button.js";
import { Checkbox } from "@/components/ui/checkbox.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu.js";
import { Input } from "@/components/ui/input.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.js";
import { toast } from "@/components/ui/toast.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { BoardRow, HeaderFilter, VersionGroupSelect } from "./dtsBoardRows.js";
import { setPendingSettingsSectionIntent } from "@/lib/settingsNavigation.js";
import { useOptionalTabStore } from "@/store/TabStoreProvider.js";
import { DEFAULT_DTS_SERVICE_BASE, dtsIssueOpeningPrompt } from "./useDtsIssues.js";
import {
  BOARD_COL_MIN,
  BOARD_COL_KEYS,
  COLUMN_PREFS_STORAGE_KEY,
  FLEX_COL_KEY,
  type BoardBindingEntry,
  type BoardColKey,
  type BoardIssueRef,
  type BoardTicket,
  type ColumnShownKey,
  type TierValue,
  columnFilter,
  dtsNoCandidates,
  defaultColumnPrefs,
  defaultSelectedGroups,
  fuzzyFilter,
  launchFilter,
  listVersionGroups,
  liveIssueMap,
  loadRemarks,
  mergeRemoteTickets,
  resolvedModuleOf,
  sanitizeColumnPrefs,
  saveRemarks,
  selectableTickets,
  unmappedVersionGroups,
  versionFilter,
} from "./dtsBoardModel.js";

export interface DtsListPageProps {
  /** 发起成功后在当前窗口开问题会话(草稿);批量时逐张调用,最后切回聊天视图。 */
  onIssueStarted: (workspacePath: string, openingBrief: string) => void;
  onSwitchToChat: () => void;
  /** 发起状态列点击:打开该单名下进行中的问题会话。 */
  onOpenIssueSession?: (workspacePath: string) => void;
  baseUrl?: string;
}

interface TicketsResponse {
  mock: boolean;
  total: number;
  actionableCount: number;
  tickets: Array<{
    ticket: string;
    title: string;
    status: string;
    version: string;
    severity: string;
    submitter: string;
    url: string;
    branch: string | null;
    moduleId: string | null;
  }>;
}

interface ModuleCatalogResponse {
  modules: Array<{ id: string; name: string; repositories: string[] }>;
}

interface PeopleResponse {
  people: Array<{ username: string; displayName: string | null }>;
}

interface IssueListResponse {
  issues: Array<{ ticket: string; workspacePath: string; closedAt: string | null; archived: boolean }>;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const detail = typeof body["error"] === "string" ? body["error"] : `HTTP ${String(response.status)}`;
    throw new Error(detail);
  }
  return body as T;
}

export function DtsListPage(props: DtsListPageProps) {
  const { intl } = useZCodeIntl();
  const baseUrl = props.baseUrl ?? DEFAULT_DTS_SERVICE_BASE;
  const [tickets, setTickets] = useState<BoardTicket[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** 加载失败分层:stopped=进程不在;unconfigured=服务在但未配云平台地址;error=其余(带详情)。 */
  const [loadFailure, setLoadFailure] = useState<"stopped" | "unconfigured" | "error" | null>(null);
  // 无 Provider(单测)时为 null:仅跳过开设置页动作,意图照发
  const tabStore = useOptionalTabStore((state) => state);
  const [mock, setMock] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [owner, setOwner] = useState<string | null>(null);
  const [people, setPeople] = useState<Array<{ username: string; displayName: string | null }> | null>(null);
  const [modules, setModules] = useState<Array<{ id: string; name: string; repositories: string[] }>>([]);
  const [bindings, setBindings] = useState<Record<string, BoardBindingEntry>>({});
  const [issues, setIssues] = useState<BoardIssueRef[]>([]);
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<{ loading: boolean; tickets: BoardTicket[] }>({ loading: false, tickets: [] });
  const [selectedVersions, setSelectedVersions] = useState<string[]>([]);
  /** 默认勾选最高版本组只在首拉时发生一次,之后用户全权接管(云端口径)。 */
  const didDefaultVersions = useRef(false);
  const [ticketFilter, setTicketFilter] = useState("");
  const [titleFilter, setTitleFilter] = useState("");
  const [showUnlaunched, setShowUnlaunched] = useState(true);
  const [showLaunched, setShowLaunched] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [remarkEditing, setRemarkEditing] = useState<string | null>(null);
  const [remarkDraft, setRemarkDraft] = useState("");
  const [tiers, setTiers] = useState<Record<string, TierValue>>({});
  const [columnPrefs, setColumnPrefs] = useState(defaultColumnPrefs);
  const [resizing, setResizing] = useState<{ key: BoardColKey; startX: number; startWidth: number } | null>(null);
  const [bindingTicket, setBindingTicket] = useState<string | null>(null);
  const [bindingFail, setBindingFail] = useState<{ ticket: string; message: string } | null>(null);
  const [launching, setLaunching] = useState(false);

  /* ---------- 数据加载 ---------- */

  const loadBoard = useCallback(
    async (ownerId: string) => {
      setError(null);
      try {
        const health = await fetchJson<{ mock: boolean; employeeId: string }>(`${baseUrl}/api/health`);
        setMock(health.mock);
        setEmployeeId(health.employeeId);
        if (!health.mock) {
          const configSummary = await fetchJson<{ cloudBaseUrl?: string | null }>(`${baseUrl}/api/config`).catch(() => null);
          if (configSummary !== null && !configSummary.cloudBaseUrl) {
            setLoadFailure("unconfigured");
            setTickets(null);
            return;
          }
        }
        setLoadFailure(null);
        const effective = ownerId || health.employeeId;
        const board = await fetchJson<TicketsResponse>(`${baseUrl}/api/dts/tickets?owner=${encodeURIComponent(effective)}`);
        setTickets(board.tickets.map((ticket) => ({ ...ticket, actionable: ticket.status === "开发人员实施修改" })));
        try {
          const issueList = await fetchJson<IssueListResponse>(`${baseUrl}/api/issues`);
          setIssues(issueList.issues.map((issue) => ({
            ticket: issue.ticket, workspacePath: issue.workspacePath, closedAt: issue.closedAt, archived: issue.archived,
          })));
        } catch {
          setIssues([]);
        }
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        setLoadFailure(/Failed to fetch|NetworkError|ECONNREFUSED|fetch failed/i.test(message) ? "stopped" : "error");
        setTickets(null);
        setError(message);
      }
    },
    [baseUrl],
  );

  useEffect(() => {
    setColumnPrefs(sanitizeColumnPrefs(safeStorageGet(COLUMN_PREFS_STORAGE_KEY)));
    setRemarks(loadRemarks(safeStorage()));
  }, []);

  useEffect(() => {
    void loadBoard(owner ?? "");
  }, [loadBoard, owner]);

  useEffect(() => {
    void (async () => {
      try {
        const catalog = await fetchJson<ModuleCatalogResponse>(`${baseUrl}/api/modules`);
        setModules(catalog.modules ?? []);
      } catch {
        setModules([]);
      }
      try {
        const peopleBody = await fetchJson<PeopleResponse>(`${baseUrl}/api/dts/people`);
        setPeople(peopleBody.people ?? []);
      } catch {
        setPeople(null);
      }
      try {
        const bindingsBody = await fetchJson<{ bindings: Record<string, BoardBindingEntry> }>(`${baseUrl}/api/dts/bindings`);
        setBindings(bindingsBody.bindings ?? {});
      } catch {
        setBindings({});
      }
    })();
  }, [baseUrl]);

  /** 远程补查:本地搜索无命中且输入像单号时,防抖查单详情入列(云端同款防抖+序号守卫)。 */
  const remoteSeq = useRef(0);
  useEffect(() => {
    const candidates = dtsNoCandidates(query);
    const localEmpty = tickets !== null && fuzzyFilter(tickets, query).length === 0;
    if (tickets === null || !query.trim() || candidates.length === 0 || !localEmpty) {
      setRemote({ loading: false, tickets: [] });
      return;
    }
    const seq = ++remoteSeq.current;
    setRemote({ loading: true, tickets: [] });
    const timer = setTimeout(async () => {
      const results = await Promise.all(candidates.map(async (no) => {
        try {
          const detail = await fetchJson<BoardTicket & { description?: string }>(`${baseUrl}/api/dts/tickets/${encodeURIComponent(no)}`);
          return { ticket: detail.ticket, title: detail.title, status: detail.status, version: detail.version, severity: detail.severity, submitter: detail.submitter, url: detail.url, branch: detail.branch, moduleId: detail.moduleId, actionable: detail.status === "开发人员实施修改" };
        } catch {
          return null;
        }
      }));
      if (remoteSeq.current !== seq) return;
      setRemote({ loading: false, tickets: results.filter((row): row is BoardTicket => row !== null) });
    }, 500);
    return () => clearTimeout(timer);
  }, [baseUrl, query, tickets]);

  /* ---------- 过滤链与派生 ---------- */

  const liveMap = useMemo(() => liveIssueMap(issues), [issues]);
  const localMatches = useMemo(() => (tickets === null ? undefined : fuzzyFilter(tickets, query)), [tickets, query]);
  const display = useMemo(() => {
    if (localMatches === undefined) return [];
    const merged = mergeRemoteTickets(versionFilter(columnFilter(localMatches, ticketFilter, titleFilter), selectedVersions), remote.tickets);
    return launchFilter(merged, liveMap, showUnlaunched, showLaunched);
  }, [localMatches, ticketFilter, titleFilter, selectedVersions, remote.tickets, liveMap, showUnlaunched, showLaunched]);
  const displayTotal = (localMatches?.length ?? 0) + remote.tickets.length;

  const versionChoices = useMemo(() => listVersionGroups(tickets ?? []), [tickets]);
  /** 首次拿到单据:默认勾选最高版本组(云端拍板口径);此后用户全权接管。 */
  useEffect(() => {
    if (tickets === null || didDefaultVersions.current) return;
    didDefaultVersions.current = true;
    setSelectedVersions(defaultSelectedGroups(listVersionGroups(tickets)));
  }, [tickets]);

  const unmapped = useMemo(() => unmappedVersionGroups(display), [display]);
  const selectable = useMemo(() => selectableTickets(display, liveMap, bindings), [display, liveMap, bindings]);
  const displayedSelectedCount = selectable.filter((no) => selected.includes(no)).length;
  const allDisplayedSelected = selectable.length > 0 && displayedSelectedCount === selectable.length;

  /** 勾选范围限定展示列表;已勾但被过滤掉的单不在展示列表,保持原样,发起时照常带上。 */
  function toggleSelectAll() {
    if (allDisplayedSelected) {
      const shown = new Set(selectable);
      setSelected((current) => current.filter((no) => !shown.has(no)));
    } else {
      setSelected((current) => [...new Set([...current, ...selectable])]);
    }
  }

  /* ---------- 列管理 ---------- */

  function updateColumnPrefs(next: { widths?: Partial<Record<BoardColKey, number>>; shown?: Partial<Record<ColumnShownKey, boolean>> }) {
    setColumnPrefs((current) => {
      const merged = { widths: { ...current.widths, ...next.widths }, shown: { ...current.shown, ...next.shown } };
      safeStorageSet(COLUMN_PREFS_STORAGE_KEY, JSON.stringify(merged));
      return merged;
    });
  }

  useEffect(() => {
    if (resizing === null) return;
    function onMove(event: PointerEvent) {
      if (resizing === null) return;
      const delta = event.clientX - resizing.startX;
      const min = BOARD_COL_MIN[resizing.key];
      const width = Math.max(min, Math.min(Math.round(resizing.startWidth + delta), 800));
      updateColumnPrefs({ widths: { [resizing.key]: width } });
    }
    function onUp() {
      setResizing(null);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [resizing]);

  /* ---------- 行为 ---------- */

  function refresh() {
    setQuery("");
    setSelected([]);
    setSelectedVersions([]);
    setTicketFilter("");
    setTitleFilter("");
    setShowUnlaunched(true);
    setShowLaunched(false);
    void loadBoard(owner ?? "");
  }

  function saveRemarkDraft() {
    if (remarkEditing === null) return;
    const ticketNo = remarkEditing;
    setRemarks((current) => {
      const next = { ...current };
      if (remarkDraft.trim()) next[ticketNo] = remarkDraft;
      else delete next[ticketNo];
      saveRemarks(safeStorage(), next);
      return next;
    });
    setRemarkEditing(null);
  }

  async function changeModule(ticketNo: string, moduleId: string) {
    setBindingTicket(ticketNo);
    setBindingFail(null);
    try {
      await fetchJson(`${baseUrl}/api/dts/bindings/${encodeURIComponent(ticketNo)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ module_id: moduleId === "" ? null : moduleId }),
      });
      setBindings((current) => {
        const next = { ...current };
        if (moduleId) next[ticketNo] = { moduleId, updatedBy: employeeId, updatedAt: new Date().toISOString() };
        else delete next[ticketNo];
        return next;
      });
    } catch (caught) {
      setBindingFail({ ticket: ticketNo, message: caught instanceof Error ? caught.message : String(caught) });
    } finally {
      setBindingTicket(null);
    }
  }

  /** 批量发起:逐张串行,单张失败不拖垮整批(云端同款);成功切聊天+toast,失败保勾选与原因。 */
  async function launchSelected() {
    if (selected.length === 0 || launching) return;
    setLaunching(true);
    const failures: string[] = [];
    let succeeded = 0;
    try {
      for (const ticketNo of selected) {
        const clash = liveMap.get(ticketNo);
        if (clash) {
          failures.push(`${ticketNo} → 已有进行中的问题会话`);
          continue;
        }
        const ticket = tickets?.find((item) => item.ticket === ticketNo) ?? remote.tickets.find((item) => item.ticket === ticketNo);
        const moduleId = resolvedModuleOf(ticketNo, bindings, ticket?.moduleId ?? null);
        if (!moduleId) {
          failures.push(`${ticketNo} → 未匹配到业务模块,发起被拦`);
          continue;
        }
        const tier = tiers[ticketNo];
        try {
          const started = await fetchJson<{ workspace: { workspacePath: string }; openingBrief: string }>(`${baseUrl}/api/issues`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              ticket: ticketNo,
              module: moduleId,
              ...(tier ? { interventionTier: tier } : {}),
            }),
          });
          succeeded += 1;
          const brief = [started.openingBrief, remarks[ticketNo]?.trim() ? `附加信息:${remarks[ticketNo]?.trim()}` : ""]
            .filter(Boolean)
            .join("\n");
          props.onIssueStarted(started.workspace.workspacePath, brief || dtsIssueOpeningPrompt(ticketNo));
          setRemarks((current) => {
            const next = { ...current };
            delete next[ticketNo];
            saveRemarks(safeStorage(), next);
            return next;
          });
          setTiers((current) => {
            const next = { ...current };
            delete next[ticketNo];
            return next;
          });
        } catch (caught) {
          failures.push(`${ticketNo} → ${caught instanceof Error ? caught.message : String(caught)}`);
        }
      }
      setSelected((current) => current.filter((no) => failures.some((failure) => failure.startsWith(`${no} `))));
      if (succeeded > 0) props.onSwitchToChat();
      toast(intl.formatMessage(
        { id: "mae.dts.list.batchToast" },
        { success: succeeded, failed: failures.length },
      ) + (failures.length > 0 ? `\n${failures.join("\n")}` : ""), { variant: failures.length > 0 ? "warning" : undefined });
      void loadBoard(owner ?? "");
    } finally {
      setLaunching(false);
    }
  }

  /* ---------- 渲染 ---------- */

  if (loadFailure !== null) {
    const hintId =
      loadFailure === "stopped"
        ? "mae.dts.list.hint.stopped"
        : loadFailure === "unconfigured"
          ? "mae.dts.list.hint.unconfigured"
          : "mae.dts.list.unavailable";
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground text-sm"
        data-testid="mae-dts-list-unavailable"
        data-failure={loadFailure}
      >
        <p data-testid={`mae-dts-hint-${loadFailure}`}>{intl.formatMessage({ id: hintId })}</p>
        {loadFailure !== "error" ? (
          <Button
            size="sm"
            data-testid="mae-dts-open-settings"
            onClick={() => {
              setPendingSettingsSectionIntent("dtsFlow");
              tabStore?.openSettingsTab();
            }}
          >
            {intl.formatMessage({ id: "mae.dts.list.hint.openSettings" })}
          </Button>
        ) : null}
        <Button variant="outline" size="sm" data-testid="mae-dts-retry" onClick={() => void loadBoard(owner ?? "")}>
          {intl.formatMessage({ id: "mae.dts.list.retry" })}
        </Button>
        {loadFailure === "error" && error !== null ? <p className="max-w-xl text-center text-xs">{error}</p> : null}
      </div>
    );
  }

  const visibleCols = (key: ColumnShownKey) => columnPrefs.shown[key];
  const colWidth = (key: BoardColKey) => (key === FLEX_COL_KEY ? undefined : columnPrefs.widths[key]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto" data-testid="mae-dts-list">
      <div className="flex flex-col px-6 py-5">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">{intl.formatMessage({ id: "mae.dts.list.title" })}</h2>
          {mock ? (
            <span className="rounded-full border border-yellow-500/25 bg-yellow-500/10 px-2 py-0.5 text-xs text-yellow-500/90">
              {intl.formatMessage({ id: "mae.dts.list.mockBanner" })}
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-muted-foreground text-xs">{intl.formatMessage({ id: "mae.dts.list.owner" })}</span>
            {people !== null ? (
              <Select value={owner ?? employeeId} onValueChange={(value) => setOwner(value)}>
                <SelectTrigger className="h-8 w-40 text-xs" aria-label={intl.formatMessage({ id: "mae.dts.list.owner" })}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {people.map((person) => (
                    <SelectItem key={person.username} value={person.username}>
                      {person.displayName ?? person.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                className="h-8 w-40 text-xs"
                placeholder={intl.formatMessage({ id: "mae.dts.list.ownerFallback" })}
                defaultValue={owner ?? employeeId}
                onBlur={(event) => setOwner(event.target.value.trim())}
              />
            )}
          </div>
        </div>
        <p className="pt-1 text-muted-foreground text-xs">{intl.formatMessage({ id: "mae.dts.list.subtitle" })}</p>

        <div className="flex flex-wrap items-center gap-2 py-3">
          <Input
            className="h-8 w-72"
            placeholder={intl.formatMessage({ id: "mae.dts.list.search" })}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            data-testid="mae-dts-search"
          />
          <VersionGroupSelect
            groups={versionChoices}
            selected={selectedVersions}
            unmapped={unmapped.groups}
            onChange={(next) => setSelectedVersions(next)}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" data-testid="mae-dts-columns">
                {intl.formatMessage({ id: "mae.dts.list.columns" })}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {(["title", "launch", "remark", "module", "tier"] as const).map((key) => (
                <label key={key} className="flex min-h-8 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm hover:bg-hover">
                  <Checkbox
                    checked={visibleCols(key)}
                    onCheckedChange={(checked) => updateColumnPrefs({ shown: { [key]: checked === true } as Record<ColumnShownKey, boolean> })}
                  />
                  {intl.formatMessage({ id: `mae.dts.list.col.${key}` })}
                </label>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="ml-auto text-muted-foreground text-xs">
            {intl.formatMessage({ id: "mae.dts.list.count" }, { count: display.length, total: displayTotal })}
          </span>
          <Button variant="ghost" size="sm" onClick={refresh} data-testid="mae-dts-refresh">
            {intl.formatMessage({ id: "mae.dts.list.refresh" })}
          </Button>
          <Button
            size="sm"
            disabled={selected.length === 0 || launching}
            data-testid="mae-dts-start"
            onClick={() => void launchSelected()}
          >
            {launching
              ? intl.formatMessage({ id: "mae.dts.list.launching" })
              : intl.formatMessage({ id: "mae.dts.list.start" })}
          </Button>
        </div>

        {unmapped.groups.length > 0 || unmapped.versionless ? (
          <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-xs" role="alert" data-testid="mae-dts-unmapped-banner">
            {intl.formatMessage(
              { id: "mae.dts.list.unmappedBanner" },
              { groups: unmapped.groups.join("、") },
            )}
            {unmapped.versionless ? ` ${intl.formatMessage({ id: "mae.dts.list.unmappedVersionless" })}` : ""}
          </div>
        ) : null}

        <div className="mb-6 overflow-x-auto rounded-lg border border-card-border" data-testid="mae-dts-table">
          <table
            className="w-full table-fixed text-sm"
            style={{ minWidth: BOARD_COL_KEYS.reduce((sum, key) => sum + (key === FLEX_COL_KEY ? BOARD_COL_MIN[FLEX_COL_KEY] : columnPrefs.widths[key]), 0) }}
          >
            <colgroup>
              {BOARD_COL_KEYS.filter((key) => key === "select" || key === "ticket" || visibleCols(key as ColumnShownKey)).map((key) => (
                <col key={key} {...(colWidth(key) === undefined ? {} : { width: colWidth(key) })} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b border-card-border text-left text-muted-foreground text-xs">
                <th className="px-2 py-2 font-medium">
                  <Checkbox
                    aria-label="全选展示中的问题单"
                    checked={allDisplayedSelected ? true : displayedSelectedCount > 0 ? "indeterminate" : false}
                    onCheckedChange={() => toggleSelectAll()}
                    data-testid="mae-dts-select-all"
                  />
                </th>
                <th className="px-3 py-2 font-medium">
                  <HeaderFilter label={intl.formatMessage({ id: "mae.dts.list.col.ticket" })} active={ticketFilter.trim().length > 0} onClear={() => setTicketFilter("")}>
                    <Input autoFocus className="h-8 w-full text-sm" placeholder={intl.formatMessage({ id: "mae.dts.list.filterTicket" })} value={ticketFilter} onChange={(event) => setTicketFilter(event.target.value)} />
                  </HeaderFilter>
                </th>
                {visibleCols("title") ? (
                  <th className="px-3 py-2 font-medium">
                    <HeaderFilter label={intl.formatMessage({ id: "mae.dts.list.col.title" })} active={titleFilter.trim().length > 0} onClear={() => setTitleFilter("")}>
                      <Input autoFocus className="h-8 w-full text-sm" placeholder={intl.formatMessage({ id: "mae.dts.list.filterTitle" })} value={titleFilter} onChange={(event) => setTitleFilter(event.target.value)} />
                    </HeaderFilter>
                  </th>
                ) : null}
                {visibleCols("launch") ? (
                  <th className="px-3 py-2 font-medium">
                    <HeaderFilter label={intl.formatMessage({ id: "mae.dts.list.col.launch" })} active={showUnlaunched !== showLaunched} onClear={() => { setShowUnlaunched(true); setShowLaunched(false); }}>
                      <div className="flex flex-col gap-1">
                        {/* mae: 不用 label 包 Radix Checkbox——label 点击转发放大后勾选翻两次(jsdom/实机双坑) */}
                        <span className="flex cursor-pointer items-center gap-2 text-sm">
                          <Checkbox checked={showUnlaunched} onCheckedChange={(checked) => setShowUnlaunched(checked === true)} />
                          {intl.formatMessage({ id: "mae.dts.list.unlaunched" })}
                        </span>
                        <span className="flex cursor-pointer items-center gap-2 text-sm">
                          <Checkbox checked={showLaunched} onCheckedChange={(checked) => setShowLaunched(checked === true)} data-testid="mae-dts-show-launched" />
                          {intl.formatMessage({ id: "mae.dts.list.showLaunched" })}
                        </span>
                      </div>
                    </HeaderFilter>
                  </th>
                ) : null}
                {visibleCols("remark") ? <th className="px-3 py-2 font-medium">{intl.formatMessage({ id: "mae.dts.list.col.remark" })}</th> : null}
                {visibleCols("module") ? <th className="px-3 py-2 font-medium">{intl.formatMessage({ id: "mae.dts.list.col.module" })}</th> : null}
                {visibleCols("tier") ? <th className="px-3 py-2 font-medium">{intl.formatMessage({ id: "mae.dts.list.col.tier" })}</th> : null}
              </tr>
            </thead>
            <tbody>
              {display.map((ticket) => (
                <BoardRow
                  key={ticket.ticket}
                  ticket={ticket}
                  shown={columnPrefs.shown}
                  widths={columnPrefs.widths}
                  selected={selected.includes(ticket.ticket)}
                  liveIssue={liveMap.get(ticket.ticket) ?? null}
                  resolvedModule={resolvedModuleOf(ticket.ticket, bindings, ticket.moduleId)}
                  bindingFailMessage={bindingFail?.ticket === ticket.ticket ? bindingFail.message : null}
                  bindingPending={bindingTicket === ticket.ticket}
                  remark={remarks[ticket.ticket] ?? ""}
                  tier={tiers[ticket.ticket] ?? null}
                  modules={modules}
                  onToggleSelect={() => {
                    setSelected((current) => current.includes(ticket.ticket)
                      ? current.filter((no) => no !== ticket.ticket)
                      : [...current, ticket.ticket]);
                  }}
                  onEditRemark={() => {
                    setRemarkDraft(remarks[ticket.ticket] ?? "");
                    setRemarkEditing(ticket.ticket);
                  }}
                  onChangeModule={(moduleId) => void changeModule(ticket.ticket, moduleId)}
                  onChangeTier={(tier) => {
                    setTiers((current) => {
                      const next = { ...current };
                      if (tier === null) delete next[ticket.ticket];
                      else next[ticket.ticket] = tier;
                      return next;
                    });
                  }}
                  onOpenIssueSession={props.onOpenIssueSession}
                  onResizeStart={(key, event) => {
                    event.preventDefault();
                    setResizing({ key, startX: event.clientX, startWidth: columnPrefs.widths[key] });
                  }}
                />
              ))}
              {display.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-muted-foreground" colSpan={7}>
                    {tickets === null
                      ? intl.formatMessage({ id: "mae.dts.list.loading" })
                      : remote.loading
                        ? intl.formatMessage({ id: "mae.dts.list.remoteLooking" })
                        : intl.formatMessage({ id: "mae.dts.list.empty" })}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={remarkEditing !== null} onOpenChange={(open) => !open && setRemarkEditing(null)}>
        <DialogContent className="w-[460px]">
          <DialogHeader>
            <DialogTitle>{intl.formatMessage({ id: "mae.dts.list.remarkEdit" })}</DialogTitle>
            <DialogDescription>{remarkEditing ?? ""}</DialogDescription>
          </DialogHeader>
          <textarea
            className="h-28 w-full rounded-md border border-input-border bg-background px-2 py-1 text-xs"
            value={remarkDraft}
            onChange={(event) => setRemarkDraft(event.target.value)}
            data-testid="mae-dts-remark-input"
          />
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setRemarkEditing(null)}>
              {intl.formatMessage({ id: "mae.dts.remark.cancel" })}
            </Button>
            <Button size="sm" onClick={saveRemarkDraft} data-testid="mae-dts-remark-save">
              {intl.formatMessage({ id: "mae.dts.remark.save" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function safeStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function safeStorageGet(key: string): unknown {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    /* 隐私模式存不进就算了 */
  }
}
