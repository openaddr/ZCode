import { stat } from "node:fs/promises";

import {
  type DtsFlowService,
  type DtsFlowServiceDeps,
  KNOWN_DEPENDENCIES,
} from "../app/service.js";
import type { DtsFlowConfig } from "../domain/config.js";
import { isActionable } from "../domain/dts.js";
import { DtsFlowDependencyError } from "../domain/depsProbe.js";
import { probeDependency } from "../domain/depsProbe.js";
import {
  type IssueStageName,
  answerAnalysisGate,
  buildOpeningBrief,
  expectedBranch,
  isToolAllowed,
  raiseAnalysisGate,
  validateAnalysisReport,
} from "../domain/issueFlow.js";
import { type IssueLedger, IssueLedgerError } from "../domain/ledger.js";
import { type ResolvedModuleBindings, resolveModuleBindings } from "../domain/moduleBindings.js";
import { type DtsGateway, createDtsGateway, tokenFileReader } from "./dtsGateway.js";
import { fsProbeOptions } from "./fsProbe.js";
import {
  appendIssueEvent,
  createIssueLedger,
  listIssueLedgers,
  loadIssueLedger,
  readIssueEvents,
  recordStage,
  saveIssueLedger,
} from "./ledgerStore.js";
import { workspaceDir } from "./workspaceStore.js";
import { fetchCloudModuleBindings, loadLocalModuleBindings, localBindingsPath } from "./moduleBindingsStore.js";
import { initIssueWorkspace, readAnalysisReport } from "./workspaceStore.js";

const STAGE_ORDER: readonly string[] = ["dts_info", "prep_repo", "analyze", "fix", "mr_green"];

