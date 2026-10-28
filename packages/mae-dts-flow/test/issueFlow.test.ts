import { describe, expect, it } from "vitest";

import {
  REPORT_SECTIONS,
  STAGE_REGISTRY,
  answerAnalysisGate,
  buildAnalysisReportTemplate,
  buildMcpConfigJson,
  buildOpeningBrief,
  buildSkillMarkdown,
  expectedBranch,
  isToolAllowed,
  raiseAnalysisGate,
  validateAnalysisReport,
} from "../src/domain/issueFlow.js";
import type { IssueLedger } from "../src/domain/ledger.js";

function ledgerWith(tier: IssueLedger["interventionTier"], stage: IssueLedger["stage"]): IssueLedger {
  return {
    ticket: "DTS-2026-1008",
    interventionTier: tier,
    stage,
    stages: { dts_info: "done", prep_repo: "done", analyze: "in_progress", fix: "pending", mr_green: "pending" },
    rounds: 0,
    analysisGate: null,
    mrDeclarations: [],
    closedAt: null,
    archived: false,
    createdAt: "2026-10-28T00:00:00Z",
    updatedAt: "2026-10-28T00:00:00Z",
  };
}

describe("stage registry & tool gating", () => {
  it("五阶段注册表:标签与目标齐备", () => {
    expect(STAGE_REGISTRY.map((spec) => spec.label)).toEqual(["拉单", "拉仓", "分析", "修复", "MR 验绿"]);
    expect(STAGE_REGISTRY.every((spec) => spec.goal.length > 0)).toBe(true);
  });

  it("阶段工具门禁:跨阶段通用两件,analyze 卡 submit_analysis,mr_green 放 create_mr", () => {
    expect(isToolAllowed("fix", "dts_get_ticket")).toBe(true);
    expect(isToolAllowed("fix", "complete_stage")).toBe(true);
    expect(isToolAllowed("prep_repo", "submit_analysis")).toBe(false);
    expect(isToolAllowed("analyze", "submit_analysis")).toBe(true);
    expect(isToolAllowed("fix", "submit_analysis")).toBe(false);
    expect(isToolAllowed("analyze", "create_mr")).toBe(false);
    expect(isToolAllowed("mr_green", "create_mr")).toBe(true);
  });
});

describe("analysis report gate", () => {
  it("四章节齐备通过;缺章节列出缺失", () => {
    const full = buildAnalysisReportTemplate("DTS-2026-1008");
    expect(validateAnalysisReport(full)).toEqual({ ok: true, missing: [] });
    expect(REPORT_SECTIONS).toEqual(["问题现象", "问题根因", "修改方案", "置信度"]);
    const broken = "# 报告\n\n## 问题现象\n内容\n";
    expect(validateAnalysisReport(broken)).toEqual({ ok: false, missing: ["问题根因", "修改方案", "置信度"] });
  });

  it("闸举起→确认/拒绝;full_auto 自动放行", () => {
    const now = new Date("2026-10-28T08:00:00Z");
    const ledger = raiseAnalysisGate(ledgerWith("align_first", "analyze"), now);
    expect(ledger.analysisGate?.status).toBe("waiting");
    const confirmed = answerAnalysisGate(ledger, true, now);
    expect(confirmed.analysisGate?.status).toBe("confirmed");
    const rejected = answerAnalysisGate(raiseAnalysisGate(ledgerWith("align_first", "analyze"), now), false, now);
    expect(rejected.analysisGate?.status).toBe("rejected");
    const auto = answerAnalysisGate(raiseAnalysisGate(ledgerWith("full_auto", "analyze"), now), true, now, true);
    expect(auto.analysisGate?.status).toBe("auto_confirmed");
  });
});

describe("materialization templates", () => {
  it("分支名契约 master_<工号>_<单号>", () => {
    expect(expectedBranch("ning", "DTS-2026-1008")).toBe("master_ning_DTS-2026-1008");
  });

  it("项目级 MCP 配置形状:.zcode/config.json → mcp.servers[].{type,command,args}", () => {
    const json = buildMcpConfigJson("node", ["serve.ts", "--stdio"]);
    const parsed = JSON.parse(json) as { mcp: { servers: Record<string, { type: string; command: string; args: string[] }> } };
    const server = parsed.mcp.servers["dts-flow"];
    expect(server.type).toBe("stdio");
    expect(server.args).toContain("--stdio");
  });

  it("技能物化含单号/工号/分支/四章节/阶段清单", () => {
    const md = buildSkillMarkdown({
      ticket: "DTS-2026-1008",
      employeeId: "ning",
      branch: "master_ning_DTS-2026-1008",
      workspacePath: "/ws",
      stageGoals: "",
    });
    expect(md).toContain("DTS-2026-1008");
    expect(md).toContain("master_ning_DTS-2026-1008");
    expect(md).toContain("git push origin HEAD:master_ning_DTS-2026-1008");
    expect(md).toContain("问题现象");
    expect(md).toContain("complete_stage");
    expect(md).toContain("submit_analysis");
  });

  it("开场词含单据事实/档位/分支", () => {
    const brief = buildOpeningBrief({
      ticket: "DTS-2026-1008",
      title: "集群 OOM",
      severity: "致命",
      description: "偶发挂死",
      workspacePath: "/ws",
      branch: "master_ning_DTS-2026-1008",
      interventionTier: "align_first",
    });
    expect(brief).toContain("DTS-2026-1008");
    expect(brief).toContain("集群 OOM");
    expect(brief).toContain("致命");
    expect(brief).toContain("align_first");
  });
});
