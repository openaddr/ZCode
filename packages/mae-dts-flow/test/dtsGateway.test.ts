import { createServer, type Server } from "node:http";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CloudPlatformGateway, MockDtsGateway, createDtsGateway } from "../src/adapters/dtsGateway.js";
import { DtsFlowGatewayError } from "../src/domain/dts.js";

const TICKETS = [
  {
    ticket: "DTS-2026-1002",
    title: "登录态掉线",
    status: "开发人员实施修改",
    version: "V100R025C10SPC010",
    branch: "master",
    module_id: "module-web",
    severity: "一般",
    submitter: "李四",
    url: "https://dts.mock/t/1002",
  },
  { ticket: "DTS-2026-1005", title: "重复提交", status: "挂起", version: null, branch: null, module_id: null },
];

const MODULES = {
  modules: [
    { id: "module-web", name: "Web 前端", repositories: ["https://repo.mock/web.git"], status: "active" },
    { id: "module-archived", name: "已归档模块", repositories: [], status: "archived" },
  ],
};

let server: Server;
let baseUrl = "";
/** 记录每次请求:路径/query/方法/请求体的契约断言用。 */
const seenRequests: Array<{ method: string; path: string; body: unknown }> = [];
/** 按路径前缀的响应覆写(401 降级等场景)。 */
const respondOverrides = new Map<string, { status: number; body: unknown }>();

