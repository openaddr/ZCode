/** 依赖组件探测:纯决策逻辑;存在性检查由调用方注入(实现见 adapters/fsProbe)。 */

/** 依赖组件探测结果(codehubcli / fetch-logs / build-deploy 等)。 */
export interface DependencyProbe {
  name: string;
  available: boolean;
  /** 命中的可执行文件绝对路径;不可用时 null。 */
  resolvedPath: string | null;
}

export class DtsFlowDependencyError extends Error {
  constructor(
    message: string,
    readonly dependencyName: string,
  ) {
    super(message);
    this.name = "DtsFlowDependencyError";
  }
}

export interface ProbeOptions {
  binDir: string;
  /** PATH 环境变量值;探测候选目录序列。 */
  pathEnv?: string;
  platform?: NodeJS.Platform;
  /** 存在性检查端口;生产实现查文件系统,测试注入假集合。 */
  exists: (candidate: string) => Promise<boolean>;
  /** 路径拼接端口;生产实现为 node:path.join,测试注入保序拼接。 */
  join: (dir: string, name: string) => string;
}

export function executableCandidates(name: string, platform: NodeJS.Platform): string[] {
  if (platform !== "win32") return [name];
  return [".exe", ".cmd", ".bat", ""].map((suffix) => `${name}${suffix}`);
}

/**
 * 探测一个依赖组件:先找 binDir,再沿 PATH 找;命中即返回。
 * 缺席不抛——启动期用 probe 汇总展示,调用期用 requireDependency fail-loud。
 */
export async function probeDependency(name: string, options: ProbeOptions): Promise<DependencyProbe> {
  const platform = options.platform ?? process.platform;
  const candidates = executableCandidates(name, platform);
  const pathEnv = options.pathEnv ?? "";
  const searchDirs = [options.binDir, ...pathEnv.split(platform === "win32" ? ";" : ":")];

  for (const base of searchDirs) {
    if (!base) continue;
    for (const fileName of candidates) {
      const candidate = options.join(base, fileName);
      if (await options.exists(candidate)) return { name, available: true, resolvedPath: candidate };
    }
  }
  return { name, available: false, resolvedPath: null };
}

/**
 * 调用期守卫:组件缺席即抛,报错指名依赖与安装目录(部署动作=把二进制拷进 binDir)。
 */
export async function requireDependency(name: string, options: ProbeOptions): Promise<string> {
  const probe = await probeDependency(name, options);
  if (!probe.available) {
    throw new DtsFlowDependencyError(
      `缺少依赖组件「${name}」:PATH 与 ${options.binDir} 均未找到。` +
        `请把 ${name} 的可执行文件放入 ${options.binDir}(部署随装),或核对 PATH。`,
      name,
    );
  }
  return probe.resolvedPath as string;
}
