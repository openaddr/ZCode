/** DTS 问题会话数据源:轮询本地 dts-flow 服务;服务缺席静默降级(侧栏不渲染分组)。 */
import { useEffect, useMemo, useState } from "react";

export interface DtsIssueRow {
  ticket: string;
  interventionTier: string;
  stage: string;
  stages: Record<string, string>;
  mrDeclarations: Array<{ repo: string; url: string }>;
  closedAt: string | null;
  archived: boolean;
  createdAt: string;
  /** 问题工作区绝对路径(服务下发,不在 UI 拼)。 */
  workspacePath: string;
}

export interface DtsIssuesState {
  /** false = 服务未运行(ECONNREFUSED):调用方不渲染分组。 */
  available: boolean;
  issues: DtsIssueRow[];
}

export const DEFAULT_DTS_SERVICE_BASE = "http://127.0.0.1:8788";

export const DTS_STAGE_LABELS: Record<string, string> = {
  dts_info: "拉单",
  prep_repo: "拉仓",
  analyze: "分析",
  fix: "修复",
  mr_green: "MR 验绿",
};

export function dtsStageLabel(stage: string): string {
  return DTS_STAGE_LABELS[stage] ?? stage;
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
  return (await response.json()) as T;
}

export function useDtsIssues(options: { baseUrl?: string; pollMs?: number } = {}): DtsIssuesState {
  const baseUrl = options.baseUrl ?? DEFAULT_DTS_SERVICE_BASE;
  const pollMs = options.pollMs ?? 8000;
  const [state, setState] = useState<DtsIssuesState>({ available: false, issues: [] });

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const poll = async (): Promise<void> => {
      try {
        const health = await fetchJson<{ ok: boolean }>(`${baseUrl}/api/health`, controller.signal);
        const issuesBody = await fetchJson<{ issues: DtsIssueRow[] }>(`${baseUrl}/api/issues`, controller.signal);
        if (!cancelled) {
          setState({ available: health.ok === true, issues: issuesBody.issues });
        }
      } catch {
        if (!cancelled) setState({ available: false, issues: [] });
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), pollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
      controller.abort();
    };
  }, [baseUrl, pollMs]);

  // 归档/收口单沉底,进行中在前。
  const issues = useMemo(
    () =>
      [...state.issues].sort((a, b) => {
        const aActive = a.archived || a.closedAt !== null ? 1 : 0;
        const bActive = b.archived || b.closedAt !== null ? 1 : 0;
        return aActive - bActive || b.createdAt.localeCompare(a.createdAt);
      }),
    [state.issues],
  );
  return { ...state, issues };
}

/** 续处理首条:已发起过的单重开时自动发出(#68 发起即开跑;发起首条由建单响应 openingBrief 提供)。 */
export function dtsIssueOpeningPrompt(ticket: string): string {
  return `继续处理 DTS 问题单 ${ticket}:先读工作区 .agents/skills/dts-issue-flow/SKILL.md,再按当前阶段推进。`;
}
