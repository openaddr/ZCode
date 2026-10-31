/** 问题流阶段机与流程规则(纯逻辑);工具语义对齐云端 stageRegistry 思路,#42 决议。 */
import type { IssueLedger } from "./ledger.js";

/** 有单五阶段:label 给 UI/提示词;出口语义——四个自报阶段 + 两道核验闸在 analyze/mr_green 内。 */
export interface StageSpec {
  stage: IssueStageName;
  label: string;
  /** 阶段目标一句话(进技能与开场词)。 */
  goal: string;
}

export type IssueStageName = "dts_info" | "prep_repo" | "analyze" | "fix" | "mr_green";

export const STAGE_REGISTRY: readonly StageSpec[] = [
  { stage: "dts_info", label: "拉单", goal: "获取 DTS 单信息,明确现象与版本" },
  { stage: "prep_repo", label: "拉仓", goal: "拉取相关代码仓,建立修复分支" },
  { stage: "analyze", label: "分析", goal: "定位根因,产出四章节分析报告并过确认闸" },
  { stage: "fix", label: "修复", goal: "按报告修改代码,补测试,推送分支" },
  { stage: "mr_green", label: "MR 验绿", goal: "创建 MR 并申报,流水线全绿收口" },
];

/** 四件套工具 + server_info(自检)。 */
export type FlowToolName = "dts_get_ticket" | "submit_analysis" | "create_mr" | "complete_stage";

const STAGELESS_TOOLS: readonly FlowToolName[] = ["dts_get_ticket", "complete_stage"];

/**
 * 阶段工具门禁(权威层,execute 入口校验;提示词清单只是引导层)。
 * 跨阶段通用:dts_get_ticket/complete_stage;submit_analysis 仅 analyze;create_mr 仅 mr_green。
 */
export function isToolAllowed(stage: IssueStageName, tool: FlowToolName): boolean {
  if (STAGELESS_TOOLS.includes(tool)) return true;
  if (tool === "submit_analysis") return stage === "analyze";
  if (tool === "create_mr") return stage === "mr_green";
  return false;
}

/** 分析报告四章节门票(云端 ADR-0005 同口径):缺章节整单打回。 */
export const REPORT_SECTIONS: readonly string[] = ["问题现象", "问题根因", "修改方案", "置信度"];

