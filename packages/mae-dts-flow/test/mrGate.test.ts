import { mkdtemp, writeFile, chmod, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  isBudgetExhausted,
  judgeGate,
  verifyDeclarations,
  type MrAccount,
} from "../src/domain/mrGate.js";
import { createPlatformAdapter } from "../src/adapters/platformAdapter.js";
import { createDtsFlowService } from "../src/contract.js";

function account(repo: string, pipeline: MrAccount["pipeline"]): MrAccount {
  return { repo, url: `https://mr/${repo}`, branch: "master_ning_T", pipeline, updatedAt: "2026-10-28T00:00:00Z" };
}

const NOW = new Date("2026-10-28T12:00:00Z");

describe("verifyDeclarations(申报对拍)", () => {
  it("申报=台账 平;少报/多报点名", () => {
    const declared = [{ repo: "a", url: "u", declaredAt: "t" }];
    expect(verifyDeclarations(declared, [account("a", "green")]).ok).toBe(true);
    const missing = verifyDeclarations([{ repo: "a", url: "u", declaredAt: "t" }, { repo: "b", url: "u2", declaredAt: "t" }], [account("a", "green")]);
    expect(missing.ok).toBe(false);
    expect(missing.missing.map((item) => item.repo)).toEqual(["b"]);
    const extra = verifyDeclarations([], [account("a", "green")]);
    expect(extra.ok).toBe(false);
    expect(extra.extra).toHaveLength(1);
  });
});

describe("judgeGate(三态裁决)", () => {
  const watch = { startedAt: "2026-10-28T11:00:00Z", deadlineAt: "2026-10-28T13:00:00Z" };
  it("全绿+对拍平 → green(收口当且仅当已申报且全绿)", () => {
    const verdict = judgeGate([account("a", "green")], [{ repo: "a", url: "u", declaredAt: "t" }], watch, NOW);
    expect(verdict.state).toBe("green");
  });
  it("有红 → red 带失败仓;对拍有差 → red 点名", () => {
    expect(judgeGate([account("a", "red")], [{ repo: "a", url: "u", declaredAt: "t" }], watch, NOW).state).toBe("red");
    const bad = judgeGate([account("a", "green"), account("b", "green")], [{ repo: "a", url: "u", declaredAt: "t" }], watch, NOW);
    expect(bad.state).toBe("red");
    expect(bad.declaration.extra.map((extra) => extra.repo)).toEqual(["b"]);
  });
  it("全 unknown/running → running;预算耗尽 → exhausted", () => {
    expect(judgeGate([account("a", "running")], [{ repo: "a", url: "u", declaredAt: "t" }], watch, NOW).state).toBe("running");
    const exhausted = judgeGate([account("a", "running")], [{ repo: "a", url: "u", declaredAt: "t" }], watch, new Date("2026-10-28T13:00:01Z"));
    expect(exhausted.state).toBe("exhausted");
    expect(isBudgetExhausted(watch, new Date("2026-10-28T13:00:01Z"))).toBe(true);
  });
});

describe("platform adapter", () => {
  it("mock 平台:MR 即建即 running,第二次查询转绿", async () => {
    const adapter = await createPlatformAdapter({ dataDir: path.join(await mkdtemp(path.join(tmpdir(), "pa-")), "d"), mock: true, binDir: "x" });
    const created = await adapter.createMr({ repo: "r", branch: "b", title: "t", description: "", ticket: "T" });
    expect(created.url).toContain("mr.mock");
    expect(await adapter.pipelineStatus(created.url)).toBe("running");
    expect(await adapter.pipelineStatus(created.url)).toBe("green");
  });

  it("cli 平台:stub codehubcli 走通 create/status", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pa-cli-"));
    const binDir = path.join(root, "bin");
    await mkdir(binDir, { recursive: true });
    if (process.platform === "win32") {
      await writeFile(path.join(binDir, "codehubcli.cmd"), '@echo off\nnode "%~dp0codehubcli.js" %*\n', "utf8");
    } else {
      const sh = path.join(binDir, "codehubcli");
      await writeFile(sh, "#!/bin/sh\nnode \"$(dirname \"$0\")/codehubcli.js\" \"$@\"\n", "utf8");
      await chmod(sh, 0o755);
    }
    await writeFile(
      path.join(binDir, "codehubcli.js"),
      [
        "const args = process.argv.slice(2);",
        "if (args[0] === 'mr' && args[1] === 'create') {",
        "  console.log(JSON.stringify({ url: 'https://mr/1' }));",
        "} else if (args[0] === 'mr' && args[1] === 'status') {",
        "  console.log(JSON.stringify({ pipeline: 'green' }));",
        "} else {",
        "  console.log('not-json');",
        "}",
      ].join("\n"),
      "utf8",
    );
    const adapter = await createPlatformAdapter({ dataDir: root, mock: false, binDir, pathEnv: "" });
    const created = await adapter.createMr({ repo: "https://r", branch: "master_ning_T", title: "t", description: "", ticket: "T" });
    expect(created.url).toBe("https://mr/1");
    expect(await adapter.pipelineStatus(created.url)).toBe("green");
  });
});

describe("mock 全流程 e2e(发起→申报→假流水线绿→收口归档)", () => {
  it("initIssue→阶段推进→create_mr(mock)→申报→poll 两轮→green 收口→archive", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "mcp-e2e-"));
    const service = createDtsFlowService(
      {
        dataDir: path.join(root, "data"),
        issuesRoot: path.join(root, "issues-ws"),
        binDir: path.join(root, "bin"),
        employeeId: "ning",
        cloudBaseUrl: null,
        httpPort: 0,
        mock: true,
        pipelineBudgetMinutes: 60,
      },
      { fetch, selfLauncher: { command: "node", args: ["serve.ts", "--stdio"] } },
    );

    await service.initIssue({ ticket: "DTS-2026-1008" });
    await service.completeStage({ ticket: "DTS-2026-1008", stage: "dts_info" });
    await service.completeStage({ ticket: "DTS-2026-1008", stage: "prep_repo" });
    await service.completeStage({ ticket: "DTS-2026-1008", stage: "fix", mrs: [{ repo: "https://codehub/bigdata", url: "https://mr.mock/1" }] as never });
    // fix 之后进 mr_green;直接 create_mr(mock 平台)。
    const created = await service.createMr({ ticket: "DTS-2026-1008", repo: "https://codehub/bigdata" });
    expect(created.branch).toBe("master_ning_DTS-2026-1008");

    // 申报与台账一致。
    await service.completeStage({
      ticket: "DTS-2026-1008",
      stage: "mr_green",
      mrs: [{ repo: "https://codehub/bigdata", url: created.url === undefined ? "https://mr.mock/1" : "https://mr.mock/1" }],
    });

    const first = await service.pollTickets();
    expect(first.find((item) => item.ticket === "DTS-2026-1008")?.verdict).toBe("running");
    const second = await service.pollTickets();
    expect(second.find((item) => item.ticket === "DTS-2026-1008")?.verdict).toBe("green");

    const ledger = await service.loadIssue("DTS-2026-1008");
    expect(ledger.closedAt).not.toBeNull();

    const archived = await service.archiveIssue("DTS-2026-1008");
    expect(archived.archived).toBe(true);
    await expect(service.archiveIssue("DTS-2026-1008")).resolves.toHaveProperty("archived", true);
  });
});