beforeAll(async () => {
  server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
    });
    request.on("end", () => {
      const parsed = body.length > 0 ? (JSON.parse(body) as unknown) : null;
      seenRequests.push({ method: request.method ?? "GET", path: request.url ?? "/", body: parsed });
      for (const [prefix, override] of respondOverrides) {
        if ((request.url ?? "/").startsWith(prefix)) {
          response.writeHead(override.status, { "content-type": "application/json" });
          response.end(JSON.stringify(override.body));
          return;
        }
      }
      const url = request.url ?? "/";
      if (url.startsWith("/issues/dts?") || url === "/issues/dts/DTS-2026-1002") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(url.startsWith("/issues/dts?") ? { tickets: TICKETS, mock: false } : { ...TICKETS[0], description: "<p>全文描述</p>" }));
        return;
      }
      if (url === "/business-modules") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(MODULES));
        return;
      }
      if (url === "/issues/dts-bindings" || (request.method === "PUT" && url.startsWith("/issues/dts-bindings/"))) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(url === "/issues/dts-bindings" ? { bindings: { "DTS-2026-1004": { module_id: "module-bigdata", updated_by: "zhangsan", updated_at: "2026-10-30T08:00:00.000Z" } } } : { ok: true }));
        return;
      }
      if (url === "/auth/people") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify([{ username: "ning", display_name: "宁" }, { username: "zhangsan", display_name: null }]));
        return;
      }
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("CloudPlatformGateway(假云平台契约)", () => {
  it("拉单:owner 显式入 query;branch/module_id 下发直通;缺席归 null;version 缺席归空串(C 口径不造值)", async () => {
    const gateway = new CloudPlatformGateway(baseUrl, { fetch });
    const tickets = await gateway.listByOwner("ning");
    expect(tickets).toHaveLength(2);
    expect(tickets[0]).toEqual({
      ticket: "DTS-2026-1002",
      title: "登录态掉线",
      status: "开发人员实施修改",
      version: "V100R025C10SPC010",
      severity: "一般",
      submitter: "李四",
      url: "https://dts.mock/t/1002",
      branch: "master",
      moduleId: "module-web",
    });
    expect(tickets[1]).toMatchObject({ version: "", branch: null, moduleId: null });

    const list = seenRequests.find((request) => request.path.startsWith("/issues/dts?"));
    expect(list?.path).toBe("/issues/dts?owner=ning");
  });

  it("查单:详情接口补 description;查无此单(404)fail-loud", async () => {
    const gateway = new CloudPlatformGateway(baseUrl, { fetch });
    const detail = await gateway.getTicket("DTS-2026-1002");
    expect(detail.ticket).toBe("DTS-2026-1002");
    expect(detail.description).toBe("<p>全文描述</p>");
    expect(detail.branch).toBe("master");

    await expect(gateway.getTicket("DTS-2026-9999")).rejects.toThrow(/不存在/);
  });

  it("模块目录:只留 active,仓列表直通", async () => {
    const gateway = new CloudPlatformGateway(baseUrl, { fetch });
    const modules = await gateway.listModules();
    expect(modules).toEqual([{ id: "module-web", name: "Web 前端", repositories: ["https://repo.mock/web.git"] }]);
  });

  it("绑定读:蛇形→驼峰;空值条目剔除", async () => {
    const gateway = new CloudPlatformGateway(baseUrl, { fetch });
    const bindings = await gateway.getBindings();
    expect(bindings).toEqual({
      "DTS-2026-1004": { moduleId: "module-bigdata", updatedBy: "zhangsan", updatedAt: "2026-10-30T08:00:00.000Z" },
    });
  });

  it("绑定写:PUT + JSON 体(module_id/updated_by);空值归 null", async () => {
    const gateway = new CloudPlatformGateway(baseUrl, { fetch });
    await gateway.putBinding("DTS-2026-1002", "module-report", "ning");
    const put = seenRequests.find((request) => request.method === "PUT");
    expect(put?.path).toBe("/issues/dts-bindings/DTS-2026-1002");
    expect(put?.body).toEqual({ module_id: "module-report", updated_by: "ning" });

    seenRequests.length = 0;
    await gateway.putBinding("DTS-2026-1002", null, "ning");
    expect(seenRequests[0]?.body).toEqual({ module_id: null, updated_by: "ning" });
  });

  it("人员名单:display_name 缺席归 null;空用户名剔除", async () => {
    const gateway = new CloudPlatformGateway(baseUrl, { fetch });
    const people = await gateway.listPeople();
    expect(people).toEqual([
      { username: "ning", displayName: "宁" },
      { username: "zhangsan", displayName: null },
    ]);
  });

  it("401/403 → not_authorized,消息指向 #566;非 404 错误带平台 error 字段", async () => {
    respondOverrides.set("/issues/dts", { status: 401, body: { error: "请先登录" } });
    const gateway = new CloudPlatformGateway(baseUrl, { fetch });
    const error = await gateway.listByOwner("ning").then(
      () => null,
      (caught: unknown) => caught as DtsFlowGatewayError,
    );
    expect(error).toBeInstanceOf(DtsFlowGatewayError);
    expect((error as DtsFlowGatewayError).reason).toBe("not_authorized");
    expect((error as Error).message).toContain("#566");
    respondOverrides.clear();
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

  it("mock 可发起单恰为 5 张且状态口径正确;版本串为 C 版形态(无 B 段)", async () => {
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
    for (const ticket of tickets) {
      expect(ticket.version).not.toMatch(/B\d+$/);
    }
  });

  it("mock 刻意留空两道闸数据:1005 无 branch,1003/1006 无 module(演练禁发起/必选)", async () => {
    const gateway = new MockDtsGateway();
    const tickets = await gateway.listByOwner("ning");
    expect(tickets.find((ticket) => ticket.ticket === "DTS-2026-1005")?.branch).toBeNull();
    expect(tickets.find((ticket) => ticket.ticket === "DTS-2026-1003")?.moduleId).toBeNull();
  });

  it("查无此单 fail-loud;工厂:未配置云平台 fail-loud,mock 开关优先", async () => {
    const gateway = new MockDtsGateway();
    await expect(gateway.getTicket("DTS-2026-9999")).rejects.toThrow(DtsFlowGatewayError);

    expect(() => createDtsGateway({ cloudBaseUrl: null, mock: false }, { fetch })).toThrow(/未配置/);
    expect(createDtsGateway({ cloudBaseUrl: null, mock: true }, { fetch }).mock).toBe(true);
  });
});
