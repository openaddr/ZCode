import {
  type DtsFlowService,
  type DtsFlowServiceDeps,
  KNOWN_DEPENDENCIES,
} from "../app/service.js";
import type { DtsFlowConfig } from "../domain/config.js";
import { isActionable } from "../domain/dts.js";
import { probeDependency } from "../domain/depsProbe.js";
import { judgeGate } from "../domain/mrGate.js";
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
import { type DtsGateway, createDtsGateway } from "./dtsGateway.js";
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
import { type PlatformAdapter, createPlatformAdapter } from "./platformAdapter.js";
import { initIssueWorkspace, readAnalysisReport, workspaceDir } from "./workspaceStore.js";

const STAGE_ORDER: readonly string[] = ["dts_info", "prep_repo", "analyze", "fix", "mr_green"];

/** 服务工厂(adapters 组合根):把 domain 纯逻辑与 IO 实现接成 DtsFlowService 实例。 */
export function createDtsFlowService(config: DtsFlowConfig, deps: DtsFlowServiceDeps): DtsFlowService {
  const now = deps.now ?? (() => new Date());
  let gateway: DtsGateway | null = null;
  const getGateway = (): DtsGateway => {
    if (gateway === null) {
      gateway = createDtsGateway(
        { cloudBaseUrl: config.cloudBaseUrl, mock: config.mock },
        { fetch: deps.fetch },
      );
    }
    return gateway;
  };
  let platform: PlatformAdapter | null = null;
  const getPlatform = async (): Promise<PlatformAdapter> => {
    if (platform === null) {
      platform = await createPlatformAdapter({
        dataDir: config.dataDir,
        mock: config.mock,
        binDir: config.binDir,
        pathEnv: process.env["PATH"],
      });
    }
    return platform;
  };
  const loadLedgerOrThrow = async (ticket: string): Promise<IssueLedger> => {
    return loadIssueLedger(config.dataDir, ticket).catch(() => {
      throw new IssueLedgerError(`单 ${ticket} 的台账不存在(先经发起动作创建)`);
    });
  };

  return {
    config,
    async configSummary() {
      return {
        dataDir: config.dataDir,
        issuesRoot: config.issuesRoot,
        binDir: config.binDir,
        employeeId: config.employeeId,
        cloudBaseUrl: config.cloudBaseUrl,
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
    async listTickets(owner) {
      const tickets = await getGateway().listByOwner(owner ?? config.employeeId);
      return tickets.map((ticket) => ({ ...ticket, actionable: isActionable(ticket.status) }));
    },
    async getTicket(ticket: string) {
      return getGateway().getTicket(ticket);
    },
    async listModules() {
      return getGateway().listModules();
    },
    async getBindings() {
      return getGateway().getBindings();
    },
    async putBinding(input) {
      await getGateway().putBinding(input.ticket, input.moduleId, config.employeeId);
    },
    async listPeople() {
      return getGateway().listPeople();
    },
    async createIssue(input) {
      return createIssueLedger(config.dataDir, { ...input, now });
    },
    async initIssue(input) {
      const ledger = await createIssueLedger(config.dataDir, {
        ticket: input.ticket,
        moduleName: input.moduleName ?? null,
        interventionTier: input.interventionTier,
        now,
      });
      const workspace = await initIssueWorkspace({
        issuesRoot: config.issuesRoot,
        ticket: input.ticket,
        employeeId: config.employeeId,
        branch: expectedBranch(config.employeeId, input.ticket),
        selfCommand: deps.selfLauncher.command,
        selfArgs: deps.selfLauncher.args,
        ...(deps.selfLauncher.env ? { selfEnv: deps.selfLauncher.env } : {}),
      });
      const detail = input.detail ?? (await getGateway().getTicket(input.ticket));
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
        payload: { workspacePath: workspace.workspacePath, moduleName: ledger.moduleName },
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
    async createMr({ ticket, repo, title, description }) {
      const ledger = await loadLedgerOrThrow(ticket);
      if (!isToolAllowed(ledger.stage as IssueStageName, "create_mr")) {
        throw new IssueLedgerError(`create_mr 仅 MR 验绿阶段可用,当前阶段 ${ledger.stage}`);
      }
      const branch = expectedBranch(config.employeeId, ticket);
      const adapter = await getPlatform();
      const created = await adapter.createMr({
        repo,
        branch,
        title: title ?? `${ticket} 修复`,
        description: description ?? "",
        ticket,
      });
      ledger.mrAccounts.push({
        repo: created.repo,
        url: created.url,
        branch: created.branch,
        pipeline: "running",
        updatedAt: now().toISOString(),
      });
      if (ledger.mrWatch === null) {
        const started = now();
        ledger.mrWatch = {
          startedAt: started.toISOString(),
          deadlineAt: new Date(started.getTime() + config.pipelineBudgetMinutes * 60_000).toISOString(),
        };
      }
      await saveIssueLedger(config.dataDir, ledger, now());
      await appendIssueEvent(config.dataDir, ticket, {
        ts: now().toISOString(),
        kind: "mr_created",
        payload: { repo: created.repo, url: created.url, branch: created.branch },
      });
      return { branch, status: "created" };
    },
    async pollTickets() {
      const results: Array<{ ticket: string; verdict: "green" | "red" | "running" | "exhausted" | "skipped" }> = [];
      for (const ledger of await listIssueLedgers(config.dataDir)) {
        if (ledger.closedAt !== null || ledger.mrAccounts.length === 0) {
          results.push({ ticket: ledger.ticket, verdict: "skipped" });
          continue;
        }
        const adapter = await getPlatform();
        for (const account of ledger.mrAccounts) {
          if (account.pipeline === "green" || account.pipeline === "red") continue;
          try {
            account.pipeline = await adapter.pipelineStatus(account.url);
          } catch (error) {
            await appendIssueEvent(config.dataDir, ledger.ticket, {
              ts: now().toISOString(),
              kind: "pipeline_probe_failed",
              payload: { url: account.url, error: error instanceof Error ? error.message : String(error) },
            });
          }
          account.updatedAt = now().toISOString();
        }
        const verdict = judgeGate(ledger.mrAccounts, ledger.mrDeclarations, ledger.mrWatch, now());
        await saveIssueLedger(config.dataDir, ledger, now());
        await appendIssueEvent(config.dataDir, ledger.ticket, {
          ts: now().toISOString(),
          kind: `mr_gate_${verdict.state}`,
          payload: {
            failures: verdict.failures,
            missing: verdict.declaration.missing.map((item) => item.repo),
            extra: verdict.declaration.extra.map((account) => account.repo),
          },
        });
        if (verdict.state === "green") {
          ledger.closedAt = now().toISOString();
          await saveIssueLedger(config.dataDir, ledger, now());
        }
        results.push({ ticket: ledger.ticket, verdict: verdict.state });
      }
      return results;
    },
    async archiveIssue(ticket) {
      const ledger = await loadLedgerOrThrow(ticket);
      if (ledger.closedAt === null) {
        throw new IssueLedgerError(`单 ${ticket} 未经验绿收口,不能归档`);
      }
      ledger.archived = true;
      await saveIssueLedger(config.dataDir, ledger, now());
      await appendIssueEvent(config.dataDir, ticket, { ts: now().toISOString(), kind: "archived", payload: {} });
      return ledger;
    },
    async listIssues() {
      const ledgers = await listIssueLedgers(config.dataDir);
      return ledgers.map((ledger) => ({ ...ledger, workspacePath: workspaceDir(config.issuesRoot, ledger.ticket) }));
    },
    async loadIssue(ticket: string) {
      return loadLedgerOrThrow(ticket);
    },
    async issueEvents(ticket: string, tail?: number) {
      return readIssueEvents(config.dataDir, ticket, tail);
    },
  };
}
