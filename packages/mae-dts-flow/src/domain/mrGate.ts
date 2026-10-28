/** MR 验绿门(#42 决议 1:两道核验之一):申报对拍+流水线三态+轮询预算,纯逻辑。 */

export type PipelineState = "unknown" | "running" | "green" | "red";

/** 一次 create_mr 的记账(台账持久;对拍与验绿的证据源)。 */
export interface MrAccount {
  repo: string;
  url: string;
  branch: string;
  pipeline: PipelineState;
  updatedAt: string;
}

export interface MrDeclaration {
  repo: string;
  url: string;
  declaredAt: string;
}

export interface DeclarationCheck {
  ok: boolean;
  /** 申报了但台账里没有(少报——AI 申报了未创建/被吞的 MR)。 */
  missing: MrDeclaration[];
  /** 台账有但申报里没有(多报/旁路创建)。 */
  extra: MrAccount[];
}

/** 申报清单=台账对拍:按 repo 归一比对;有差即不收口(#42 决议 4)。 */
export function verifyDeclarations(declared: MrDeclaration[], accounts: MrAccount[]): DeclarationCheck {
  const accountRepos = new Set(accounts.map((account) => account.repo));
  const declaredRepos = new Set(declared.map((item) => item.repo));
  return {
    ok:
      declared.length === accounts.length &&
      declared.every((item) => accountRepos.has(item.repo)),
    missing: declared.filter((item) => !accountRepos.has(item.repo)),
    extra: accounts.filter((account) => !declaredRepos.has(account.repo)),
  };
}

export interface WatchBudget {
  startedAt: string;
  deadlineAt: string;
}

export function isBudgetExhausted(watch: WatchBudget, now: Date): boolean {
  return now.getTime() >= new Date(watch.deadlineAt).getTime();
}

export interface GateVerdict {
  state: "green" | "red" | "running" | "exhausted";
  /** 红灯的仓与状态(失败事实,回发会话开回合)。 */
  failures: Array<{ repo: string; pipeline: PipelineState }>;
  /** 少报/多报点名(收口对拍口径,#42 决议 4)。 */
  declaration: DeclarationCheck;
}

/**
 * 验绿门三态裁决:收口当且仅当「已申报且全绿」;
 * 不变式——accounts 有红=red;对拍有差=red(点名);全绿且对拍平=green;其余=running;预算尽=exhausted。
 */
export function judgeGate(accounts: MrAccount[], declared: MrDeclaration[], watch: WatchBudget | null, now: Date): GateVerdict {
  const declaration = verifyDeclarations(declared, accounts);
  const failures = accounts
    .filter((account) => account.pipeline === "red")
    .map((account) => ({ repo: account.repo, pipeline: account.pipeline }));
  const allGreen = accounts.length > 0 && accounts.every((account) => account.pipeline === "green");
  if (allGreen && declaration.ok) {
    return { state: "green", failures: [], declaration };
  }
  if (watch !== null && isBudgetExhausted(watch, now)) {
    return { state: "exhausted", failures, declaration };
  }
  if (failures.length > 0 || !declaration.ok) {
    return { state: "red", failures, declaration };
  }
  return { state: "running", failures: [], declaration };
}
