// 回归测试(#73 GitHub 靶场实录):pollTickets 不得把 red 当终态定格——
// 红灯返工(修复重推同一 MR,流水线转绿)必须能被后续轮询刷新并收口。
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createDtsFlowService } from "../src/contract.js";
import { type PlatformAdapter } from "../src/adapters/platformAdapter.js";
import { listIssueLedgers, saveIssueLedger } from "../src/adapters/ledgerStore.js";
import type { IssueLedger } from "../src/domain/ledger.js";
import type { PipelineState } from "../src/domain/mrGate.js";

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
  it("red 不定格:流水线转 green 后下一拍刷新并收口", async () => {
    const root = await mkdtempSafe();
    const dataDir = path.join(root, "data");
    await mkdir(dataDir, { recursive: true });

    // 注入假适配器:状态由闭包变量驱动(create_mr/poll 只走 platform 腿,本测试不触网关)。
    let verdict: PipelineState = "red";
    const scripted: PlatformAdapter = {
      async createMr() {
        return { repo: "https://mr.test/x.git", url: "https://mr.test/pull/1", branch: "master_ning_x" };
      },
      async pipelineStatus() {
        return verdict;
      },
    };

    const service = createDtsFlowService(
      {
        dataDir,
        issuesRoot: path.join(root, "issues-ws"),
        binDir: path.join(root, "bin"),
        employeeId: "ning",
        cloudBaseUrl: "http://mr.test",
        httpPort: 0,
        platform: "codehub",
        pipelineBudgetMinutes: 60,
      },
      { fetch, platform: scripted },
    );

    await mkdir(path.join(dataDir, "issues", "DTS-2026-9001"), { recursive: true });
    await saveIssueLedger(dataDir, buildLedger("DTS-2026-9001", "red"));

    // 第一拍:red 原样(red 是当时的事实)。
    await service.pollTickets();
    const [afterRed] = await listIssueLedgers(dataDir);
    expect(afterRed.mrAccounts[0]?.pipeline).toBe("red");

    // 红灯返工:重推后流水线转绿 → 下一拍必须刷新(回归:旧实现把 red 当终态跳过)。
    verdict = "green";
    await service.pollTickets();
    const [afterGreen] = await listIssueLedgers(dataDir);
    expect(afterGreen.mrAccounts[0]?.pipeline).toBe("green");
    expect(afterGreen.closedAt).not.toBeNull();
  });
});
