/** 问题工作区存储:发起动作一次性建好 工作区+项目级 MCP 配置+物化技能(#40 决议 2)。 */
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  buildAnalysisReportTemplate,
  buildMcpConfigJson,
  buildSkillMarkdown,
  type InitWorkspaceResult,
} from "../domain/issueFlow.js";

export function workspaceDir(issuesRoot: string, ticket: string): string {
  if (!ticket.trim() || ticket.includes("/") || ticket.includes("\\") || ticket.includes("..")) {
    throw new Error(`非法单号: ${ticket}`);
  }
  return path.join(issuesRoot, ticket);
}

export interface InitWorkspaceInput {
  issuesRoot: string;
  ticket: string;
  employeeId: string;
  branch: string;
  /** 服务自身 stdio 启动命令(写进项目级 .zcode/config.json,会话自动挂 MCP 面)。 */
  selfCommand: string;
  selfArgs: string[];
  /** 打包态 electron 充当 node 所需的环境注入(缺省不带 env 键)。 */
  selfEnv?: Record<string, string>;
}

export async function initIssueWorkspace(input: InitWorkspaceInput): Promise<InitWorkspaceResult> {
  const workspacePath = workspaceDir(input.issuesRoot, input.ticket);
  await fs.mkdir(path.join(workspacePath, "repo"), { recursive: true });
  await fs.mkdir(path.join(workspacePath, "local-logs"), { recursive: true });

  const analysisReportPath = path.join(workspacePath, "issue-analysis.md");
  await writeFileIfAbsent(analysisReportPath, buildAnalysisReportTemplate(input.ticket));

  const skillPath = path.join(workspacePath, ".agents", "skills", "dts-issue-flow", "SKILL.md");
  await fs.mkdir(path.dirname(skillPath), { recursive: true });
  await writeFileIfAbsent(
    skillPath,
    buildSkillMarkdown({
      ticket: input.ticket,
      employeeId: input.employeeId,
      branch: input.branch,
      workspacePath,
      stageGoals: "",
    }),
  );

  const mcpConfigPath = path.join(workspacePath, ".zcode", "config.json");
  await fs.mkdir(path.dirname(mcpConfigPath), { recursive: true });
  await writeFileIfAbsent(mcpConfigPath, buildMcpConfigJson(input.selfCommand, input.selfArgs, input.selfEnv));

  return { workspacePath, analysisReportPath, skillPath, mcpConfigPath };
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
