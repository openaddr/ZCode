/** 阶段台账的领域类型与纯状态转移;持久化(原子写/事件流)在 adapters/ledgerStore。 */

/** 有单五阶段(云端同名词;阶段真相在服务,Agent 只读投影)。 */
export type IssueStage = "dts_info" | "prep_repo" | "analyze" | "fix" | "mr_green";

export const ISSUE_STAGES: readonly IssueStage[] = ["dts_info", "prep_repo", "analyze", "fix", "mr_green"];

export type StageStatus = "pending" | "in_progress" | "done" | "redo";

/** 介入档位(#43 决议:全自动/优先报告/优先对齐;本地默认优先对齐)。 */
export type InterventionTier = "full_auto" | "report_first" | "align_first";

export const DEFAULT_INTERVENTION_TIER: InterventionTier = "align_first";

/** 单条问题会话的阶段台账。落在服务数据目录 issues/<单号>/ledger.json,Agent 推不动。 */
export interface IssueLedger {
  ticket: string;
  /** 发起时选定的业务模块(#41 弹窗;未选为 null)。 */
  moduleName: string | null;
  interventionTier: InterventionTier;
  stage: IssueStage;
  stages: Record<IssueStage, StageStatus>;
  /** 修复→分析的重开轮次(红灯返工等)。 */
  rounds: number;
  /** 分析确认闸(两道核验之一;full_auto 档自动放行)。 */
  analysisGate: {
    status: "waiting" | "confirmed" | "rejected" | "auto_confirmed";
    askedAt: string;
    answeredAt: string | null;
  } | null;
  /** MR 申报账(complete_stage 申报;对拍基准)。 */
  mrDeclarations: Array<{ repo: string; url: string; declaredAt: string }>;
  /** create_mr 记账(验绿门证据源)。 */
  mrAccounts: Array<{
    repo: string;
    url: string;
    branch: string;
    pipeline: "unknown" | "running" | "green" | "red";
    updatedAt: string;
  }>;
  /** 流水线监看预算(首次 create_mr 起;耗尽停表转人工)。 */
  mrWatch: { startedAt: string; deadlineAt: string } | null;
  /** 流程终点:全部 MR 流水线跑绿并收口。 */
  closedAt: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IssueEvent {
  ts: string;
  kind: string;
  payload?: Record<string, unknown>;
}

export class IssueLedgerError extends Error {}

export function emptyStages(): Record<IssueStage, StageStatus> {
  return {
    dts_info: "pending",
    prep_repo: "pending",
    analyze: "pending",
    fix: "pending",
    mr_green: "pending",
  };
}

/** 纯状态转移:自报制记账,不核实工作事实;非法阶段拒绝。 */
export function applyStage(
  ledger: IssueLedger,
  stage: IssueStage,
  status: StageStatus,
  now: Date = new Date(),
): IssueLedger {
  if (!ISSUE_STAGES.includes(stage)) {
    throw new IssueLedgerError(`未知阶段: ${String(stage)}`);
  }
  ledger.stage = stage;
  ledger.stages[stage] = status;
  ledger.updatedAt = now.toISOString();
  return ledger;
}
