import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";

/** 施工票 3 起四件套工具住这里注册;一期只有 server_info 证明管道贯通。 */
export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export interface McpFaceHandlers {
  listTools(): McpToolDefinition[];
  callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult>;
}

export interface McpFaceOptions {
  input: Readable;
  output: Writable;
  serverInfo: { name: string; version: string };
}

/**
 * stdio MCP 面(最小 JSON-RPC 2.0,换行分隔帧)。
 * 只实现会话客户端真正打过来的方法:initialize / notifications/initialized / ping / tools/list / tools/call;
 * 协议版本回显请求值(dual-era 容忍,与宿主 @modelcontextprotocol/client 对齐,#39)。
 * --stdio 模式下 stdout 是协议通道:除本函数外任何代码不得向 stdout 写内容。
 */
export function createMcpStdioFace(handlers: McpFaceHandlers, options: McpFaceOptions): { start(): void; dispose(): void } {
  const readline = createInterface({ input: options.input });
  let disposed = false;

  const writeMessage = (message: unknown): void => {
    options.output.write(`${JSON.stringify(message)}\n`);
  };

  const respond = (id: number | string | null, result: unknown): void => {
    writeMessage({ jsonrpc: "2.0", id, result });
  };
  const respondError = (id: number | string | null, code: number, message: string): void => {
    writeMessage({ jsonrpc: "2.0", id, error: { code, message } });
  };

  const dispatch = async (message: Record<string, unknown>): Promise<void> => {
    const method = message["method"];
    if (typeof method !== "string") return;
    const rawId = message["id"];
    const id: string | number | null = typeof rawId === "string" || typeof rawId === "number" ? rawId : null;
    const hasId = Object.prototype.hasOwnProperty.call(message, "id");
    const params = (message["params"] ?? {}) as Record<string, unknown>;

    if (!hasId) {
      // 通知:initialized 等,不需要应答。
      return;
    }
    try {
      if (method === "initialize") {
        respond(id, {
          protocolVersion: typeof params["protocolVersion"] === "string" ? params["protocolVersion"] : "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: options.serverInfo,
        });
        return;
      }
      if (method === "ping") {
        respond(id, {});
        return;
      }
      if (method === "tools/list") {
        respond(id, { tools: handlers.listTools() });
        return;
      }
      if (method === "tools/call") {
        const name = typeof params["name"] === "string" ? params["name"] : "";
        const args = (params["arguments"] ?? {}) as Record<string, unknown>;
        try {
          respond(id, await handlers.callTool(name, args));
        } catch (error) {
          respond(id, {
            content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
            isError: true,
          });
        }
        return;
      }
      respondError(id, -32601, `方法不存在: ${method}`);
    } catch (error) {
      respondError(id, -32603, error instanceof Error ? error.message : String(error));
    }
  };

  return {
    start() {
      readline.on("line", (line) => {
        if (disposed || !line.trim()) return;
        let message: Record<string, unknown>;
        try {
          message = JSON.parse(line) as Record<string, unknown>;
        } catch {
          respondError(null, -32700, `无法解析的帧: ${line.slice(0, 80)}`);
          return;
        }
        void dispatch(message);
      });
    },
    dispose() {
      disposed = true;
      readline.close();
    },
  };
}

export const SERVER_INFO_TOOL: McpToolDefinition = {
  name: "server_info",
  description: "返回 mae-dts-flow 服务自身信息(工号/mock 模式/数据目录),用于会话开场自检。",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
};
