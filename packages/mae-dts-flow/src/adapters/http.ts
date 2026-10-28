import { createServer, type Server } from "node:http";

import type { DtsFlowService } from "../app/service.js";

export interface HttpFaceOptions {
  host?: string;
  port?: number;
}

export interface StartedHttpFace {
  server: Server;
  /** 实际监听端口(传 0 时由系统分配,测试用)。 */
  port: number;
  close(): Promise<void>;
}

/**
 * HTTP 面:zcode-mae UI 的唯一数据通道;凭据只在此进程内消费,响应永不携带 token 内容。
 * 路由全部显式白名单;未知路径 404;处理异常 fail-loud 成 JSON 错误。
 */
export function startHttpFace(service: DtsFlowService, options: HttpFaceOptions = {}): Promise<StartedHttpFace> {
  const server = createServer((request, response) => {
    void handle(service, request, response).catch((error: unknown) => {
      respondJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? service.config.httpPort, options.host ?? "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : options.port ?? service.config.httpPort;
      resolve({
        server,
        port,
        close: () =>
          new Promise<void>((resolveClose) => {
            server.closeAllConnections();
            server.close(() => resolveClose());
          }),
      });
    });
  });
}

async function handle(
  service: DtsFlowService,
  request: import("node:http").IncomingMessage,
  response: import("node:http").ServerResponse,
): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const route = `${request.method ?? "GET"} ${url.pathname}`;
  switch (route) {
    case "GET /api/health":
      respondJson(response, 200, { ok: true, mock: service.config.mock, employeeId: service.config.employeeId });
      return;
    case "GET /api/config":
      respondJson(response, 200, await service.configSummary());
      return;
    case "GET /api/deps":
      respondJson(response, 200, { dependencies: await service.probeDependencies() });
      return;
    case "GET /api/modules": {
      const resolved = await service.refreshModuleBindings();
      respondJson(response, 200, {
        source: resolved.bindings.source,
        degraded: resolved.degraded,
        degradedReason: resolved.degradedReason,
        modules: resolved.bindings.modules,
      });
      return;
    }
    case "GET /api/issues":
      respondJson(response, 200, { issues: await service.listIssues() });
      return;
    case "GET /api/dts/tickets": {
      const tickets = await service.listTickets();
      const actionable = tickets.filter((ticket) => ticket.actionable);
      respondJson(response, 200, {
        mock: service.config.mock,
        total: tickets.length,
        actionableCount: actionable.length,
        blockedCount: tickets.length - actionable.length,
        tickets: actionable,
      });
      return;
    }
    default:
      break;
  }
  const ticketMatch = /^\/api\/dts\/tickets\/([^/]+)$/.exec(url.pathname);
  if (request.method === "GET" && ticketMatch !== null) {
    respondJson(response, 200, await service.getTicket(decodeURIComponent(ticketMatch[1] as string)));
    return;
  }
  const issueMatch = /^\/api\/issues\/([^/]+)\/events$/.exec(url.pathname);
  if (request.method === "GET" && issueMatch !== null) {
    const ticket = decodeURIComponent(issueMatch[1] as string);
    const tailParam = url.searchParams.get("tail");
    const tail = tailParam === null ? undefined : Number.parseInt(tailParam, 10);
    const events = await service.issueEvents(ticket, Number.isInteger(tail) ? tail : undefined);
    respondJson(response, 200, { events });
    return;
  }
  respondJson(response, 404, { error: `未知路由: ${route}` });
}

function respondJson(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(payload);
}
