/**
 * mock 云平台服务(openaddr/ZCode#69):按 mae-flow-cloud ADR-0069 匿名六端点的真实
 * 响应形状镜像(对照 src/issueFlow/routes.ts 与 src/server.ts 逐字段核对,防两边一起错):
 *   GET  /issues/dts?owner=            → { tickets: [...], mock }
 *   GET  /issues/dts/:ticket           → 单条 brief + description
 *   GET  /issues/dts-bindings          → { bindings: { [单号]: {module_id,updated_by,updated_at} } }
 *   PUT  /issues/dts-bindings/:ticket  → body {module_id, account};缺 account 400,未知模块 409
 *   GET  /business-modules             → { modules: [...](active 过滤在客户端) }
 *   GET  /auth/people                  → 裸数组 [{username, display_name?}]
 * 数据复用 dtsMockData 同源夹具(与内置 MockDtsGateway 看板内容一致)。
 *
 * 场景开关:
 *   MOCK_CLOUD_SCENARIO=unauthorized  全端点 401(模拟内网平台旧于 #567,验证降级面板)
 *   MOCK_CLOUD_REPO_DIR=<dir>         模块 repositories 全部改指 file:///<dir>(E2E fixture 仓)
 * 可直接运行:`pnpm exec tsx packages/mae-dts-flow/test/mocks/mockCloudServer.ts`
 * (MOCK_CLOUD_PORT 缺省 8790)。
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { pathToFileURL } from "node:url";

import {
  MOCK_BINDINGS,
  MOCK_MODULES,
  MOCK_PEOPLE,
  MOCK_TICKETS,
} from "../../src/adapters/dtsMockData.js";

export type MockCloudScenario = "ok" | "unauthorized";

export interface MockCloudServerOptions {
  scenario?: MockCloudScenario;
  /** 覆盖模块仓 URL(E2E 指向本地 fixture git 仓);缺省用夹具自带的 repo.mock 地址。 */
  repositoryUrlOverride?: string;
}

export interface MockCloudServer {
  /** 实际监听地址(测试用 ephemeral 端口;脚本模式用 MOCK_CLOUD_PORT)。 */
  url(): string;
  /** PUT 改选留痕(断言写路径用):[ticket, moduleId, account]。 */
  putLog(): Array<{ ticket: string; moduleId: string | null; account: string }>;
  /** 当前绑定表(深拷贝)。 */
  bindings(): Record<string, { module_id: string; updated_by: string; updated_at: string }>;
  close(): Promise<void>;
}

interface MockCloudState {
  scenario: MockCloudScenario;
  briefs: ReturnType<typeof cloudBriefs>;
  modules: ReturnType<typeof cloudModules>;
  people: ReturnType<typeof cloudPeople>;
  bindings: Record<string, { module_id: string; updated_by: string; updated_at: string }>;
  puts: Array<{ ticket: string; moduleId: string | null; account: string }>;
}

/** 夹具单据 → 云平台蛇形 brief(与平台 GET /issues/dts 响应逐字段同形)。 */
function cloudBriefs() {
  return MOCK_TICKETS.map((ticket) => ({
    ticket: ticket.ticket,
    title: ticket.title,
    status: ticket.status,
    version: ticket.version,
    severity: ticket.severity,
    submitter: ticket.submitter,
    url: ticket.url,
    branch: ticket.branch,
    module_id: ticket.moduleId,
    description: `<p>${ticket.title}</p>`,
  }));
}

const cloudModules = (repositoryUrlOverride?: string) =>
  MOCK_MODULES.map((module) => ({
    id: module.id,
    name: module.name,
    status: "active",
    repositories: repositoryUrlOverride !== undefined ? [repositoryUrlOverride] : module.repositories,
  }));

const cloudPeople = () =>
  MOCK_PEOPLE.map((person) => ({
    username: person.username,
    ...(person.displayName ? { display_name: person.displayName } : {}),
  }));

const cloudBindings = () =>
  Object.fromEntries(
    Object.entries(MOCK_BINDINGS).map(([ticket, entry]) => [
      ticket,
      { module_id: entry.moduleId, updated_by: entry.updatedBy, updated_at: entry.updatedAt },
    ]),
  );

