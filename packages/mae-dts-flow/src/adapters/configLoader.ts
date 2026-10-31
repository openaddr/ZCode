import { promises as fs } from "node:fs";
import { homedir as osHomedir } from "node:os";
import path from "node:path";

import {
  type DtsFlowConfig,
  DtsFlowConfigError,
  assembleConfig,
} from "../domain/config.js";

export interface LoadConfigOptions {
  /** 显式配置文件路径;给定时必须存在(不给则探缺省路径,见 defaultConfigPath)。 */
  configPath?: string;
  /** 测试注入的用户根;缺省真实 homedir。mae 业务数据根约定为 <home>/.zcode-mae(D10)。 */
  homeDir?: string;
}

/**
 * 缺省配置文件路径(设置分区「DTS 问题流」的落盘位置,#63):
 * <home>/.zcode-mae/dts-flow/config.json。serve 无 --config 时读这里;文件不存在=全缺省启动。
 */
export function defaultConfigPath(home = osHomedir()): string {
  return path.join(home, ".zcode-mae", "dts-flow", "config.json");
}

/**
 * 配置文件读取 → 领域装配。解析失败的文件拒绝启动(fail-loud),不静默跳过。
 */
export async function loadConfig(options: LoadConfigOptions = {}): Promise<DtsFlowConfig> {
  const home = options.homeDir ?? osHomedir();
  let fileValues: Record<string, unknown> | null = null;
  if (options.configPath !== undefined) {
    let raw: string;
    try {
      raw = await fs.readFile(options.configPath, "utf8");
    } catch {
      throw new DtsFlowConfigError(`配置文件读取失败: ${options.configPath}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new DtsFlowConfigError(`配置文件不是合法 JSON: ${options.configPath}`);
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new DtsFlowConfigError(`配置文件必须是 JSON 对象: ${options.configPath}`);
    }
    fileValues = parsed as Record<string, unknown>;
  }
  return assembleConfig({ fileValues, maeRoot: path.join(home, ".zcode-mae") });
}
