/**
 * mae-dts-flow 对外契约:zcode-mae 内本地闭环 DTS 问题处理的服务面。
 * 调用方(UI 渲染层、桌面 main、会话客户端)只准 import 本文件或 index.ts;
 * 领域实现(domain/)与传输适配(adapters/)都是模块内部细节。
 *
 * 规格与决策:specs/mae/dts-flow.md(D15);wayfinder 地图 openaddr/ZCode#37。
 */
export { maeDtsFlowModule } from "./module.js";
export {
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
  type DtsTicketDetail,
  type DtsTicketSummary,
  buildDetailArgs,
  buildListArgs,
  dtsVersionGroup,
  extractDatas,
  isActionable,
  mapDtsRow,
  parseToolResultText,
} from "./domain/dts.js";
export {
  type CreateGatewayInput,
  type DtsGateway,
  MockDtsGateway,
  McpDtsGateway,
  createDtsGateway,
  tokenFileReader,
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
  issueDir,
  appendIssueEvent,
  createIssueLedger,
  listIssueLedgers,
  loadIssueLedger,
  readIssueEvents,
  recordStage,
  saveIssueLedger,
} from "./adapters/ledgerStore.js";
export {
  ModuleBindingsError,
  type ModuleBindings,
  type ModuleRepoBinding,
  type ResolvedModuleBindings,
  findVersionBranch,
  resolveModuleBindings,
  validateModules,
} from "./domain/moduleBindings.js";
export {
  MODULE_BINDINGS_PATH,
  fetchCloudModuleBindings,
  loadLocalModuleBindings,
  localBindingsPath,
} from "./adapters/moduleBindingsStore.js";
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