function handleMockCloudRequest(state: MockCloudState, request: IncomingMessage, response: ServerResponse): void {
  const url = new URL(request.url ?? "/", "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean);
  const send = (status: number, body: unknown): void => {
    response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(body));
  };
  // 平台旧于 #567 的形态:免登录清单未放行,全部打回 401。
  if (state.scenario === "unauthorized") {
    send(401, { error: "尚未登录" });
    return;
  }

  if (request.method === "GET" && parts[0] === "issues" && parts[1] === "dts" && parts.length === 2) {
    const owner = url.searchParams.get("owner") ?? "";
    // 平台语义:owner 缺席且匿名 → 400(单边归属无从谈起)。
    if (!owner.trim()) {
      send(400, { error: "缺少 owner 参数(匿名拉单必须指定责任人)" });
      return;
    }
    send(200, { tickets: state.briefs, mock: false });
    return;
  }
  if (request.method === "GET" && parts[0] === "issues" && parts[1] === "dts" && parts.length === 3) {
    const ticket = decodeURIComponent(parts[2] ?? "");
    const brief = state.briefs.find((row) => row.ticket === ticket);
    if (!brief) {
      send(404, { error: `查无此单: ${ticket}` });
      return;
    }
    send(200, brief);
    return;
  }
  if (request.method === "GET" && parts[1] === "dts-bindings" && parts.length === 2) {
    send(200, { bindings: state.bindings });
    return;
  }
  if (request.method === "PUT" && parts[1] === "dts-bindings" && parts.length === 3) {
    const ticket = decodeURIComponent(parts[2] ?? "");
    let raw = "";
    request.on("data", (chunk: Buffer) => {
      raw += String(chunk);
    });
    request.on("end", () => {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        send(400, { error: "请求体不是合法 JSON" });
        return;
      }
      const account = String(body["account"] ?? "").trim();
      if (!account) {
        send(400, { error: "缺少操作人账号:匿名改选必须在请求体携带 account(工号)" });
        return;
      }
      const rawModuleId = body["module_id"];
      const moduleId =
        rawModuleId === undefined || rawModuleId === null || String(rawModuleId).trim() === ""
          ? null
          : String(rawModuleId).trim();
      if (moduleId !== null && !state.modules.some((module) => module.id === moduleId)) {
        send(409, { error: `业务模块不存在或已归档: ${moduleId}` });
        return;
      }
      if (moduleId === null) {
        delete state.bindings[ticket];
      } else {
        state.bindings[ticket] = {
          module_id: moduleId,
          updated_by: account,
          updated_at: new Date().toISOString(),
        };
      }
      state.puts.push({ ticket, moduleId, account });
      send(200, { ticket, ...(moduleId ? { module_id: moduleId } : { cleared: true }) });
    });
    return;
  }
  if (request.method === "GET" && parts[0] === "business-modules" && parts.length === 1) {
    send(200, { modules: state.modules });
    return;
  }
  if (request.method === "GET" && parts[0] === "auth" && parts[1] === "people" && parts.length === 2) {
    send(200, state.people);
    return;
  }
  send(404, { error: `未知路由: ${String(request.method)} ${url.pathname}` });
}

export function createMockCloudServer(options: MockCloudServerOptions = {}): Promise<MockCloudServer> {
  const state: MockCloudState = {
    scenario: options.scenario ?? "ok",
    briefs: cloudBriefs(),
    modules: cloudModules(options.repositoryUrlOverride),
    people: cloudPeople(),
    bindings: cloudBindings(),
    puts: [],
  };
  const server: Server = createServer((request, response) => {
    handleMockCloudRequest(state, request, response);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolve({
        url: () => `http://127.0.0.1:${String(address.port)}`,
        putLog: () => state.puts.map((put) => ({ ...put })),
        bindings: () => structuredClone(state.bindings),
        close: () =>
          new Promise((resolveClose, rejectClose) => {
            server.close((error) => (error ? rejectClose(error) : resolveClose()));
          }),
      });
    });
  });
}

/** 脚本模式:E2E/手工联调直接起一个 mock 云平台,端口/场景走环境开关。 */
const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const scenario: MockCloudScenario =
    process.env["MOCK_CLOUD_SCENARIO"] === "unauthorized" ? "unauthorized" : "ok";
  const repoDir = process.env["MOCK_CLOUD_REPO_DIR"];
  const port = Number(process.env["MOCK_CLOUD_PORT"] ?? "8790");
  const state: MockCloudState = {
    scenario,
    briefs: cloudBriefs(),
    modules: cloudModules(
      repoDir !== undefined && repoDir !== "" ? pathToFileURL(repoDir).href : undefined,
    ),
    people: cloudPeople(),
    bindings: cloudBindings(),
    puts: [],
  };
  const server: Server = createServer((request, response) => {
    handleMockCloudRequest(state, request, response);
  });
  server.listen(port, "127.0.0.1", () => {
    console.error(
      `[mock-cloud] http://127.0.0.1:${String(port)} (scenario=${scenario}, repoOverride=${repoDir ?? "-"})`,
    );
  });
  server.on("error", (error) => {
    console.error(`[mock-cloud] 监听失败: ${String(error)}`);
    process.exitCode = 1;
  });
}
