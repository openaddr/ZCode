import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createDtsFlowService, startHttpFace, type DtsFlowService } from "../src/contract.js";

function buildService(dataDir: string): DtsFlowService {
  return createDtsFlowService(
    {
      dataDir,
      issuesRoot: path.join(dataDir, "issues-ws"),
      binDir: path.join(dataDir, "bin"),
      employeeId: "ning",
      cloudBaseUrl: null,
      dtsGatewayUrl: null,
      dtsTokenPath: path.join(dataDir, "mcp-token"),
      httpPort: 0,
      mock: true,
      pipelineBudgetMinutes: 60,
    },
    { fetch, selfLauncher: { command: "node", args: ["serve.ts", "--stdio"] } },
  );
}

describe("http face", () => {
  it("health/config/deps/issues 白名单路由可用;config 永不含凭据内容", async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), "mae-dts-flow-http-"));
    const service = buildService(dataDir);
    await service.createIssue({ ticket: "DTS-2026-1001" });
    const face = await startHttpFace(service, { port: 0 });
    try {
      const base = `http://127.0.0.1:${face.port}`;

      const health = (await (await fetch(`${base}/api/health`)).json()) as Record<string, unknown>;
      expect(health).toEqual({ ok: true, mock: true, employeeId: "ning" });

      const config = (await (await fetch(`${base}/api/config`)).json()) as Record<string, unknown>;
      expect(config["employeeId"]).toBe("ning");
      expect(config["mock"]).toBe(true);
      expect(JSON.stringify(config)).not.toContain("token-value");

      const deps = (await (await fetch(`${base}/api/deps`)).json()) as { dependencies: Array<{ name: string }> };
      expect(deps.dependencies.map((dep) => dep.name)).toEqual(["codehubcli"]);

      const issues = (await (await fetch(`${base}/api/issues`)).json()) as { issues: Array<{ ticket: string }> };
      expect(issues.issues.map((issue) => issue.ticket)).toEqual(["DTS-2026-1001"]);

      const dtsList = (await (await fetch(`${base}/api/dts/tickets`)).json()) as {
        mock: boolean;
        total: number;
        actionableCount: number;
        tickets: Array<{ ticket: string; actionable: boolean }>;
      };
      expect(dtsList.mock).toBe(true);
      expect(dtsList.total).toBe(10);
      expect(dtsList.actionableCount).toBe(5);
      expect(dtsList.tickets.every((ticket) => ticket.actionable)).toBe(true);

      const detail = (await (await fetch(`${base}/api/dts/tickets/DTS-2026-1008`)).json()) as {
        ticket: string;
        severity: string;
      };
      expect(detail.ticket).toBe("DTS-2026-1008");
      expect(detail.severity).toBe("致命");
    } finally {
      await face.close();
    }
  });

  it("单据事件路由与 404 白名单外拒绝", async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), "mae-dts-flow-http-"));
    const service = buildService(dataDir);
    await service.createIssue({ ticket: "DTS-2026-1002" });
    const face = await startHttpFace(service, { port: 0 });
    try {
      const base = `http://127.0.0.1:${face.port}`;
      const events = (await (await fetch(`${base}/api/issues/DTS-2026-1002/events`)).json()) as {
        events: Array<{ kind: string }>;
      };
      expect(events.events[0]?.kind).toBe("issue_created");

      const ledger = await fetch(`${base}/api/issues/DTS-2026-1002`);
      expect(ledger.status).toBe(200);
      const missingLedger = await fetch(`${base}/api/issues/DTS-2026-9999`);
      expect(missingLedger.status).toBe(500);
      const notFound = await fetch(`${base}/api/unknown`);
      expect(notFound.status).toBe(404);

      // 发起(POST):模块/档位进台账。
      const started = await fetch(`${base}/api/issues`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticket: "DTS-2026-1004", module: "报表中心", interventionTier: "report_first" }),
      });
      expect(started.status).toBe(201);
      const startedBody = (await started.json()) as { ledger: { moduleName: string | null; interventionTier: string }; workspace: { workspacePath: string } };
      expect(startedBody.ledger.moduleName).toBe("报表中心");
      expect(startedBody.ledger.interventionTier).toBe("report_first");
      expect(startedBody.workspace.workspacePath).toContain("DTS-2026-1004");
    } finally {
      await face.close();
    }
  });
});
