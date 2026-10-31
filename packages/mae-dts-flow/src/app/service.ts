import type { DtsFlowConfig } from "../domain/config.js";
import type { DependencyProbe } from "../domain/depsProbe.js";
import type {
  DtsBindingMap,
  DtsModuleOption,
  DtsPerson,
  DtsTicketDetail,
  DtsTicketSummary,
} from "../domain/dts.js";
import type { IssueEvent, IssueLedger, InterventionTier } from "../domain/ledger.js";
import type { InitWorkspaceResult } from "../domain/issueFlow.js";

/** 一期已知依赖组件(UI 依赖面板与调用期守卫共用这份清单)。 */
export const KNOWN_DEPENDENCIES = ["codehubcli"] as const;

export interface DtsFlowServiceDeps {
  fetch: typeof fetch;
  now?: () => Date;
  /** 服务自身 stdio 启动命令(物化进工作区项目级 MCP 配置;由 serve 入口提供)。 */
  selfLauncher: { command: string; args: string[]; env?: Record<string, string> };
}

/**
 * 服务装配接口(纯端口):双面(HTTP/stdio MCP)共享一个实例;实现在 adapters/serviceFactory。
 * 领域逻辑在 domain/,这里只声明 UI 与 MCP 面消费的能力面。
 */
export interface DtsFlowService {
  readonly config: DtsFlowConfig;
  configSummary(): Promise<{
    dataDir: string;
    issuesRoot: string;
    binDir: string;
    employeeId: string;
    cloudBaseUrl: string | null;
    httpPort: number;
    mock: boolean;
  }>;
  probeDependencies(): Promise<DependencyProbe[]>;
  /** 名下 DTS 单(全部状态,actionable 标记可发起;owner 缺省=配置工号;未配置/未放行 fail-loud)。 */
  listTickets(owner?: string): Promise<Array<DtsTicketSummary & { actionable: boolean }>>;
  getTicket(ticket: string): Promise<DtsTicketDetail>;
  /** 业务模块目录(所属模块列候选)。 */
  listModules(): Promise<DtsModuleOption[]>;
  /** 单号→模块人工改选映射(团队共享)。 */
  getBindings(): Promise<DtsBindingMap>;
  /** 改选落账(受平台 #566 放行门控)。 */
  putBinding(input: { ticket: string; moduleId: string | null }): Promise<void>;
  /** 人员名单(责任人选择器候选;未放行 fail-loud,UI 退化手输工号)。 */
  listPeople(): Promise<DtsPerson[]>;
  createIssue(input: { ticket: string; interventionTier?: InterventionTier }): Promise<IssueLedger>;
  /** 发起动作:台账+工作区(repo/、报告模板、项目级 MCP 配置、物化技能)+开场词,一口气(#40 决议 2)。 */
  initIssue(input: {
    ticket: string;
    moduleName?: string | null;
    interventionTier?: InterventionTier;
    detail?: DtsTicketDetail | null;
  }): Promise<{ ledger: IssueLedger; workspace: InitWorkspaceResult; openingBrief: string }>;
  /** 分析确认闸:用户在 UI 作答(全自动档由 submit_analysis 自动放行)。 */
  confirmAnalysis(input: { ticket: string; confirm: boolean }): Promise<IssueLedger>;
  submitAnalysis(input: { ticket: string; confidence?: string }): Promise<{
    gate: "waiting" | "auto_confirmed";
    missingSections: string[];
  }>;
  completeStage(input: {
    ticket: string;
    stage: string;
    mrs?: Array<{ repo: string; url: string }>;
  }): Promise<IssueLedger>;
  createMr(input: { ticket: string; repo: string; title?: string; description?: string }): Promise<{ branch: string; status: string }>;
  /** 验绿门轮询:逐 MR 查流水线,三态裁决;绿→收口,红/少报多报→事件回发,预算尽→停表转人工。 */
  pollTickets(): Promise<Array<{ ticket: string; verdict: "green" | "red" | "running" | "exhausted" | "skipped" }>>;
  /** 归档:仅 closedAt 在场(验绿收口)后允许。 */
  archiveIssue(ticket: string): Promise<IssueLedger>;
  listIssues(): Promise<Array<IssueLedger & { workspacePath: string }>>;
  loadIssue(ticket: string): Promise<IssueLedger>;
  issueEvents(ticket: string, tail?: number): Promise<IssueEvent[]>;
}
