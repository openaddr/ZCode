/** DTS列表 主视图页签(#41 定形:云平台 IssueBoard 同款整页;数据经本地服务 HTTP)。 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { cn } from "@/components/lib/utils.js";
import { DEFAULT_DTS_SERVICE_BASE, dtsIssueOpeningPrompt } from "./useDtsIssues.js";

export interface DtsTicketSummary {
  ticket: string;
  title: string;
  status: string;
  version: string;
  severity: string;
  submitter: string;
  featureName: string;
  actionable: boolean;
}

export interface DtsListPageProps {
  /** 发起成功后在当前窗口开问题会话(草稿),并切回聊天视图。 */
  onIssueStarted: (workspacePath: string, openingBrief: string) => void;
  onSwitchToChat: () => void;
  baseUrl?: string;
}

interface TicketsResponse {
  mock: boolean;
  total: number;
  actionableCount: number;
  tickets: DtsTicketSummary[];
}

interface ModuleBinding {
  moduleName: string;
  repos: string[];
}

const TIERS = [
  { value: "full_auto", label: "全自动", hint: "不问,跑到 MR 绿" },
  { value: "report_first", label: "优先报告", hint: "只在报告停一次" },
  { value: "align_first", label: "优先对齐", hint: "关键节点都确认 · 默认" },
] as const;

