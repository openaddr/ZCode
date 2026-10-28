import { PassThrough } from "node:stream";

import { describe, expect, it } from "vitest";

import { SERVER_INFO_TOOL, createMcpStdioFace, type McpFaceHandlers } from "../src/adapters/mcpStdio.js";

function buildFace(handlers: McpFaceHandlers) {
  const input = new PassThrough();
  const output = new PassThrough();
  const face = createMcpStdioFace(handlers, {
    input,
    output,
    serverInfo: { name: "mae-dts-flow", version: "0.1.0" },
  });
  face.start();
  const responses: Array<Record<string, unknown>> = [];
  let buffer = "";
  output.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) responses.push(JSON.parse(line) as Record<string, unknown>);
      newlineIndex = buffer.indexOf("\n");
    }
  });
  const send = (message: Record<string, unknown>): void => {
    input.write(`${JSON.stringify(message)}\n`);
  };
  const sendRaw = (raw: string): void => {
    input.write(raw);
  };
  const responseFor = async (id: number): Promise<Record<string, unknown>> => {
    for (let waited = 0; waited < 50; waited += 1) {
      const found = responses.find((message) => message["id"] === id);
      if (found !== undefined) return found;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`未等到 id=${String(id)} 的响应`);
  };
  return { send, sendRaw, responses, responseFor, face };
}

const handlers: McpFaceHandlers = {
  listTools: () => [SERVER_INFO_TOOL],
  callTool: async (name) => {
    if (name !== SERVER_INFO_TOOL.name) throw new Error(`未知工具: ${name}`);
    return { content: [{ type: "text", text: JSON.stringify({ employeeId: "dev", mock: true }) }] };
  },
};

describe("mcp stdio face", () => {
  it("initialize 回显协议版本并报 serverInfo;tools/list 与 tools/call 走 handlers", async () => {
    const session = buildFace(handlers);
    session.send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
    const initialized = await session.responseFor(1);
    const result = initialized["result"] as Record<string, unknown>;
    expect(result["protocolVersion"]).toBe("2025-06-18");
    expect((result["serverInfo"] as Record<string, unknown>)["name"]).toBe("mae-dts-flow");

    session.send({ jsonrpc: "2.0", method: "notifications/initialized" });
    session.send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    const tools = await session.responseFor(2);
    expect(((tools["result"] as Record<string, unknown>)["tools"] as unknown[]).length).toBe(1);

    session.send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "server_info", arguments: {} } });
    const call = await session.responseFor(3);
    const callResult = call["result"] as Record<string, unknown>;
    expect(callResult["isError"]).toBeUndefined();
    expect(JSON.stringify(callResult["content"])).toContain("dev");
  });

  it("工具抛错转 isError 结果;未知方法 -32601;坏帧 -32700", async () => {
    const session = buildFace(handlers);
    session.send({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "nope", arguments: {} } });
    const errored = await session.responseFor(1);
    expect((errored["result"] as Record<string, unknown>)["isError"]).toBe(true);

    session.send({ jsonrpc: "2.0", id: 2, method: "resources/list" });
    const unknownMethod = await session.responseFor(2);
    expect(((unknownMethod["error"] as Record<string, unknown>)["code"] as number)).toBe(-32601);

    session.sendRaw("not-json\n");
    const badFrame = await session.responseFor(null);
    expect(((badFrame["error"] as Record<string, unknown>)["code"] as number)).toBe(-32700);
  });
});
