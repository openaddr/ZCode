import { promises as fs } from "node:fs";
import { join as joinPath } from "node:path";

import { type DependencyProbe, type ProbeOptions, probeDependency, requireDependency } from "../domain/depsProbe.js";

/** fs 实现的存在性检查(domain/depsProbe 的端口实现)。 */
export async function fsExists(candidate: string): Promise<boolean> {
  try {
    const stat = await fs.stat(candidate);
    return stat.isFile();
  } catch {
    return false;
  }
}

/** 生产探测选项:fs 存在性 + node:path 拼接。 */
export function fsProbeOptions(binDir: string, pathEnv?: string, platform?: NodeJS.Platform): ProbeOptions {
  return { binDir, pathEnv, platform, exists: fsExists, join: joinPath };
}

export { probeDependency, requireDependency, type DependencyProbe, type ProbeOptions };
