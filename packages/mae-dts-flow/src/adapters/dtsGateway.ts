/** DTS 网关:mock 与真实 MCP 网关同接口;对接事实对拍记录 openaddr/ZCode#38。 */
import { promises as fs } from "node:fs";

import {
  type DtsTicketDetail,
  type DtsTicketSummary,
  DtsFlowGatewayError,
  buildDetailArgs,
  buildListArgs,
  extractDatas,
  mapDtsRow,
  parseToolResultText,
} from "../domain/dts.js";
import { MOCK_TICKETS } from "./dtsMockData.js";

export interface DtsGateway {
  /** mock 标记:UI 据此亮 DEV 横幅。 */
  readonly mock: boolean;
  /** 名下单列表(网关侧按账号过滤;返回含全部状态,可发起过滤在领域层)。 */
  listByOwner(account: string): Promise<DtsTicketSummary[]>;
  /** 查单;查无此单 fail-loud(不静默)。 */
  getTicket(account: string, ticket: string): Promise<DtsTicketDetail>;
}

export interface DtsGatewayDeps {
  fetch: typeof fetch;
  /** x-auth-token 读取器:每次请求现取现用(文件轮换免重启);空串则不设头。 */
  readToken: () => Promise<string>;
}

const PROTOCOL_VERSION = "2025-03-26";
const CLIENT_INFO = { name: "zcode-mae-dts-flow", version: "1" };

/** 真实网关:MCP(JSON-RPC 2.0 over HTTP POST),响应兼容 json/SSE 两形态。 */
export class McpDtsGateway implements DtsGateway {
  readonly mock = false;
  private sessionId: string | null = null;

  constructor(
    private readonly url: string,
    private readonly deps: DtsGatewayDeps,
  ) {}

  async listByOwner(account: string): Promise<DtsTicketSummary[]> {
    const envelope = await this.callTool("listByVersionAndHead", buildListArgs(account));
    return extractDatas(envelope)
      .map(mapDtsRow)
      .filter((row) => row.ticket.trim().length > 0);
  }

  async getTicket(account: string, ticket: string): Promise<DtsTicketDetail> {
    const envelope = await this.callTool("batchQueryTicket", buildDetailArgs(ticket));
    const rows = extractDatas(envelope);
    const row = rows[0];
    if (row === undefined) {
      throw new DtsFlowGatewayError(`查无此单: ${ticket}`, "not_found");
    }
    const summary = mapDtsRow(row);
    const detailDesc = String(row["detailDesc"] ?? "");
    return { ...summary, title: summary.title || `DTS ${ticket}`, description: detailDesc || summary.title };
  }

  /** 单工具调用:带会话握手;会话过期(404/expired)重建握手重试一次。 */
  private async callTool(toolName: string, args: unknown[]): Promise<unknown> {
    await this.ensureSession();
    try {
      return await this.callToolOnce(toolName, args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/404|session|expired|not found/i.test(message)) throw error;
      this.sessionId = null;
      await this.ensureSession();
      return this.callToolOnce(toolName, args);
    }
  }

  private async ensureSession(): Promise<void> {
    if (this.sessionId !== null) return;
    const initResult = {
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO },
    };
    const response = await this.post(initResult);
    this.sessionId = response.headers.get("mcp-session-id");
    // notifications/initialized:失败容忍(部分网关不回包也不报错)。
    await this.post({ jsonrpc: "2.0", method: "notifications/initialized" }).catch(() => undefined);
  }

  private async callToolOnce(toolName: string, args: unknown[]): Promise<unknown> {
    const response = await this.post({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    });
    const bodyText = await response.text();
    let rpcResult: Record<string, unknown>;
    try {
      const parsed = JSON.parse(this.unwrapSse(bodyText)) as Record<string, unknown>;
      rpcResult = (parsed["result"] ?? parsed) as Record<string, unknown>;
    } catch {
      throw new DtsFlowGatewayError(`网关响应不是合法 JSON-RPC: ${bodyText.slice(0, 200)}`, "unparsable");
    }
    if (response.status >= 400 || rpcResult["error"] !== undefined) {
      const error = rpcResult["error"] as Record<string, unknown> | undefined;
      const message = String(error?.["message"] ?? `HTTP ${String(response.status)}`);
      throw new DtsFlowGatewayError(`网关工具调用失败: ${message}`, "unreachable");
    }
    return parseToolResultText(rpcResult["content"]);
  }

  private async post(body: Record<string, unknown>): Promise<Response> {
    const token = await this.deps.readToken();
    const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream" };
    if (token) headers["x-auth-token"] = token;
    if (this.sessionId !== null) headers["mcp-session-id"] = this.sessionId;
    let response: Response;
    try {
      response = await this.deps.fetch(this.url, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
    } catch (error) {
      throw new DtsFlowGatewayError(`DTS 网关不可达(${String(error)})`, "unreachable");
    }
    const sessionId = response.headers.get("mcp-session-id");
    if (sessionId !== null) this.sessionId = sessionId;
    return response;
  }

  /** SSE 形态:取最后一个 data: 行的载荷;json 形态原样返回。 */
  private unwrapSse(body: string): string {
    if (!body.includes("data:")) return body;
    const dataLines = body
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim());
    return dataLines.at(-1) ?? body;
  }
}

/** mock 网关:罐头单据,确定性轮转(按账号哈希偏移,人人有单);查无此单 fail-loud。 */
export class MockDtsGateway implements DtsGateway {
  readonly mock = true;

  async listByOwner(account: string): Promise<DtsTicketSummary[]> {
    const offset = [...account].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % MOCK_TICKETS.length;
    return MOCK_TICKETS.map((_, index) => MOCK_TICKETS[(index + offset) % MOCK_TICKETS.length] as DtsTicketSummary);
  }

  async getTicket(_account: string, ticket: string): Promise<DtsTicketDetail> {
    const found = MOCK_TICKETS.find((item) => item.ticket === ticket);
    if (!found) {
      throw new DtsFlowGatewayError(`查无此单: ${ticket}`, "not_found");
    }
    return found;
  }
}

export interface CreateGatewayInput {
  dtsGatewayUrl: string | null;
  dtsTokenPath: string;
  mock: boolean;
}

/** 网关工厂:mock 开关优先;真网关未配置地址 fail-loud(如实报,不静默降级)。 */
export function createDtsGateway(input: CreateGatewayInput, deps: DtsGatewayDeps): DtsGateway {
  if (input.mock) return new MockDtsGateway();
  if (input.dtsGatewayUrl === null) {
    throw new DtsFlowGatewayError(
      "DTS 网关未配置:写入配置 dtsGatewayUrl 与 dtsTokenPath(token 文件,权限 600),或改用 mock 模式",
      "not_configured",
    );
  }
  return new McpDtsGateway(input.dtsGatewayUrl, deps);
}

/** token 文件读取器:每次现读(轮换免重启);读失败降级为空串(无认证头,让网关 401 显形)。 */
export function tokenFileReader(tokenPath: string): () => Promise<string> {
  return async () => {
    try {
      const content = (await fs.readFile(tokenPath, "utf8")).trim();
      return content;
    } catch {
      return "";
    }
  };
}
