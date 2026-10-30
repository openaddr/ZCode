import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  IssueLedgerError,
  appendIssueEvent,
  createIssueLedger,
  listIssueLedgers,
  loadIssueLedger,
  readIssueEvents,
  recordStage,
  saveIssueLedger,
} from "../src/adapters/ledgerStore.js";
import { applyStage } from "../src/domain/ledger.js";

async function tempDataDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mae-dts-flow-ledger-"));
}

describe("issue ledger", () => {
  it("创建→读取往返;进行中重复发起拒绝;非法单号拒绝", async () => {
    const dataDir = await tempDataDir();
    const created = await createIssueLedger(dataDir, { ticket: "DTS-2026-1001" });
    expect(created.ticket).toBe("DTS-2026-1001");
    expect(created.stage).toBe("dts_info");
    expect(created.interventionTier).toBe("align_first");
    expect(created.stages["dts_info"]).toBe("pending");

    await expect(createIssueLedger(dataDir, { ticket: "DTS-2026-1001" })).rejects.toThrow(/进行中/);
    await expect(createIssueLedger(dataDir, { ticket: "../escape" })).rejects.toThrow(IssueLedgerError);
    await expect(loadIssueLedger(dataDir, "DTS-2026-9999")).rejects.toThrow(/不存在/);
  });

  it("收口后再发起=新一轮:旧台账留档不可见,rounds+1,事件含 issue_reinitiated", async () => {
    const dataDir = await tempDataDir();
    await createIssueLedger(dataDir, { ticket: "DTS-2026-1003" });
    await recordStage(dataDir, "DTS-2026-1003", "dts_info", "done");

    const closed = await loadIssueLedger(dataDir, "DTS-2026-1003");
    closed.closedAt = "2026-10-30T08:00:00.000Z";
    await saveIssueLedger(dataDir, closed);

    const again = await createIssueLedger(dataDir, { ticket: "DTS-2026-1003", moduleName: "报表中心" });
    expect(again.stage).toBe("dts_info");
    expect(again.rounds).toBe(1);
    expect(again.moduleName).toBe("报表中心");
    expect(again.createdAt).toBe(closed.createdAt);

    // 旧台账留档在目录内但 list 不拾取(归档轮不可再推进)。
    const dirFiles = await readdir(path.join(dataDir, "issues", "DTS-2026-1003"));
    expect(dirFiles.some((name) => name.startsWith("ledger.prev-1-"))).toBe(true);
    const list = await listIssueLedgers(dataDir);
    expect(list).toHaveLength(1);
    expect(list[0]?.rounds).toBe(1);

    // 留档文件内容 = 收口态旧台账(历史可追溯)。
    const prevName = dirFiles.find((name) => name.startsWith("ledger.prev-1-")) ?? "";
    const prev = JSON.parse(await readFile(path.join(dataDir, "issues", "DTS-2026-1003", prevName), "utf8")) as { closedAt: string | null };
    expect(prev.closedAt).toBe("2026-10-30T08:00:00.000Z");

    const events = await readIssueEvents(dataDir, "DTS-2026-1003");
    expect(events.some((event) => event.kind === "issue_reinitiated")).toBe(true);
  });

  it("归档后再发起同样放行;进行中(未收口未归档)拒绝", async () => {
    const dataDir = await tempDataDir();
    await createIssueLedger(dataDir, { ticket: "DTS-2026-1004" });
    const archived = await loadIssueLedger(dataDir, "DTS-2026-1004");
    archived.closedAt = "2026-10-30T08:00:00.000Z";
    archived.archived = true;
    await saveIssueLedger(dataDir, archived);
    const again = await createIssueLedger(dataDir, { ticket: "DTS-2026-1004" });
    expect(again.rounds).toBe(1);
    expect(again.archived).toBe(false);
  });

  it("recordStage 落台账并追加事件;读回事件顺序保真", async () => {
    const dataDir = await tempDataDir();
    await createIssueLedger(dataDir, { ticket: "DTS-2026-1002" });
    await recordStage(dataDir, "DTS-2026-1002", "dts_info", "done");
    await recordStage(dataDir, "DTS-2026-1002", "prep_repo", "in_progress");

    const ledger = await loadIssueLedger(dataDir, "DTS-2026-1002");
    expect(ledger.stage).toBe("prep_repo");
    expect(ledger.stages["dts_info"]).toBe("done");
    expect(ledger.stages["prep_repo"]).toBe("in_progress");

    const events = await readIssueEvents(dataDir, "DTS-2026-1002");
    expect(events.map((event) => event.kind)).toEqual(["issue_created", "stage", "stage"]);
    expect(events[2]?.payload).toEqual({ stage: "prep_repo", status: "in_progress" });
  });

  it("原子写:保存后目录里不残留临时文件", async () => {
    const dataDir = await tempDataDir();
    await createIssueLedger(dataDir, { ticket: "DTS-2026-1003" });
    await recordStage(dataDir, "DTS-2026-1003", "dts_info", "done");
    const dir = path.join(dataDir, "issues", "DTS-2026-1003");
    const files = await readdir(dir);
    expect(files).toEqual(["events.jsonl", "ledger.json"]);
    const raw = await readFile(path.join(dir, "ledger.json"), "utf8");
    expect(JSON.parse(raw)).toHaveProperty("ticket", "DTS-2026-1003");
  });

  it("applyStage 就地转移:无 IO,非法阶段拒绝", () => {
    const base = {
      ticket: "T",
      interventionTier: "align_first" as const,
      stage: "dts_info" as const,
      stages: {
        dts_info: "in_progress" as const,
        prep_repo: "pending" as const,
        analyze: "pending" as const,
        fix: "pending" as const,
        mr_green: "pending" as const,
      },
      rounds: 0,
      analysisConfirmedAt: null,
      closedAt: null,
      archived: false,
      createdAt: "2026-10-26T00:00:00Z",
      updatedAt: "2026-10-26T00:00:00Z",
    };
    expect(() => applyStage(base, "nope" as never, "done")).toThrow(IssueLedgerError);
    const moved = applyStage(base, "prep_repo", "done");
    expect(moved).toBe(base);
    expect(moved.stage).toBe("prep_repo");
    expect(moved.stages["prep_repo"]).toBe("done");
  });

  it("listIssueLedgers 按创建时间倒序;appendIssueEvent 支持附加事件", async () => {
    const dataDir = await tempDataDir();
    await createIssueLedger(dataDir, { ticket: "DTS-2026-0001" });
    await createIssueLedger(dataDir, { ticket: "DTS-2026-0002" });
    await appendIssueEvent(dataDir, "DTS-2026-0002", { ts: "2026-10-26T00:00:00Z", kind: "custom" });
    const ledgers = await listIssueLedgers(dataDir);
    expect(ledgers.map((ledger) => ledger.ticket)).toEqual(["DTS-2026-0002", "DTS-2026-0001"]);
    expect((await readIssueEvents(dataDir, "DTS-2026-0002")).at(-1)?.kind).toBe("custom");
  });
});