/** 服务工厂(adapters 组合根):把 domain 纯逻辑与 IO 实现接成 DtsFlowService 实例。 */
export function createDtsFlowService(config: DtsFlowConfig, deps: DtsFlowServiceDeps): DtsFlowService {
  const now = deps.now ?? (() => new Date());
  let cachedBindings: ResolvedModuleBindings | null = null;
  let gateway: DtsGateway | null = null;
  const getGateway = (): DtsGateway => {
    if (gateway === null) {
      gateway = createDtsGateway(
        { dtsGatewayUrl: config.dtsGatewayUrl, dtsTokenPath: config.dtsTokenPath, mock: config.mock },
        { fetch: deps.fetch, readToken: tokenFileReader(config.dtsTokenPath) },
      );
    }
    return gateway;
  };
  const loadLedgerOrThrow = async (ticket: string): Promise<IssueLedger> => {
    return loadIssueLedger(config.dataDir, ticket).catch(() => {
      throw new IssueLedgerError(`单 ${ticket} 的台账不存在(先经发起动作创建)`);
    });
  };

  return {
    config,
    async configSummary() {
      const tokenPresent = await stat(config.dtsTokenPath)
        .then(() => true)
        .catch(() => false);
      return {
        dataDir: config.dataDir,
        issuesRoot: config.issuesRoot,
        binDir: config.binDir,
        employeeId: config.employeeId,
        cloudBaseUrl: config.cloudBaseUrl,
        dtsGatewayUrl: config.dtsGatewayUrl,
        dtsTokenPath: config.dtsTokenPath,
        dtsTokenPresent: tokenPresent,
        httpPort: config.httpPort,
        mock: config.mock,
      };
    },
    async probeDependencies() {
      return Promise.all(
        KNOWN_DEPENDENCIES.map((name) =>
          probeDependency(name, fsProbeOptions(config.binDir, process.env["PATH"], process.platform)),
        ),
      );
    },
    async refreshModuleBindings() {
      cachedBindings = await resolveModuleBindings({
        cloud:
          config.cloudBaseUrl === null
            ? null
            : () => fetchCloudModuleBindings(config.cloudBaseUrl as string, { fetch: deps.fetch, now }),
        local: () => loadLocalModuleBindings(config.dataDir, { now }),
        localHintPath: localBindingsPath(config.dataDir),
      });
      return cachedBindings;
    },
    getCachedModuleBindings() {
      return cachedBindings;
    },
    async listTickets() {
      const tickets = await getGateway().listByOwner(config.employeeId);
      return tickets.map((ticket) => ({ ...ticket, actionable: isActionable(ticket.status) }));
    },
    async getTicket(ticket: string) {
      return getGateway().getTicket(config.employeeId, ticket);
    },
    async createIssue(input) {
      return createIssueLedger(config.dataDir, { ...input, now });
    },
    async initIssue(input) {
      const ledger = await createIssueLedger(config.dataDir, { ticket: input.ticket, interventionTier: input.interventionTier, now });
      const workspace = await initIssueWorkspace({
        issuesRoot: config.issuesRoot,
        ticket: input.ticket,
        employeeId: config.employeeId,
        branch: expectedBranch(config.employeeId, input.ticket),
        selfCommand: deps.selfLauncher.command,
        selfArgs: deps.selfLauncher.args,
      });
      const detail = input.detail ?? (await getGateway().getTicket(config.employeeId, input.ticket));
      const openingBrief = buildOpeningBrief({
        ticket: input.ticket,
        title: detail.title,
        severity: detail.severity,
        description: detail.description,
        workspacePath: workspace.workspacePath,
        branch: expectedBranch(config.employeeId, input.ticket),
        interventionTier: ledger.interventionTier,
      });
      await appendIssueEvent(config.dataDir, input.ticket, {
        ts: now().toISOString(),
        kind: "workspace_initialized",
        payload: { workspacePath: workspace.workspacePath },
      });
      return { ledger, workspace, openingBrief };
    },
    async submitAnalysis({ ticket, confidence }) {
      const ledger = await loadLedgerOrThrow(ticket);
      if (ledger.stage !== "analyze") {
        throw new IssueLedgerError(`submit_analysis 仅分析阶段可用,当前阶段 ${ledger.stage}`);
      }
      const report = await readAnalysisReport(config.issuesRoot, ticket);
      if (report === null) {
        throw new IssueLedgerError(`分析报告不在场:${workspaceDir(config.issuesRoot, ticket)}/issue-analysis.md`);
      }
      const check = validateAnalysisReport(report);
      if (!check.ok) {
        throw new IssueLedgerError(`分析报告缺章节:${check.missing.join("、")};补齐后重新提交`);
      }
      const autoConfirmed = ledger.interventionTier === "full_auto";
      raiseAnalysisGate(ledger, now());
      if (autoConfirmed) {
        answerAnalysisGate(ledger, true, now(), true);
      }
      await saveIssueLedger(config.dataDir, ledger, now());
      await appendIssueEvent(config.dataDir, ticket, {
        ts: now().toISOString(),
        kind: "analysis_submitted",
        payload: { confidence: confidence ?? null, gate: ledger.analysisGate?.status, missingSections: [] },
      });
      if (autoConfirmed) {
        await recordStage(config.dataDir, ticket, "analyze", "done", now());
        await recordStage(config.dataDir, ticket, "fix", "in_progress", now());
      }
      return { gate: ledger.analysisGate?.status === "auto_confirmed" ? "auto_confirmed" : "waiting", missingSections: [] };
    },
    async confirmAnalysis({ ticket, confirm }) {
      const ledger = await loadLedgerOrThrow(ticket);
      if (ledger.analysisGate === null || ledger.analysisGate.status !== "waiting") {
        throw new IssueLedgerError(`单 ${ticket} 当前没有待确认的分析闸`);
      }
      answerAnalysisGate(ledger, confirm, now());
      await saveIssueLedger(config.dataDir, ledger, now());
      await appendIssueEvent(config.dataDir, ticket, {
        ts: now().toISOString(),
        kind: confirm ? "analysis_confirmed" : "analysis_rejected",
        payload: {},
      });
      if (confirm) {
        await recordStage(config.dataDir, ticket, "analyze", "done", now());
        await recordStage(config.dataDir, ticket, "fix", "in_progress", now());
      }
      return ledger;
    },
    async completeStage({ ticket, stage, mrs = [] }) {
      const ledger = await loadLedgerOrThrow(ticket);
      if (stage === "analyze") {
        throw new IssueLedgerError("分析阶段的出口是 submit_analysis(确认闸),不能用 complete_stage 绕过");
      }
      if (!STAGE_ORDER.includes(stage)) {
        throw new IssueLedgerError(`未知阶段: ${stage}`);
      }
      if (stage === "mr_green") {
        for (const mr of mrs) {
          ledger.mrDeclarations.push({ repo: mr.repo, url: mr.url, declaredAt: now().toISOString() });
        }
        await saveIssueLedger(config.dataDir, ledger, now());
        await appendIssueEvent(config.dataDir, ticket, {
          ts: now().toISOString(),
          kind: "mrs_declared",
          payload: { count: mrs.length },
        });
      }
      const updated = await recordStage(config.dataDir, ticket, stage as never, "done", now());
      const nextIndex = STAGE_ORDER.indexOf(stage) + 1;
      const next = STAGE_ORDER[nextIndex];
      if (next !== undefined) {
        await recordStage(config.dataDir, ticket, next as never, "in_progress", now());
      }
      return updated;
    },
    async createMr({ ticket, repo, title }) {
      const ledger = await loadLedgerOrThrow(ticket);
      if (!isToolAllowed(ledger.stage as IssueStageName, "create_mr")) {
        throw new IssueLedgerError(`create_mr 仅 MR 验绿阶段可用,当前阶段 ${ledger.stage}`);
      }
      const branch = expectedBranch(config.employeeId, ticket);
      const resolved = await probeDependency("codehubcli", fsProbeOptions(config.binDir, process.env["PATH"], process.platform));
      if (!resolved.available) {
        throw new DtsFlowDependencyError(
          `缺少依赖组件「codehubcli」:${config.binDir} 与 PATH 均未找到;MR 创建无法进行(部署随装)`,
          "codehubcli",
        );
      }
      // 施工票 7 实装 codehubcli 直调与验绿监看;此处先锁分支契约,防误用。
      throw new IssueLedgerError(
        `create_mr 尚未实装(施工票 7);分支契约已核:${repo} 的源分支必须为 ${branch}${title ? `,标题「${title}」` : ""}`,
      );
    },
    async listIssues() {
      return listIssueLedgers(config.dataDir);
    },
    async loadIssue(ticket: string) {
      return loadLedgerOrThrow(ticket);
    },
    async issueEvents(ticket: string, tail?: number) {
      return readIssueEvents(config.dataDir, ticket, tail);
    },
  };
}
