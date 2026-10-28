/**
 * mae-dts-flow 标准调用示例:发起一张 mock 单并走完「拉单→拉仓→分析」的台账轨迹。
 * 会话工具(UI 之外的消费方)只模仿这一份。
 */
import {
  createDtsFlowService,
  loadConfig,
  recordStage,
  type DtsFlowService,
  type IssueLedger,
} from "./contract.js";

export async function exampleDtsFlowService(configPath: string | undefined): Promise<void> {
  const config = await loadConfig({ configPath });
  const service: DtsFlowService = createDtsFlowService(config, { fetch, selfLauncher: { command: "node", args: ["serve.ts", "--stdio"] } });

  const ledger: IssueLedger = await service.createIssue({ ticket: "DTS-2026-1001" });
  await recordStage(config.dataDir, ledger.ticket, "dts_info", "done");
  await recordStage(config.dataDir, ledger.ticket, "prep_repo", "in_progress");
  const events = await service.issueEvents(ledger.ticket);
  console.assert(events.length >= 3, "台账事件流应含创建与两次阶段转移");
}
