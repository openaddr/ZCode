/** 四件套工具的 MCP 面:工具定义、阶段门禁、服务调用映射(server_info 之外的业务工具)。 */
import type { DtsFlowService } from "../app/service.js";
import type { FlowToolName } from "../domain/issueFlow.js";
import { isToolAllowed } from "../domain/issueFlow.js";
import type { McpFaceHandlers, McpToolDefinition, McpToolResult } from "./mcpStdio.js";

const TOOL_DEFS: McpToolDefinition[] = [
  {
    name: "dts_get_ticket",
    description: "拉取 DTS 单据详情(标题/描述/级别/状态)。全程可用。",
    inputSchema: { type: "object", properties: { ticket: { type: "string", description: "单号" } }, required: ["ticket"] },
  },
  {
    name: "submit_analysis",
    description:
      "提交分析报告并触发用户确认闸(仅分析阶段)。前置:工作区根 issue-analysis.md 已含四章节(问题现象/问题根因/修改方案/置信度)。",
    inputSchema: {
      type: "object",
      properties: { ticket: { type: "string" }, confidence: { type: "string", description: "高/中/低,自报" } },
      required: ["ticket"],
    },
  },
  {
    name: "create_mr",
    description:
      "创建 MR(仅 MR 验绿阶段)。服务按期望分支名 master_<工号>_<单号> 直建,不采信你报的分支;依赖 codehubcli。",
    inputSchema: {
      type: "object",
      properties: {
        ticket: { type: "string" },
        repo: { type: "string", description: "代码仓 HTTPS 地址" },
        title: { type: "string" },
        description: { type: "string" },
      },
      required: ["ticket", "repo"],
    },
  },
  {
    name: "complete_stage",
    description:
      "阶段自报出口:完成当前阶段目标后调用。MR 阶段必带 mrs 申报清单(仓+MR 链接),服务对拍记账。",
    inputSchema: {
      type: "object",
      properties: {
        ticket: { type: "string" },
        stage: { type: "string", description: "dts_info|prep_repo|analyze|fix|mr_green" },
        mrs: {
          type: "array",
          description: "MR 申报清单(仅 mr_green 阶段必带)",
          items: { type: "object", properties: { repo: { type: "string" }, url: { type: "string" } } },
        },
      },
      required: ["ticket", "stage"],
    },
  },
];

function textResult(payload: unknown): McpToolResult {
  return { content: [{ type: "text", text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2) }] };
}

function errorResult(error: unknown): McpToolResult {
  return {
    content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
    isError: true,
  };
}

/** 阶段门禁 + 错误转 isError;引导层(本描述)与权威层(此处校验)同源于 STAGE_REGISTRY。 */
export function buildFlowToolHandlers(service: DtsFlowService): McpFaceHandlers {
  const callTool = async (name: string, args: Record<string, unknown>): Promise<McpToolResult> => {
    if (name === "server_info") return textResult(await service.configSummary());
    if (name === "dts_get_ticket") {
      const ticket = String(args["ticket"] ?? "");
      if (!ticket.trim()) return errorResult(new Error("缺少 ticket 参数"));
      try {
        return textResult(await service.getTicket(ticket));
      } catch {
        return errorResult(new Error(`查无此单或网关不可达: ${ticket}`));
      }
    }
    const ticket = String(args["ticket"] ?? "");
    if (!ticket.trim()) return errorResult(new Error("缺少 ticket 参数"));
    let ledger;
    try {
      ledger = await service.loadIssue(ticket);
    } catch {
      return errorResult(new Error(`单 ${ticket} 的台账不存在:先由发起动作创建问题会话`));
    }
    if (name !== "complete_stage" && !isToolAllowed(ledger.stage, name as FlowToolName)) {
      return errorResult(
        new Error(`工具 ${name} 在阶段「${ledger.stage}」不可用(阶段门禁);先用 complete_stage 推进到对应阶段`),
      );
    }
    try {
      switch (name as FlowToolName) {
        case "submit_analysis":
          return textResult(await service.submitAnalysis({ ticket, confidence: args["confidence"] as string | undefined }));
        case "create_mr":
          return textResult(
            await service.createMr({
              ticket,
              repo: String(args["repo"] ?? ""),
              title: args["title"] === undefined ? undefined : String(args["title"]),
              description: args["description"] === undefined ? undefined : String(args["description"]),
            }),
          );
        case "complete_stage":
          return textResult(
            await service.completeStage({
              ticket,
              stage: args["stage"] as string,
              mrs: (args["mrs"] as Array<{ repo: string; url: string }> | undefined) ?? [],
            }),
          );
        default:
          return errorResult(new Error(`未知工具: ${name}`));
      }
    } catch (error) {
      // 领域/依赖/网关错误如实转给 Agent;门禁拒绝不含敏感信息。
      return errorResult(error);
    }
  };
  return { listTools: () => TOOL_DEFS, callTool };
}
