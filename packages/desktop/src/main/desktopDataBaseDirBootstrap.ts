import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { setDataBaseDir } from "@zcode/services/node";
import { ZCODE_PRODUCT_FLAVOR } from "@zcode/shared";
// mae: 数据根决策委托自有身份模块(specs/mae/identity-isolation.md,issue #9)
import { resolveMaeDataRootBootstrap } from "../../scripts/mae-identity.mjs";

// mae: mae 身份的 bootstrap 默认 home 切到数据根 ~/.zcode-mae,setting.json 不落官方 ~/.zcode(#9)
function resolveBootstrapHomePath(): string {
  return resolveMaeDataRootBootstrap(ZCODE_PRODUCT_FLAVOR) ?? homedir();
}

export function resolveBootstrapSettingsFile(
  homePath: string = resolveBootstrapHomePath(),
): string {
  return join(homePath, ".zcode", "v2", "setting.json");
}

export function extractBootstrapDataBaseDir(rawValue: unknown): string | null {
  if (!rawValue || typeof rawValue !== "object") {
    return null;
  }

  const dataBaseDir = (rawValue as { dataBaseDir?: unknown }).dataBaseDir;
  if (typeof dataBaseDir !== "string") {
    return null;
  }

  const trimmed = dataBaseDir.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readBootstrapDataBaseDirFromDisk(
  settingsFile: string = resolveBootstrapSettingsFile(),
): string | null {
  if (!existsSync(settingsFile)) {
    return null;
  }

  try {
    const raw = readFileSync(settingsFile, "utf-8");
    return extractBootstrapDataBaseDir(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function applyEarlyDataBaseDirBootstrap(): string | null {
  // mae: 启动早期显式设定数据基目录 ~/.zcode-mae(优先级高于 env;显式 ZCODE_DATA_BASE_DIR
  // 覆盖轴保留给 e2e/调试)。同时注入 ZCODE_DESKTOP_HOME_DIR 把 settingService 的 setting.json
  // 切到 mae 根并透传 Host,与官方 ~/.zcode 零交集(#9)
  const maeDataBaseDir = resolveMaeDataRootBootstrap(ZCODE_PRODUCT_FLAVOR);
  if (maeDataBaseDir) {
    setDataBaseDir(maeDataBaseDir);
    if (!process.env.ZCODE_DESKTOP_HOME_DIR?.trim()) {
      process.env.ZCODE_DESKTOP_HOME_DIR = maeDataBaseDir;
    }
  }
  const dataBaseDir = readBootstrapDataBaseDirFromDisk();
  if (dataBaseDir) {
    // 启动早期就把 dataBaseDir 注入进来，避免 logger / crashReporter 先按默认 HOME 建目录，
    // 导致后续再切换到自定义目录时，日志和 crash dump 落在两套路径里。
    setDataBaseDir(dataBaseDir);
  }
  return dataBaseDir;
}
