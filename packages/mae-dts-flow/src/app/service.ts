import type { DtsFlowConfig } from "../domain/config.js";
import type { DependencyProbe } from "../domain/depsProbe.js";
import type { DtsTicketDetail, DtsTicketSummary } from "../domain/dts.js";
import type { IssueEvent, IssueLedger, InterventionTier } from "../domain/ledger.js";
import type { ResolvedModuleBindings } from "../domain/moduleBindings.js";

/** 一期已知依赖组件(UI 依赖面板与调用期守卫共用这份清单)。 */
export const KNOWN_DEPENDENCIES = ["codehubcli"] as const;

export interface DtsFlowServiceDeps {
  fetch: typeof fetch;
  now?: () => Date;
}

/**
 * 服务装配接口(纯端口):双面(HTTP/stdio MCP)共享一个实例;实现在 adapters/serviceFactory。
 * 领域逻辑在 domain/,这里只声明 UI 与 MCP 面消费的能力面。
 */
export interface DtsFlowService {
  readonly config: DtsFlowConfig;
  /** 配置摘要:绝不包含凭据内容(token 只报路径与在场性)。 */
  configSummary(): Promise<{
    dataDir: string;
    binDir: string;
    employeeId: string;
    cloudBaseUrl: string | null;
    dtsGatewayUrl: string | null;
    dtsTokenPath: string;
    dtsTokenPresent: boolean;
    httpPort: number;
    mock: boolean;
  }>;
  probeDependencies(): Promise<DependencyProbe[]>;
  refreshModuleBindings(): Promise<ResolvedModuleBindings>;
  getCachedModuleBindings(): ResolvedModuleBindings | null;
  /** 名下 DTS 单(全部状态,actionable 标记可发起;调用期未配置网关 fail-loud)。 */
  listTickets(): Promise<Array<DtsTicketSummary & { actionable: boolean }>>;
  getTicket(ticket: string): Promise<DtsTicketDetail>;
  createIssue(input: { ticket: string; interventionTier?: InterventionTier }): Promise<IssueLedger>;
  listIssues(): Promise<IssueLedger[]>;
  loadIssue(ticket: string): Promise<IssueLedger>;
  issueEvents(ticket: string, tail?: number): Promise<IssueEvent[]>;
}
