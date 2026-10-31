/**
 * mae: dts-flow 服务桌面自动拉起(票 E,#64)。
 * 服务以 ELECTRON_RUN_AS_NODE 用 Electron 自带 node 运行打包进 resources/mae/dts-flow
 * 的编译产物;无 --config,读缺省配置路径 ~/.zcode-mae/dts-flow/config.json(票 D)。
 * 开发模式与未随包场景(existsSync 不中)不拉起——沿用手动 serve/冒烟脚本。
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

let child: ChildProcess | null = null;

export function dtsFlowServiceEntry(): string {
  return path.join(process.resourcesPath, "mae", "dts-flow", "dist", "adapters", "serve.js");
}

export function startDtsFlowService(logger: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void }): void {
  if (child !== null) return;
  const entry = dtsFlowServiceEntry();
  if (!existsSync(entry)) {
    logger.info("[mae-dts-flow] 随包服务产物不在场,跳过自动拉起(开发模式用手动 serve/冒烟脚本)");
    return;
  }
  child = spawn(process.execPath, [entry], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: "ignore",
    windowsHide: true,
  });
  logger.info(`[mae-dts-flow] 服务已自动拉起 pid=${String(child.pid)} entry=${entry}`);
  child.on("exit", (code) => {
    logger.info(`[mae-dts-flow] 服务进程退出 code=${String(code)}`);
    child = null;
  });
}

export function stopDtsFlowService(): void {
  if (child === null) return;
  const process_ = child;
  child = null;
  process_.kill();
}

/** 配置保存后重启:先杀旧进程再拉起新的(秒级,新配置即刻生效)。 */
export function restartDtsFlowService(logger: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void }): void {
  stopDtsFlowService();
  startDtsFlowService(logger);
}
