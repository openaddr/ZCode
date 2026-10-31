// 服务级集成测试(openaddr/ZCode#69):本地服务以「云模式」对 mock 云平台起真 HTTP
// (CloudPlatformGateway 走真实 socket,只有 URL 不同),验证同源六端点全通 + 发起建单。
// mock 云服务按 mae-flow-cloud ADR-0069 真实响应形状镜像(逐字段对照平台源码)。
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDtsFlowService, startHttpFace } from "../src/contract.js";
import { createMockCloudServer, type MockCloudServer } from "./mocks/mockCloudServer.js";

let cloud: MockCloudServer;

beforeAll(async () => {
  cloud = await createMockCloudServer();
});

afterAll(async () => {
  await cloud?.close();
});

async function buildCloudModeService() {
  const dataDir = await mkdtemp(path.join(tmpdir(), "mae-dts-flow-cloudmode-"));
  const service = createDtsFlowService(
    {
      dataDir,
      issuesRoot: path.join(dataDir, "issues-ws"),
      binDir: path.join(dataDir, "bin"),
      employeeId: "ning",
      cloudBaseUrl: cloud.url(),
      httpPort: 0,
      mock: false,
      pipelineBudgetMinutes: 60,
    },
    { fetch, selfLauncher: { command: "node", args: ["serve.ts", "--stdio"] } },
  );
  return startHttpFace(service, { port: 0 });
}

function faceUrl(face: { port: number }): string {
  return `http://127.0.0.1:${String(face.port)}`;
}

describe("cloud mode over mock cloud platform", () => {
  it("看板四源全通:tickets(带 branch/module_id)/modules/bindings/people", async () => {
    const face = await buildCloudModeService();
    try {
      const base = faceUrl(face);
      const tickets = (await (await fetch(`${base}/api/dts/tickets?owner=ning`)).json()) as {
        mock: boolean;
        tickets: Array<{ ticket: string; branch: string | null; moduleId: string | null }>;
      };
      expect(tickets.mock).toBe(false);
      expect(tickets.tickets.length).toBeGreaterThan(0);
      expect(tickets.tickets.some((ticket) => ticket.moduleId !== null)).toBe(true);
      expect(tickets.tickets.some((ticket) => ticket.branch !== null)).toBe(true);

      const modules = (await (await fetch(`${base}/api/modules`)).json()) as {
        modules: Array<{ id: string }>;
      };
      expect(modules.modules.some((module) => module.id === "module-web")).toBe(true);

      const bindings = (await (await fetch(`${base}/api/dts/bindings`)).json()) as {
        bindings: Record<string, { moduleId: string }>;
      };
      expect(Object.keys(bindings.bindings).length).toBeGreaterThan(0);

      const people = (await (await fetch(`${base}/api/dts/people`)).json()) as {
        people: Array<{ username: string }>;
      };
      expect(people.people.some((person) => person.username === "ning")).toBe(true);
    } finally {
      await face.close();
    }
  });

  it("写路径:改选模块 PUT 到 mock 云落账(自报工号=employeeId)", async () => {
    const face = await buildCloudModeService();
    try {
      const put = await fetch(`${faceUrl(face)}/api/dts/bindings/DTS-2026-1004`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ module_id: "module-bigdata" }),
      });
      expect(put.ok).toBe(true);
      expect(cloud.putLog()).toEqual([
        { ticket: "DTS-2026-1004", moduleId: "module-bigdata", account: "ning" },
      ]);
      const bindings = (await (await fetch(`${faceUrl(face)}/api/dts/bindings`)).json()) as {
        bindings: Record<string, { moduleId: string }>;
      };
      expect(bindings.bindings["DTS-2026-1004"]?.moduleId).toBe("module-bigdata");
    } finally {
      await face.close();
    }
  });

  it("发起:POST /api/issues 建工作区+台账,openingBrief 引用同源单据", async () => {
    const face = await buildCloudModeService();
    try {
      const response = await fetch(`${faceUrl(face)}/api/issues`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticket: "DTS-2026-1002", module: "module-web" }),
      });
      expect(response.status).toBe(201);
      const started = (await response.json()) as {
        workspace: { workspacePath: string };
        openingBrief: string;
      };
      expect(started.workspace.workspacePath).toContain("DTS-2026-1002");
      expect(started.openingBrief).toContain("DTS-2026-1002");
    } finally {
      await face.close();
    }
  });

  it("401 场景:mock 云未放行时,看板拉取显形 not_authorized 指路文案", async () => {
    const denied = await createMockCloudServer({ scenario: "unauthorized" });
    try {
      const dataDir = await mkdtemp(path.join(tmpdir(), "mae-dts-flow-denied-"));
      const service = createDtsFlowService(
        {
          dataDir,
          issuesRoot: path.join(dataDir, "issues-ws"),
          binDir: path.join(dataDir, "bin"),
          employeeId: "ning",
          cloudBaseUrl: denied.url(),
          httpPort: 0,
          mock: false,
          pipelineBudgetMinutes: 60,
        },
        { fetch, selfLauncher: { command: "node", args: ["serve.ts", "--stdio"] } },
      );
      const face = await startHttpFace(service, { port: 0 });
      try {
        const tickets = await fetch(`${faceUrl(face)}/api/dts/tickets?owner=ning`);
        const body = (await tickets.json()) as { error?: string };
        expect(tickets.ok).toBe(false);
        expect(body.error ?? "").toContain("免登录允许清单未放行");
      } finally {
        await face.close();
      }
    } finally {
      await denied.close();
    }
  });
});
