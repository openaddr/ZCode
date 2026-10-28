import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildFlowToolHandlers } from "../src/adapters/mcpTools.js";
import { createDtsFlowService, type DtsFlowService } from "../src/contract.js";

function buildService(root: string): DtsFlowService {
  return createDtsFlowService(
    {
      dataDir: path.join(root, "data"),
      issuesRoot: path.join(root, "issues-ws"),
      binDir: path.join(root, "bin"),
      employeeId: "ning",
      cloudBaseUrl: null,
      dtsGatewayUrl: null,
      dtsTokenPath: path.join(root, "mcp-token"),
      httpPort: 0,
      mock: true,
      pipelineBudgetMinutes: 60,
    },
    { fetch, selfLauncher: { command: "node", args: ["serve.ts", "--stdio"] } },
  );
}

const FULL_REPORT = "# 报告\n\n## 问题现象\nx\n\n## 问题根因\ny\n\n## 修改方案\nz\n\n## 置信度\n高\n";

async function advanceToAnalyze(service: DtsFlowService, ticket: string, tier?: "full_auto"): Promise<void> {
  await service.initIssue({ ticket, interventionTier: tier });
  await service.completeStage({ ticket, stage: "dts_info" });
  await service.completeStage({ ticket, stage: "prep_repo" });
}

describe("flow tools(MCP 面)", () => {
  it("工具清单:四件套(server_info 由 stdio 面单独并排)", async () => {
    const handlers = buildFlowToolHandlers(buildService(await mkdtemp(path.join(tmpdir(), "mcp-tools-"))));
    const names = handlers.listTools().map((tool) => tool.name);
    expect(names).toEqual(["dts_get_ticket", "submit_analysis", "create_mr", "complete_stage"]);
  });

  it("dts_get_ticket 工读类不要求台账;mock 返回单据详情", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "mcp-tools-"));
    const handlers = buildFlowToolHandlers(buildService(root));
    const result = await handlers.callTool("dts_get_ticket", { ticket: "DTS-2026-1008" });
    expect(result.isError).toBeUndefined();
    expect(JSON.stringify(result.content)).toContain("大数据");

    const unknown = await handlers.callTool("dts_get_ticket", { ticket: "DTS-2026-9999" });
    expect(unknown.isError).toBe(true);
  });

  it("submit_analysis:模板四章节即过机械门票,闸举起等确认(优先对齐)", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "mcp-tools-"));
    const service = buildService(root);
    await advanceToAnalyze(service, "DTS-2026-1002");
    const handlers = buildFlowToolHandlers(service);

    const ok = await handlers.callTool("submit_analysis", { ticket: "DTS-2026-1002", confidence: "高" });
    expect(ok.isError).toBeUndefined();
    const ledger = await service.loadIssue("DTS-2026-1002");
    expect(ledger.analysisGate?.status).toBe("waiting");
    expect(ledger.stage).toBe("analyze");
  });

  it("缺章节的报告机械打回(isError 指名缺失章节)", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "mcp-tools-"));
    const service = buildService(root);
    await advanceToAnalyze(service, "DTS-2026-1004");
    const handlers = buildFlowToolHandlers(service);
    const workspace = path.join(root, "issues-ws", "DTS-2026-1004");
    await writeFile(path.join(workspace, "issue-analysis.md"), "# 报告\n\n## 问题现象\nx\n", "utf8");
    const broken = await handlers.callTool("submit_analysis", { ticket: "DTS-2026-1004" });
    expect(broken.isError).toBe(true);
    expect(JSON.stringify(broken.content)).toContain("问题根因");
    const ledger = await service.loadIssue("DTS-2026-1004");
    expect(ledger.analysisGate).toBeNull();
  });

  it("全自动档 submit_analysis 自动放行并推进到 fix", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "mcp-tools-"));
    const service = buildService(root);
    await advanceToAnalyze(service, "DTS-2026-1004", "full_auto");
    const handlers = buildFlowToolHandlers(service);
    const result = await handlers.callTool("submit_analysis", { ticket: "DTS-2026-1004" });
    expect(result.isError).toBeUndefined();
    const ledger = await service.loadIssue("DTS-2026-1004");
    expect(ledger.analysisGate?.status).toBe("auto_confirmed");
    expect(ledger.stage).toBe("fix");
  });

  it("complete_stage 不能绕过分析阶段出口", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "mcp-tools-"));
    const service = buildService(root);
    await service.initIssue({ ticket: "DTS-2026-1009" });
    await service.completeStage({ ticket: "DTS-2026-1009", stage: "dts_info" });
    const handlers = buildFlowToolHandlers(service);
    const result = await handlers.callTool("complete_stage", { ticket: "DTS-2026-1009", stage: "analyze" });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("submit_analysis");
  });

  it("create_mr:mr_green 前门禁拒绝;阶段到位后 mock 平台直接建单记账", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "mcp-tools-"));
    const service = buildService(root);
    await advanceToAnalyze(service, "DTS-2026-1010");
    const handlers = buildFlowToolHandlers(service);
    const early = await handlers.callTool("create_mr", { ticket: "DTS-2026-1010", repo: "https://x.git" });
    expect(early.isError).toBe(true);
    expect(JSON.stringify(early.content)).toContain("阶段门禁");

    const workspace = path.join(root, "issues-ws", "DTS-2026-1010");
    await writeFile(path.join(workspace, "issue-analysis.md"), FULL_REPORT, "utf8");
    await handlers.callTool("submit_analysis", { ticket: "DTS-2026-1010" });
    await service.confirmAnalysis({ ticket: "DTS-2026-1010", confirm: true });
    // 修复阶段走完(自报)才进 MR 验绿阶段。
    await service.completeStage({ ticket: "DTS-2026-1010", stage: "fix" });
    const late = await handlers.callTool("create_mr", { ticket: "DTS-2026-1010", repo: "https://x.git" });
    expect(late.isError).toBeUndefined();
    const ledger = await service.loadIssue("DTS-2026-1010");
    expect(ledger.mrAccounts).toHaveLength(1);
    expect(ledger.mrAccounts[0]?.branch).toBe("master_ning_DTS-2026-1010");
  });

  it("complete_stage(mr_green) 申报 MR 进台账", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "mcp-tools-"));
    const service = buildService(root);
    await advanceToAnalyze(service, "DTS-2026-1002");
    const workspace = path.join(root, "issues-ws", "DTS-2026-1002");
    await writeFile(path.join(workspace, "issue-analysis.md"), FULL_REPORT, "utf8");
    const handlers = buildFlowToolHandlers(service);
    await handlers.callTool("submit_analysis", { ticket: "DTS-2026-1002" });
    await service.confirmAnalysis({ ticket: "DTS-2026-1002", confirm: true });
    const result = await handlers.callTool("complete_stage", {
      ticket: "DTS-2026-1002",
      stage: "mr_green",
      mrs: [{ repo: "https://codehub/x.git", url: "https://mr/1" }],
    });
    expect(result.isError).toBeUndefined();
    const ledger = await service.loadIssue("DTS-2026-1002");
    expect(ledger.mrDeclarations).toHaveLength(1);
    expect(ledger.mrDeclarations[0]?.url).toBe("https://mr/1");
  });
});
