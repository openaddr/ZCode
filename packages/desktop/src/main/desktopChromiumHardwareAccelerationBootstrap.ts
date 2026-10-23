import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
// mae: 默认 setting.json 解析复用启动 bootstrap 的 mae 感知解析(#31)
import { resolveBootstrapSettingsFile } from "./desktopDataBaseDirBootstrap.js";

interface ChromiumHardwareAccelerationApp {
  disableHardwareAcceleration(): void;
}

export function resolveChromiumHardwareAccelerationSettingsFile(
  homePath?: string,
): string {
  if (homePath) {
    // mae: 显式 homePath(测试注入)优先,按该 home 解析(#31)
    return join(homePath, ".zcode", "v2", "setting.json");
  }
  // mae: 默认(未显式传 homePath)与启动 setting.json 同根(desktopDataBaseDirBootstrap 的
  // mae 感知解析)——mae 身份读 ~/.zcode-mae/.zcode/v2,官方身份等价 homedir() 上游语义,
  // 早期 HW accel 布尔不读官方副本(#31)
  return resolveBootstrapSettingsFile();
}

export function extractBootstrapChromiumHardwareAccelerationEnabled(rawValue: unknown): boolean {
  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
    return true;
  }

  const enabled = (
    rawValue as {
      desktopChromiumHardwareAccelerationEnabled?: unknown;
    }
  ).desktopChromiumHardwareAccelerationEnabled;
  return typeof enabled === "boolean" ? enabled : true;
}

function readBootstrapChromiumHardwareAccelerationEnabledFromDisk(
  settingsFile: string = resolveChromiumHardwareAccelerationSettingsFile(),
): boolean {
  if (!existsSync(settingsFile)) {
    return true;
  }

  try {
    const raw = readFileSync(settingsFile, "utf-8");
    return extractBootstrapChromiumHardwareAccelerationEnabled(JSON.parse(raw));
  } catch {
    return true;
  }
}

export function applyEarlyChromiumHardwareAccelerationBootstrap(
  app: ChromiumHardwareAccelerationApp,
  rawSettings?: unknown,
): boolean {
  const enabled =
    rawSettings === undefined
      ? readBootstrapChromiumHardwareAccelerationEnabledFromDisk()
      : extractBootstrapChromiumHardwareAccelerationEnabled(rawSettings);
  if (!enabled) {
    // Electron 只能在 app ready 前关闭 Chromium 硬件加速。
    // 因此设置页保存后必须在下一次 main 进程最早期读取并应用，不能等到 whenReady。
    app.disableHardwareAcceleration();
  }
  return enabled;
}
