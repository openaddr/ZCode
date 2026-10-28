import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { initIssueWorkspace, readAnalysisReport } from "../src/adapters/workspaceStore.js";
import { validateAnalysisReport } from "../src/domain/issueFlow.js";

async function tempRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mae-dts-flow-ws-"));
}

describe("initIssueWorkspace", () => {
  it("一口气建齐:repo/、local-logs/、报告模板(四章节)、技能、项目级 MCP 配置", async () => {
    const issuesRoot = await tempRoot();
    const result = await initIssueWorkspace({
      issuesRoot,
      ticket: "DTS-2026-1008",
      employeeId: "ning",
      branch: "master_ning_DTS-2026-1008",
      selfCommand: "node",
      selfArgs: ["serve.ts", "--stdio"],
    });
    expect(result.workspacePath).toBe(path.join(issuesRoot, "DTS-2026-1008"));

    const entries = await readdir(result.workspacePath);
    expect(entries).toEqual(expect.arrayContaining(["repo", "local-logs", "issue-analysis.md", ".agents", ".zcode"]));

    const report = await readFile(result.analysisReportPath, "utf8");
    expect(validateAnalysisReport(report).ok).toBe(true);

    const skill = await readFile(result.skillPath, "utf8");
    expect(skill).toContain("master_ning_DTS-2026-1008");

    const mcpConfig = JSON.parse(await readFile(result.mcpConfigPath, "utf8")) as {
      mcp: { servers: Record<string, { type: string }> };
    };
    expect(mcpConfig.mcp.servers["dts-flow"].type).toBe("stdio");

    // 再次 init 不覆盖已有材料(幂等保护)。
    await initIssueWorkspace({
      issuesRoot,
      ticket: "DTS-2026-1008",
      employeeId: "ning",
      branch: "master_ning_DTS-2026-1008",
      selfCommand: "node",
      selfArgs: ["x.ts"],
    });
    expect(await readFile(result.skillPath, "utf8")).toContain("master_ning_DTS-2026-1008");
  });

  it("readAnalysisReport:在场返回内容,未建工作区返回 null", async () => {
    const issuesRoot = await tempRoot();
    expect(await readAnalysisReport(issuesRoot, "DTS-2026-1001")).toBeNull();
    await initIssueWorkspace({
      issuesRoot,
      ticket: "DTS-2026-1001",
      employeeId: "dev",
      branch: "master_dev_DTS-2026-1001",
      selfCommand: "node",
      selfArgs: [],
    });
    expect(await readAnalysisReport(issuesRoot, "DTS-2026-1001")).toContain("问题现象");
  });
});
