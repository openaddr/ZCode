/** 问题会话 composer 上方「处理阶段」块(#41 定形):阶段条投影+分析确认闸按钮;数据轮询本地服务。 */
import { useEffect, useState } from "react";

import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { Button } from "@/components/ui/button.js";
import { cn } from "@/components/lib/utils.js";
import { logger } from "@/logger.js";
import { useDtsIssueSessionSender } from "./useDtsIssueLauncher.js";
import { DEFAULT_DTS_SERVICE_BASE, DTS_STAGE_LABELS } from "./useDtsIssues.js";

export interface DtsIssueLedgerSnapshot {
  ticket: string;
  stage: string;
  stages: Record<string, string>;
  analysisGate: { status: string; askedAt: string; answeredAt: string | null } | null;
  closedAt: string | null;
  archived: boolean;
}

const STAGE_ORDER = ["dts_info", "prep_repo", "analyze", "fix", "mr_green"];

/** 工作区目录名反解单号(发起目录约定 <issuesRoot>/<单号>);非单号形态不轮询。 */
export function deriveTicketFromWorkspacePath(workspacePath: string | undefined): string | null {
  if (!workspacePath) return null;
  const base = workspacePath.replace(/[\\/]+$/, "").split(/[\\/]/).at(-1) ?? "";
  return /^[A-Za-z][A-Za-z0-9_-]*-\d+$/.test(base) ? base : null;
}

export function useDtsIssueStage(options: {
  workspacePath?: string;
  baseUrl?: string;
  pollMs?: number;
}): DtsIssueLedgerSnapshot | null {
  const ticket = deriveTicketFromWorkspacePath(options.workspacePath);
  const baseUrl = options.baseUrl ?? DEFAULT_DTS_SERVICE_BASE;
  const [ledger, setLedger] = useState<DtsIssueLedgerSnapshot | null>(null);

  useEffect(() => {
    if (ticket === null) return;
    const controller = new AbortController();
    const poll = async (): Promise<void> => {
      try {
        const response = await fetch(`${baseUrl}/api/issues/${encodeURIComponent(ticket)}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          setLedger(null);
          return;
        }
        setLedger((await response.json()) as DtsIssueLedgerSnapshot);
      } catch {
        setLedger(null);
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), options.pollMs ?? 5000);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [baseUrl, options.pollMs, ticket]);

  return ledger;
}

export function DtsStageSection(props: { workspacePath?: string; separated?: boolean; baseUrl?: string }) {
  const { intl } = useZCodeIntl();
  const ledger = useDtsIssueStage({ workspacePath: props.workspacePath, baseUrl: props.baseUrl });
  const sendToSession = useDtsIssueSessionSender();
  const [acting, setActing] = useState(false);
  if (ledger === null) return null;

  const answerGate = async (confirm: boolean): Promise<void> => {
    setActing(true);
    try {
      await fetch(`${DEFAULT_DTS_SERVICE_BASE}/api/issues/${encodeURIComponent(ledger.ticket)}/analysis-gate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm }),
      });
      // 云平台同语义(#68):闸裁决后代发续聊词泵起 Agent 下一回合——放行继续修复,
      // 打回按闸结果修订重报;失败(会话已关)只留痕不阻断,闸状态已落账。
      if (props.workspacePath) {
        const pumped = await sendToSession(
          props.workspacePath,
          intl.formatMessage({ id: confirm ? "mae.dts.stage.gateApproved" : "mae.dts.stage.gateRejected" }),
        );
        if (!pumped.ok) {
          logger.warn("[dts-stage] 闸后续聊词发送失败", { ticket: ledger.ticket, message: pumped.message });
        }
      }
    } finally {
      setActing(false);
    }
  };

  return (
    <div
      className={cn("rounded-lg border px-2.5 py-2 text-xs", props.separated && "mt-2 border-t")}
      data-testid="mae-dts-stage"
    >
      <div className="flex items-center gap-2">
        <span className="font-medium text-muted-foreground">{intl.formatMessage({ id: "mae.dts.stage.heading" })}</span>
        <span className="ml-auto font-mono text-muted-foreground">{ledger.ticket}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {STAGE_ORDER.map((stage, index) => {
          const status = ledger.stages[stage] ?? "pending";
          const cls =
            status === "done"
              ? "bg-muted text-muted-foreground"
              : ledger.stage === stage
                ? "border-primary bg-primary/10 font-medium"
                : "border-border text-muted-foreground";
          return (
            <span key={stage} className="flex items-center gap-1">
              {index > 0 ? <span className="text-muted-foreground">→</span> : null}
              <span className={cn("rounded-md px-1.5 py-0.5", cls)}>
                {DTS_STAGE_LABELS[stage] ?? stage}
              </span>
            </span>
          );
        })}
        {ledger.closedAt !== null ? <span className="ml-1 text-green-600">{intl.formatMessage({ id: "mae.dts.stage.closed" })}</span> : null}
      </div>
      {ledger.analysisGate?.status === "waiting" ? (
        <div className="mt-1.5 flex items-center gap-2 rounded-md border border-dashed border-yellow-600/60 bg-yellow-500/10 px-2 py-1.5">
          <span>{intl.formatMessage({ id: "mae.dts.stage.gateWaiting" })}</span>
          <Button
            className="ml-auto"
            disabled={acting}
            size="sm"
            variant="ghost"
            onClick={() => void answerGate(false)}
          >
            {intl.formatMessage({ id: "mae.dts.stage.gateReject" })}
          </Button>
          <Button disabled={acting} size="sm" data-testid="mae-dts-gate-confirm" onClick={() => void answerGate(true)}>
            {intl.formatMessage({ id: "mae.dts.stage.gateConfirm" })}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
