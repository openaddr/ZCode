// 回归测试(#73 GitHub 靶场实录):pollTickets 不得把 red 当终态定格——
// 红灯返工(修复重推同一 MR,流水线转绿)必须能被后续轮询刷新并收口。
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createDtsFlowService, type DtsFlowService } from "../src/contract.js";
import { listIssueLedgers, saveIssueLedger } from "../src/adapters/ledgerStore.js";
import type { IssueLedger } from "../src/domain/ledger.js";

function buildLedger(ticket: string, pipeline: "red" | "running"): IssueLedger {
  const now = new Date().toISOString();
  return {
    ticket,
    moduleName: "module-fixture",
    interventionTier: "align_first",
    stage: "mr_green",
    stages: { dts_info: "done", prep_repo: "done", analyze: "done", fix: "done", mr_green: "in_progress" },
    rounds: 0,
    analysisGate: null,
    mrDeclarations: [{ repo: "https://mr.test/x.git", url: "https://mr.test/pull/1", declaredAt: now }],
    mrAccounts: [{ repo: "https://mr.test/x.git", url: "https://mr.test/pull/1", branch: "master_ning_x", pipeline, updatedAt: now }],
    mrWatch: { startedAt: now, deadlineAt: new Date(Date.now() + 3600_000).toISOString() },
    closedAt: null,
    archived: false,
    createdAt: now,
    updatedAt: now,
    events: [],
  };
}

async function mkdtempSafe(): Promise<string> {
  const { mkdtemp } = await import("node:fs/promises");
  return mkdtemp(path.join(tmpdir(), "mae-dts-flow-poll-"));
}

describe("pollTickets 红灯可刷新(#73 回归)", () => {
  it("red 不定格:statefile 转 green 后下一拍刷新并收口", async () => {
    const root = await mkdtempSafe();
    const dataDir = path.join(root, "data");
    await mkdir(dataDir, { recursive: true });
    const stateFile = path.join(root, "pipeline-state.txt");
    await writeFile(stateFile, "red", "utf8");

    // 适配器命令模板:mrStatus 读状态文件输出三态 JSON;createMr 输出固定 URL。
    await writeFile(
      path.join(dataDir, "platform-adapter.json"),
      JSON.stringify({
        createMr: ["node", "-e", "console.log('https://mr.test/pull/1')"],
        mrStatus: ["node", "-e", "console.log(JSON.stringify({pipeline:require('fs').readFileSync(process.argv[1],'utf8').trim()}))", stateFile, "{url}"],
      }),
      "utf8",
    );

    const service = createDtsFlowService(
      {
        dataDir,
        issuesRoot: path.join(root, "issues-ws"),
        binDir: path.join(root, "bin"),
        employeeId: "ning",
        cloudBaseUrl: "http://mr.test", // 本测试不触网关:create_mr/poll 只走 platformAdapter
        httpPort: 0,
        mock: false,
        pipelineBudgetMinutes: 60,
      },
      { fetch, selfLauncher: { command: "node", args: ["serve.ts", "--stdio"] } },
    );

    await mkdir(path.join(dataDir, "issues", "DTS-2026-9001"), { recursive: true });
    await saveIssueLedger(dataDir, buildLedger("DTS-2026-9001", "red"));

    // 第一拍:red 原样(red 是当时的事实)。
    await service.pollTickets();
    const [afterRed] = await listIssueLedgers(dataDir);
    expect(afterRed.mrAccounts[0]?.pipeline).toBe("red");

    // 红灯返工:重推后流水线转绿 → 下一拍必须刷新(回归:旧实现把 red 当终态跳过)。
    await writeFile(stateFile, "green", "utf8");
    await service.pollTickets();
    const [afterGreen] = await listIssueLedgers(dataDir);
    expect(afterGreen.mrAccounts[0]?.pipeline).toBe("green");
    expect(afterGreen.closedAt).not.toBeNull();
  });
});
