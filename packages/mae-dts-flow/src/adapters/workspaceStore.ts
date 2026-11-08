/** 问题工作区存储:发起动作一次性建好 工作区目录+报告模板(#40 决议 2)。
 *  #98(发起流程切换到插件挂载):不再写项目级 .zcode/config.json 与每单物化技能
 *  (.agents/skills/dts-issue-flow/SKILL.md)——四件套由宿主插件机制全局挂载(spec #93);
 *  流程关键约定改由开场词(buildOpeningBrief)自足携带。遗留文件只不写不删,旧工作区兼容。 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { buildAnalysisReportTemplate, type InitWorkspaceResult } from "../domain/issueFlow.js";

export function workspaceDir(issuesRoot: string, ticket: string): string {
  if (!ticket.trim() || ticket.includes("/") || ticket.includes("\\") || ticket.includes("..")) {
    throw new Error(`非法单号: ${ticket}`);
  }
  return path.join(issuesRoot, ticket);
}

export interface InitWorkspaceInput {
  issuesRoot: string;
  ticket: string;
}

export async function initIssueWorkspace(input: InitWorkspaceInput): Promise<InitWorkspaceResult> {
  const workspacePath = workspaceDir(input.issuesRoot, input.ticket);
  await fs.mkdir(path.join(workspacePath, "repo"), { recursive: true });
  await fs.mkdir(path.join(workspacePath, "local-logs"), { recursive: true });

  const analysisReportPath = path.join(workspacePath, "issue-analysis.md");
  await writeFileIfAbsent(analysisReportPath, buildAnalysisReportTemplate(input.ticket));

  return { workspacePath, analysisReportPath };
}

async function writeFileIfAbsent(file: string, content: string): Promise<void> {
  const existing = await fs.stat(file).catch(() => null);
  if (existing) return;
  await fs.writeFile(file, content, "utf8");
}

export async function readAnalysisReport(issuesRoot: string, ticket: string): Promise<string | null> {
  return fs
    .readFile(path.join(workspaceDir(issuesRoot, ticket), "issue-analysis.md"), "utf8")
    .catch(() => null);
}
