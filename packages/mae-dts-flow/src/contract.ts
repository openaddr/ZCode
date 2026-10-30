/**
 * mae-dts-flow 对外契约:zcode-mae 内本地闭环 DTS 问题处理的服务面。
 * 调用方(UI 渲染层、桌面 main、会话客户端)只准 import 本文件或 index.ts;
 * 领域实现(domain/)与传输适配(adapters/)都是模块内部细节。
 *
 * 规格与决策:specs/mae/dts-flow.md(D15,2026-10-30 修订:数据面同源 mae-flow-cloud);
 * wayfinder 地图 openaddr/ZCode#37。
 */
export { maeDtsFlowModule } from "./module.js";
export {
  DEPRECATED_CONFIG_KEYS,
  DtsFlowConfigError,
  KNOWN_CONFIG_KEYS,
  type DtsFlowConfig,
  assembleConfig,
} from "./domain/config.js";
export { loadConfig, type LoadConfigOptions } from "./adapters/configLoader.js";
export {
  DtsFlowDependencyError,
  type DependencyProbe,
  executableCandidates,
  type ProbeOptions,
  probeDependency,
  requireDependency,
} from "./domain/depsProbe.js";
export { fsExists, fsProbeOptions } from "./adapters/fsProbe.js";
export {
  DTS_ACTIONABLE_STATUS,
  DtsFlowGatewayError,
  type DtsBindingEntry,
  type DtsBindingMap,
  type DtsModuleOption,
  type DtsPerson,
  type DtsTicketDetail,
  type DtsTicketSummary,
  dtsVersionGroup,
  isActionable,
} from "./domain/dts.js";
export {
  type CreateGatewayInput,
  CloudPlatformGateway,
  type DtsGateway,
  MockDtsGateway,
  createDtsGateway,
} from "./adapters/dtsGateway.js";
export {
  DEFAULT_INTERVENTION_TIER,
  ISSUE_STAGES,
  IssueLedgerError,
  type InterventionTier,
  type IssueEvent,
  type IssueLedger,
  type IssueStage,
  type StageStatus,
  applyStage,
  emptyStages,
} from "./domain/ledger.js";
export {
  type GateVerdict,
  type MrAccount,
  type MrDeclaration,
  type PipelineState,
  type WatchBudget,
  isBudgetExhausted,
  judgeGate,
  verifyDeclarations,
} from "./domain/mrGate.js";
export {
  DEFAULT_COMMANDS,
  type PlatformCommands,
  type PlatformAdapter,
  PlatformError,
  CliPlatformAdapter,
  MockPlatformAdapter,
  createPlatformAdapter,
} from "./adapters/platformAdapter.js";
export {
  STAGE_REGISTRY,
  type FlowToolName,
  type StageSpec,
  REPORT_SECTIONS,
  type AnalysisGate,
  answerAnalysisGate,
  buildAnalysisReportTemplate,
  buildMcpConfigJson,
  buildOpeningBrief,
  buildSkillMarkdown,
  expectedBranch,
  isToolAllowed,
  raiseAnalysisGate,
  validateAnalysisReport,
} from "./domain/issueFlow.js";
export {
  initIssueWorkspace,
  readAnalysisReport,
  workspaceDir,
} from "./adapters/workspaceStore.js";
export { buildFlowToolHandlers } from "./adapters/mcpTools.js";
export {
  issueDir,
  appendIssueEvent,
  createIssueLedger,
  listIssueLedgers,
  loadIssueLedger,
  readIssueEvents,
  recordStage,
  saveIssueLedger,
} from "./adapters/ledgerStore.js";
export { KNOWN_DEPENDENCIES, type DtsFlowService, type DtsFlowServiceDeps } from "./app/service.js";
export { createDtsFlowService } from "./adapters/serviceFactory.js";
export { type StartedHttpFace, type HttpFaceOptions, startHttpFace } from "./adapters/http.js";
export {
  SERVER_INFO_TOOL,
  type McpFaceHandlers,
  type McpToolDefinition,
  type McpToolResult,
  createMcpStdioFace,
} from "./adapters/mcpStdio.js";