export function DtsListPage(props: DtsListPageProps) {
  const { intl } = useZCodeIntl();
  const baseUrl = props.baseUrl ?? DEFAULT_DTS_SERVICE_BASE;
  const [board, setBoard] = useState<TicketsResponse | null>(null);
  const [available, setAvailable] = useState(true);
  const [search, setSearch] = useState("");
  const [starting, setStarting] = useState<DtsTicketSummary | null>(null);
  const [moduleName, setModuleName] = useState("");
  const [modules, setModules] = useState<ModuleBinding[]>([]);
  const [note, setNote] = useState("");
  const [tier, setTier] = useState<(typeof TIERS)[number]["value"]>("align_first");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`${baseUrl}/api/dts/tickets`);
      if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
      setBoard((await response.json()) as TicketsResponse);
      setAvailable(true);
    } catch {
      setAvailable(false);
      setBoard(null);
    }
  }, [baseUrl]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (starting === null) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${baseUrl}/api/modules`);
        const body = (await response.json()) as { modules: ModuleBinding[] };
        if (!cancelled) setModules(body.modules ?? []);
      } catch {
        if (!cancelled) setModules([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [baseUrl, starting]);

  const tickets = useMemo(() => {
    const all = board?.tickets ?? [];
    const query = search.trim();
    if (!query) return all;
    return all.filter((ticket) => ticket.ticket.includes(query) || ticket.title.includes(query));
  }, [board, search]);

  const start = useCallback(async (): Promise<void> => {
    if (starting === null || !moduleName) return;
    setError(null);
    try {
      const response = await fetch(`${baseUrl}/api/issues`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticket: starting.ticket, module: moduleName, interventionTier: tier }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${String(response.status)}`);
      }
      const body = (await response.json()) as { workspace: { workspacePath: string }; openingBrief: string };
      const brief = [body.openingBrief, note.trim() ? `附加信息:${note.trim()}` : ""].filter(Boolean).join("\n");
      props.onIssueStarted(body.workspace.workspacePath, brief || dtsIssueOpeningPrompt(starting.ticket));
      props.onSwitchToChat();
      setStarting(null);
      setModuleName("");
      setNote("");
      void refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [baseUrl, moduleName, note, props, refresh, starting, tier]);

  if (!available) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm" data-testid="mae-dts-list-unavailable">
        {intl.formatMessage({ id: "mae.dts.list.unavailable" })}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto" data-testid="mae-dts-list">
      <div className="flex items-center gap-3 px-6 pt-5">
        <h2 className="text-lg font-semibold">{intl.formatMessage({ id: "mae.dts.list.title" })}</h2>
        {board?.mock ? (
          <span className="rounded-full border border-yellow-600/60 bg-yellow-500/10 px-2 py-0.5 text-xs text-yellow-600">
            {intl.formatMessage({ id: "mae.dts.list.mockBanner" })}
          </span>
        ) : null}
        <Button className="ml-auto" size="sm" data-testid="mae-dts-start" onClick={() => starting === null && setStarting(board?.tickets[0] ?? null)}>
          {intl.formatMessage({ id: "mae.dts.list.start" })}
        </Button>
      </div>
      <p className="px-6 pt-1 text-muted-foreground text-xs">{intl.formatMessage({ id: "mae.dts.list.subtitle" })}</p>
      <div className="flex flex-wrap items-center gap-2 px-6 py-3">
        <Input
          className="h-8 w-64"
          placeholder={intl.formatMessage({ id: "mae.dts.list.search" })}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          data-testid="mae-dts-search"
        />
        <Button variant="ghost" size="sm" onClick={() => void refresh()}>
          {intl.formatMessage({ id: "mae.dts.list.refresh" })}
        </Button>
        <span className="ml-auto text-muted-foreground text-xs">
          {intl.formatMessage({ id: "mae.dts.list.count" }, { count: tickets.length, total: board?.total ?? 0 })}
        </span>
      </div>
      <div className="mx-6 mb-6 min-h-0 flex-1 rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground text-xs">
              <th className="px-3 py-2 font-medium">{intl.formatMessage({ id: "mae.dts.list.ticket" })}</th>
              <th className="px-3 py-2 font-medium">{intl.formatMessage({ id: "mae.dts.list.severity" })}</th>
              <th className="px-3 py-2 font-medium">{intl.formatMessage({ id: "mae.dts.list.status" })}</th>
              <th className="px-3 py-2 font-medium">{intl.formatMessage({ id: "mae.dts.list.action" })}</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((ticket) => (
              <tr key={ticket.ticket} className="border-b last:border-b-0 hover:bg-muted/50">
                <td className="px-3 py-2 font-mono text-xs">{ticket.ticket}</td>
                <td className="px-3 py-2">{ticket.severity}</td>
                <td className="px-3 py-2 text-muted-foreground">{ticket.status}</td>
                <td className="px-3 py-2">
                  <Button variant="ghost" size="sm" onClick={() => setStarting(ticket)}>
                    {intl.formatMessage({ id: "mae.dts.list.start" })}
                  </Button>
                </td>
              </tr>
            ))}
            {tickets.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-muted-foreground" colSpan={4}>
                  {intl.formatMessage({ id: "mae.dts.list.empty" })}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {starting !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" data-testid="mae-dts-start-modal">
          <div className="w-[420px] rounded-xl border bg-card p-4 shadow-lg">
            <h3 className="text-sm font-semibold">{intl.formatMessage({ id: "mae.dts.start.title" })}</h3>
            <div className="mt-3 rounded-md border bg-background px-2 py-1.5 font-mono text-xs">
              {starting.ticket} · {starting.title}
            </div>
            <label className="mt-3 block text-muted-foreground text-xs">{intl.formatMessage({ id: "mae.dts.start.module" })}</label>
            <select
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-xs"
              value={moduleName}
              onChange={(event) => setModuleName(event.target.value)}
              data-testid="mae-dts-start-module"
            >
              <option value="">{intl.formatMessage({ id: "mae.dts.start.modulePlaceholder" })}</option>
              {modules.map((module) => (
                <option key={module.moduleName} value={module.moduleName}>
                  {module.moduleName}({module.repos.length})
                </option>
              ))}
            </select>
            <label className="mt-3 block text-muted-foreground text-xs">{intl.formatMessage({ id: "mae.dts.start.tier" })}</label>
            <div className="mt-1 flex gap-1.5">
              {TIERS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={cn(
                    "flex-1 rounded-lg border px-2 py-1.5 text-center text-xs",
                    tier === item.value ? "border-primary bg-primary/10" : "border-border",
                  )}
                  onClick={() => setTier(item.value)}
                >
                  {item.label}
                  <small className="mt-0.5 block text-muted-foreground">{item.hint}</small>
                </button>
              ))}
            </div>
            <label className="mt-3 block text-muted-foreground text-xs">{intl.formatMessage({ id: "mae.dts.start.note" })}</label>
            <textarea
              className="mt-1 h-16 w-full rounded-md border bg-background px-2 py-1 text-xs"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            {error !== null ? <p className="mt-2 text-destructive text-xs">{error}</p> : null}
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setStarting(null)}>
                {intl.formatMessage({ id: "mae.dts.start.cancel" })}
              </Button>
              <Button size="sm" disabled={moduleName === ""} data-testid="mae-dts-start-confirm" onClick={() => void start()}>
                {intl.formatMessage({ id: "mae.dts.start.confirm" })}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
