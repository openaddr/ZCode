/**
 * mae: dts-flow 缺省配置文件读写(设置分区「DTS 问题流」的数据通道)。
 * 文件固定在 <home>/.zcode-mae/dts-flow/config.json;serve 无 --config 时读同一路径。
 * 写为读-合并-原子写:表单只覆盖托管键,用户手写的其它键(如 dataDir)保留。
 */
import { promises as fs } from "node:fs";
import { homedir as osHomedir } from "node:os";
import path from "node:path";

import { ipcMain } from "electron";

import { PlatformChannels } from "@zcode/shared";

export function dtsDefaultConfigPath(home?: string): string {
  return path.join(home ?? osHomedir(), ".zcode-mae", "dts-flow", "config.json");
}

async function readConfigFile(): Promise<Record<string, unknown> | null> {
  const raw = await fs.readFile(dtsDefaultConfigPath(), "utf8").catch(() => null);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function writeConfigPatch(patch: Record<string, unknown>): Promise<void> {
  const file = dtsDefaultConfigPath();
  const current = (await readConfigFile()) ?? {};
  const merged = { ...current, ...patch };
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  await fs.writeFile(tmp, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  await fs.rename(tmp, file);
}

/** 注册设置分区「DTS 问题流」的配置读写通道(幂等;由 platform IPC 装配点调用)。 */
export function registerDtsConfigIpcHandlers(): void {
  ipcMain.handle(PlatformChannels.DtsConfigRead, async () => readConfigFile());
  ipcMain.handle(PlatformChannels.DtsConfigWrite, async (_event, patch: unknown) => {
    if (patch === null || typeof patch !== "object" || Array.isArray(patch)) {
      throw new Error("配置写入载荷必须是对象");
    }
    await writeConfigPatch(patch as Record<string, unknown>);
  });
}
