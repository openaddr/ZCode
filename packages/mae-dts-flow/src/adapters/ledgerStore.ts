import { promises as fs } from "node:fs";
import path from "node:path";

import {
  type IssueEvent,
  type IssueLedger,
  type IssueStage,
  type InterventionTier,
  IssueLedgerError,
  DEFAULT_INTERVENTION_TIER,
  applyStage,
  emptyStages,
} from "../domain/ledger.js";

export { IssueLedgerError };

export function issueDir(dataDir: string, ticket: string): string {
  if (!ticket.trim() || ticket.includes("/") || ticket.includes("\\") || ticket.includes("..")) {
    throw new IssueLedgerError(`非法单号: ${ticket}`);
  }
  return path.join(dataDir, "issues", ticket);
}

export async function createIssueLedger(
  dataDir: string,
  input: { ticket: string; moduleName?: string | null; interventionTier?: InterventionTier; now?: () => Date },
): Promise<IssueLedger> {
  const now = (input.now ?? (() => new Date()))().toISOString();
  const dir = issueDir(dataDir, input.ticket);
  const file = path.join(dir, "ledger.json");
  const existing = await loadIssueLedger(dataDir, input.ticket).catch(() => null);
  if (existing !== null && existing.closedAt === null && !existing.archived) {
    throw new IssueLedgerError(`单据 ${input.ticket} 有进行中的问题会话,不可重复发起(对齐云端同单查重口径)`);
  }
  // 收口/归档后的再发起:旧一轮台账就地留档(ledger.prev-N-<ts>.json,list 不拾取),新一轮从零开。
  let rounds = 0;
  if (existing !== null) {
    const previousRounds = (await fs.readdir(dir).catch(() => [] as string[])).filter((name) => name.startsWith("ledger.prev-"));
    await fs.rename(file, path.join(dir, `ledger.prev-${previousRounds.length + 1}-${now.replaceAll(":", "")}.json`));
    rounds = existing.rounds + 1;
  }
  await fs.mkdir(dir, { recursive: true });
  const ledger: IssueLedger = {
    ticket: input.ticket,
    moduleName: input.moduleName ?? null,
    interventionTier: input.interventionTier ?? DEFAULT_INTERVENTION_TIER,
    stage: "dts_info",
    stages: emptyStages(),
    rounds,
    analysisGate: null,
    mrDeclarations: [],
    mrAccounts: [],
    mrWatch: null,
    closedAt: null,
    archived: false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await writeLedgerAtomic(file, ledger);
  await appendIssueEvent(dataDir, input.ticket, existing === null
    ? { ts: now, kind: "issue_created", payload: { interventionTier: ledger.interventionTier } }
    : {
        ts: now,
        kind: "issue_reinitiated",
        payload: { interventionTier: ledger.interventionTier, previousClosedAt: existing.closedAt, round: rounds },
      });
  return ledger;
}

export async function loadIssueLedger(dataDir: string, ticket: string): Promise<IssueLedger> {
  const file = path.join(issueDir(dataDir, ticket), "ledger.json");
  const raw = await fs.readFile(file, "utf8").catch(() => {
    throw new IssueLedgerError(`单据 ${ticket} 的台账不存在`);
  });
  return JSON.parse(raw) as IssueLedger;
}

export async function saveIssueLedger(dataDir: string, ledger: IssueLedger, now: Date = new Date()): Promise<void> {
  ledger.updatedAt = now.toISOString();
  const file = path.join(issueDir(dataDir, ledger.ticket), "ledger.json");
  await writeLedgerAtomic(file, ledger);
}

export async function listIssueLedgers(dataDir: string): Promise<IssueLedger[]> {
  const root = path.join(dataDir, "issues");
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const ledgers: IssueLedger[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = path.join(root, entry.name, "ledger.json");
    const raw = await fs.readFile(file, "utf8").catch(() => null);
    if (raw === null) continue;
    ledgers.push(JSON.parse(raw) as IssueLedger);
  }
  return ledgers.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** 阶段状态转移:领域纯转移 + 原子落盘 + 事件追加。 */
export async function recordStage(
  dataDir: string,
  ticket: string,
  stage: IssueStage,
  status: import("../domain/ledger.js").StageStatus,
  now: Date = new Date(),
): Promise<IssueLedger> {
  const ledger = applyStage(await loadIssueLedger(dataDir, ticket), stage, status, now);
  await saveIssueLedger(dataDir, ledger, now);
  await appendIssueEvent(dataDir, ticket, { ts: now.toISOString(), kind: "stage", payload: { stage, status } });
  return ledger;
}

export async function appendIssueEvent(dataDir: string, ticket: string, event: IssueEvent): Promise<void> {
  const file = path.join(issueDir(dataDir, ticket), "events.jsonl");
  await fs.appendFile(file, `${JSON.stringify(event)}\n`, "utf8");
}

export async function readIssueEvents(dataDir: string, ticket: string, tail = 200): Promise<IssueEvent[]> {
  const file = path.join(issueDir(dataDir, ticket), "events.jsonl");
  const raw = await fs.readFile(file, "utf8").catch(() => "");
  const lines = raw.split("\n").filter((line) => line.trim().length > 0);
  return lines.slice(-tail).map((line) => JSON.parse(line) as IssueEvent);
}

/** 原子写:临时文件 + rename,避免半截 JSON(崩溃恢复读台账时宁可不存在也不读半截)。 */
async function writeLedgerAtomic(file: string, ledger: IssueLedger): Promise<void> {
  const tmp = `${file}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  await fs.writeFile(tmp, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  await fs.rename(tmp, file);
}
