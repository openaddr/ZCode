import { createServer, type Server } from "node:http";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { McpDtsGateway, MockDtsGateway, createDtsGateway } from "../src/adapters/dtsGateway.js";
import { DtsFlowGatewayError } from "../src/domain/dts.js";

const DATAS = [{ dtsBizNo: "DTS-2026-1002", briefDesc: "登录态掉线", dtsStatusName: "开发人员实施修改" }];

let server: Server;
let baseUrl = "";
/** 记录每次请求:握手/回带头/argN 映射的契约断言用。 */
const seenRequests: Array<{ headers: Record<string, unknown>; body: Record<string, unknown> }> = [];
let toolCallCount = 0;
/** 第一轮工具调用模拟会话过期,验证重建握手重试一次。 */
let expireFirstCall = false;

beforeAll(async () => {
  server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
    });
    request.on("end", () => {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      seenRequests.push({ headers: { ...request.headers }, body: parsed });
      if (parsed["method"] === "initialize") {
        response.writeHead(200, { "content-type": "application/json", "mcp-session-id": "sess-123" });
        response.end(
          JSON.stringify({ jsonrpc: "2.0", id: parsed["id"], result: { protocolVersion: "2025-03-26", capabilities: {}, serverInfo: { name: "dts", version: "1" } } }),
        );
        return;
      }
      if (parsed["method"] === "notifications/initialized") {
        response.writeHead(202);
        response.end();
        return;
      }
      if (parsed["method"] === "tools/call") {
        toolCallCount += 1;
        if (expireFirstCall && toolCallCount === 1) {
          response.writeHead(404, { "content-type": "application/json" });
          response.end(JSON.stringify({ jsonrpc: "2.0", id: parsed["id"], error: { code: -32000, message: "session expired: 404 not found" } }));
          return;
        }
        // SSE 形态响应(网关实测两形态之一),验证容忍。
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.end(
          `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: parsed["id"], result: { content: [{ type: "text", text: JSON.stringify({ status: "success", result: { datas: DATAS } }) }] } })}\n\n`,
        );
        return;
      }
      response.writeHead(404);
      response.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function tempToken(content: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "mae-dts-flow-token-"));
  const file = path.join(dir, "mcp-token");
  await writeFile(file, content, "utf8");
  return file;
}

describe("McpDtsGateway(假 HTTP 网关契约)", () => {
  it("握手→回带会话头→x-auth-token→SSE 响应解析→datas 映射", async () => {
    const tokenPath = await tempToken("token-abc");
    let tokenReads = 0;
    const gateway = new McpDtsGateway(baseUrl, {
      fetch,
      readToken: async () => {
        tokenReads += 1;
        const { readFile } = await import("node:fs/promises");
        return (await readFile(tokenPath, "utf8")).trim();
      },
    });

    const tickets = await gateway.listByOwner("ning");
    expect(tickets).toHaveLength(1);
    expect(tickets[0]).toMatchObject({ ticket: "DTS-2026-1002", status: "开发人员实施修改" });

    const init = seenRequests.find((request) => request.body["method"] === "initialize");
    expect(init).toBeDefined();
    const params = init?.body["params"] as Record<string, unknown>;
    expect(params["protocolVersion"]).toBe("2025-03-26");
    expect((init?.headers["x-auth-token"] as string)).toBe("token-abc");

    const call = seenRequests.find((request) => request.body["method"] === "tools/call");
    expect((call?.headers["mcp-session-id"] as string)).toBe("sess-123");
    const callParams = call?.body["params"] as Record<string, unknown>;
    expect(callParams["name"]).toBe("listByVersionAndHead");
    const args = callParams["arguments"] as unknown[];
    expect(args).toHaveLength(14);
    expect(args[12]).toEqual([{ fieldName: "currentHandler", operator: "EqualName", value: ["ning"] }]);
    expect(tokenReads).toBeGreaterThanOrEqual(1);
  });

  it("会话过期:重建握手重试一次后成功", async () => {
    expireFirstCall = true;
    toolCallCount = 0;
    const gateway = new McpDtsGateway(baseUrl, { fetch, readToken: async () => "" });
    const tickets = await gateway.listByOwner("ning");
    expect(tickets).toHaveLength(1);
    const initializeCount = seenRequests.filter((request) => request.body["method"] === "initialize").length;
    expect(initializeCount).toBeGreaterThanOrEqual(2);
    expireFirstCall = false;
  });

  it("查单:datas[0] 作详情,标题缺失从 briefDesc 补;查无此单 fail-loud", async () => {
    const gateway = new McpDtsGateway(baseUrl, { fetch, readToken: async () => "" });
    const detail = await gateway.getTicket("ning", "DTS-2026-1002");
    expect(detail.ticket).toBe("DTS-2026-1002");
    expect(detail.description).toContain("登录态");
  });
});

describe("MockDtsGateway 与工厂", () => {
  it("罐头列表确定性轮转:同账号顺序稳定,跨账号不同", async () => {
    const gateway = new MockDtsGateway();
    const first = await gateway.listByOwner("ning");
    const again = await gateway.listByOwner("ning");
    expect(first.map((ticket) => ticket.ticket)).toEqual(again.map((ticket) => ticket.ticket));
    expect(first).toHaveLength(10);
    const other = await gateway.listByOwner("dev");
    expect(first.map((ticket) => ticket.ticket)).not.toEqual(other.map((ticket) => ticket.ticket));
  });

  it("mock 可发起单恰为 5 张且状态口径正确", async () => {
    const gateway = new MockDtsGateway();
    const tickets = await gateway.listByOwner("ning");
    const actionable = tickets.filter((ticket) => ticket.status === "开发人员实施修改");
    expect(actionable.map((ticket) => ticket.ticket).sort()).toEqual([
      "DTS-2026-1002",
      "DTS-2026-1004",
      "DTS-2026-1008",
      "DTS-2026-1009",
      "DTS-2026-1010",
    ]);
  });

  it("查无此单 fail-loud;工厂:未配置真网关 fail-loud,mock 开关优先", async () => {
    const gateway = new MockDtsGateway();
    await expect(gateway.getTicket("ning", "DTS-2026-9999")).rejects.toThrow(DtsFlowGatewayError);

    expect(() =>
      createDtsGateway({ dtsGatewayUrl: null, dtsTokenPath: "x", mock: false }, { fetch, readToken: async () => "" }),
    ).toThrow(/未配置/);
    expect(createDtsGateway({ dtsGatewayUrl: null, dtsTokenPath: "x", mock: true }, { fetch, readToken: async () => "" }).mock).toBe(true);
  });
});