/** 机械校验:标题行(任意级别 #)含四个章节名即算在场。 */
export function validateAnalysisReport(content: string): { ok: boolean; missing: string[] } {
  const headingLines = content.split("\n").filter((line) => /^\s*#{1,6}\s/.test(line));
  const missing = REPORT_SECTIONS.filter((section) => !headingLines.some((line) => line.includes(section)));
  return { ok: missing.length === 0, missing };
}

export function buildAnalysisReportTemplate(ticket: string): string {
  return [
    `# ${ticket} 问题分析报告`,
    "",
    "## 问题现象",
    "",
    "(待填写:现象、复现路径、影响面)",
    "",
    "## 问题根因",
    "",
    "(待填写:根因定位,证据随文标注代码 File:行号或日志关键行)",
    "",
    "## 修改方案",
    "",
    "(待填写:修改思路、涉及文件、测试与验证方式)",
    "",
    "## 置信度",
    "",
    "(待填写:高/中/低,证据局限写在这里)",
    "",
  ].join("\n");
}

/** 分支名契约:服务独知期望名;create_mr 按它直建,不采信 AI 报名(#42 决议 3)。 */
export function expectedBranch(employeeId: string, ticket: string): string {
  return `master_${employeeId}_${ticket}`;
}

export function buildMcpConfigJson(
  selfCommand: string,
  selfArgs: string[],
  selfEnv?: Record<string, string>,
): string {
  const server: Record<string, unknown> = { type: "stdio", command: selfCommand, args: selfArgs };
  if (selfEnv !== undefined && Object.keys(selfEnv).length > 0) server["env"] = selfEnv;
  return `${JSON.stringify({ mcp: { servers: { "dts-flow": server } } }, null, 2)}\n`;
}

/** 问题工作区一次性物化的产物路径(#40 决议 2)。 */
export interface InitWorkspaceResult {
  workspacePath: string;
  analysisReportPath: string;
  skillPath: string;
  mcpConfigPath: string;
}

export interface SkillContext {
  ticket: string;
  employeeId: string;
  branch: string;
  workspacePath: string;
  stageGoals: string;
}

/** 技能动态物化模板(五块:阶段指引/布局/分支与推送/提交与 MR/报告模板)。 */
export function buildSkillMarkdown(ctx: SkillContext): string {
  const stageLines = STAGE_REGISTRY.map((spec) => `- ${spec.label}(${spec.stage}):${spec.goal}`).join("\n");
  return `# dts-issue-flow:DTS 问题单处理流程(单号 ${ctx.ticket})

你正在处理一张 DTS 问题单。全程按阶段推进,阶段真相在 dts-flow 服务台账,你只通过工具推进。

## 阶段与出口

${stageLines}

推进方式:完成阶段目标后调 complete_stage 自报收口;例外——分析阶段以 submit_analysis 为出口(触 发用户确认闸),MR 阶段以 create_mr 建单后 complete_stage 申报 MR 清单。

## 工作区布局

- 工作区根:${ctx.workspacePath}
- 代码仓克隆放 repo/ 子目录(每仓一个子目录)
- 日志材料放 local-logs/
- 分析报告:issue-analysis.md(四章节,submit_analysis 的门票)

## 分支与推送

- 修复分支名固定:${ctx.branch}(工号 ${ctx.employeeId});本地分支名无关,推送用 git push origin HEAD:${ctx.branch}
- 推送用你自己的 git 环境;不要改工作区配置文件与台账

## 提交与 MR

- 提交格式:[${ctx.ticket}][类型] 描述
- 建 MR 走 create_mr 工具(服务按期望分支名直建,不要自行调 MR 工具)

## 报告模板

issue-analysis.md 必须含四章节标题:问题现象 / 问题根因 / 修改方案 / 置信度。证据随文标注,置信度如实写局限。
`;
}

/** 开场词:单据事实摘要+阶段指引+规范提醒(首条注入,#43 决议 2)。 */
export function buildOpeningBrief(input: {
  ticket: string;
  title: string;
  severity: string;
  description: string;
  workspacePath: string;
  branch: string;
  interventionTier: string;
}): string {
  return [
    `你正在处理 DTS 问题单 ${input.ticket}:${input.title}(级别:${input.severity})。`,
    `介入档位:${input.interventionTier}。工作区:${input.workspacePath};修复分支:${input.branch}。`,
    "先读工作区 .agents/skills/dts-issue-flow/SKILL.md 按流程推进;单据描述如下。",
    "",
    input.description,
  ].join("\n");
}

/** 分析确认闸状态(#42 决议 1:两道核验之一;全自动档自动放行,#43 决议)。 */
export interface AnalysisGate {
  status: "waiting" | "confirmed" | "rejected" | "auto_confirmed";
  askedAt: string;
  answeredAt: string | null;
}

export function raiseAnalysisGate(ledger: IssueLedger, now: Date): IssueLedger {
  ledger.analysisGate = { status: "waiting", askedAt: now.toISOString(), answeredAt: null };
  return ledger;
}

export function answerAnalysisGate(
  ledger: IssueLedger,
  confirm: boolean,
  now: Date,
  auto = false,
): IssueLedger {
  const gate = ledger.analysisGate;
  if (gate === null || gate.status !== "waiting") {
    return ledger;
  }
  gate.status = auto ? "auto_confirmed" : confirm ? "confirmed" : "rejected";
  gate.answeredAt = now.toISOString();
  return ledger;
}
