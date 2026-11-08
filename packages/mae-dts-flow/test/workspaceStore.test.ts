import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { initIssueWorkspace, readAnalysisReport } from "../src/adapters/workspaceStore.js";
import { validateAnalysisReport } from "../src/domain/issueFlow.js";

async function tempRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mae-dts-flow-ws-"));
}

describe("initIssueWorkspace", () => {
  it("建齐 repo/、local-logs/、报告模板(四章节);不再物化 .zcode/config.json 与 .agents 技能(#98)", async () => {
    const issuesRoot = await tempRoot();
    const result = await initIssueWorkspace({ issuesRoot, ticket: "DTS-2026-1008" });
    expect(result.workspacePath).toBe(path.join(issuesRoot, "DTS-2026-1008"));
    expect(result).toEqual({ workspacePath: result.workspacePath, analysisReportPath: result.analysisReportPath });

    const entries = await readdir(result.workspacePath);
    expect(entries).toEqual(expect.arrayContaining(["repo", "local-logs", "issue-analysis.md"]));
    expect(entries).not.toContain(".agents");
    expect(entries).not.toContain(".zcode");
    await expect(stat(path.join(result.workspacePath, ".zcode", "config.json"))).rejects.toThrow();
    await expect(stat(path.join(result.workspacePath, ".agents", "skills", "dts-issue-flow", "SKILL.md"))).rejects.toThrow();

    const report = await readFile(result.analysisReportPath, "utf8");
    expect(validateAnalysisReport(report).ok).toBe(true);
  });

  it("旧工作区兼容:遗留 .zcode/config.json 与 .agents 技能原样保留,只不写不删(#98)", async () => {
    const issuesRoot = await tempRoot();
    const workspacePath = path.join(issuesRoot, "DTS-2026-1009");
    const legacyConfig = path.join(workspacePath, ".zcode", "config.json");
    const legacySkill = path.join(workspacePath, ".agents", "skills", "dts-issue-flow", "SKILL.md");
    await mkdir(path.dirname(legacyConfig), { recursive: true });
    await writeFile(legacyConfig, '{"legacy":"config"}\n', "utf8");
    await mkdir(path.dirname(legacySkill), { recursive: true });
    await writeFile(legacySkill, "# 遗留技能\n", "utf8");

    const result = await initIssueWorkspace({ issuesRoot, ticket: "DTS-2026-1009" });
    expect(await readFile(legacyConfig, "utf8")).toBe('{"legacy":"config"}\n');
    expect(await readFile(legacySkill, "utf8")).toBe("# 遗留技能\n");
    expect(result.workspacePath).toBe(workspacePath);
  });

  it("再次 init 不覆盖已改过的报告(幂等保护)", async () => {
    const issuesRoot = await tempRoot();
    const first = await initIssueWorkspace({ issuesRoot, ticket: "DTS-2026-1010" });
    await writeFile(first.analysisReportPath, "# 已填写的报告\n\n## 问题现象\n实况\n", "utf8");

    await initIssueWorkspace({ issuesRoot, ticket: "DTS-2026-1010" });
    expect(await readFile(first.analysisReportPath, "utf8")).toContain("已填写的报告");
  });

  it("readAnalysisReport:在场返回内容,未建工作区返回 null", async () => {
    const issuesRoot = await tempRoot();
    expect(await readAnalysisReport(issuesRoot, "DTS-2026-1001")).toBeNull();
    await initIssueWorkspace({ issuesRoot, ticket: "DTS-2026-1001" });
    expect(await readAnalysisReport(issuesRoot, "DTS-2026-1001")).toContain("问题现象");
  });
});
