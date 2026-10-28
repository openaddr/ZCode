import { promises as fs } from "node:fs";
import path from "node:path";

import {
  type ModuleBindings,
  ModuleBindingsError,
  validateModules,
} from "../domain/moduleBindings.js";

/** 云端端点路径。provisional:云端侧真实端点在施工票 2 从 mae-flow-cloud 路由对拍后收口。 */
export const MODULE_BINDINGS_PATH = "/mae/dts-flow/module-bindings";

export interface BindingsClock {
  now?: () => Date;
}

export function localBindingsPath(dataDir: string): string {
  return path.join(dataDir, "module-bindings.local.json");
}

/** 本地兜底层:读 module-bindings.local.json;文件不存在返回 null(不算错误)。 */
export async function loadLocalModuleBindings(
  dataDir: string,
  clock: BindingsClock = {},
): Promise<ModuleBindings | null> {
  const file = localBindingsPath(dataDir);
  const raw = await fs.readFile(file, "utf8").catch(() => null);
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ModuleBindingsError(`本地模块绑定文件不是合法 JSON: ${file}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ModuleBindingsError(`本地模块绑定文件必须是 JSON 对象: ${file}`);
  }
  return {
    source: "local",
    fetchedAt: (clock.now ?? (() => new Date()))().toISOString(),
    modules: validateModules((parsed as Record<string, unknown>)["modules"], "本地"),
  };
}

/** 云端层:网络拉取;失败(网络/非 2xx/格式非法)抛错,降级决策在 domain/resolveModuleBindings。 */
export async function fetchCloudModuleBindings(
  cloudBaseUrl: string,
  deps: BindingsClock & { fetch: typeof fetch },
): Promise<ModuleBindings> {
  let response: Response;
  try {
    response = await deps.fetch(`${cloudBaseUrl}${MODULE_BINDINGS_PATH}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new ModuleBindingsError(`云端模块绑定拉取失败(${String(error)})`);
  }
  if (!response.ok) {
    throw new ModuleBindingsError(`云端模块绑定拉取失败:HTTP ${String(response.status)}`);
  }
  let parsed: unknown;
  try {
    parsed = (await response.json()) as unknown;
  } catch {
    throw new ModuleBindingsError("云端模块绑定响应不是合法 JSON");
  }
  const modules = (parsed as Record<string, unknown>)["modules"];
  return {
    source: "cloud",
    fetchedAt: (deps.now ?? (() => new Date()))().toISOString(),
    modules: validateModules(modules, "云端"),
  };
}
