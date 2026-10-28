/** 模块绑定两层解析:纯决策逻辑;本地文件读取与云端拉取由调用方注入端口。 */

export interface ModuleRepoBinding {
  /** 业务模块名(登记/DTS 页签的模块口径)。 */
  moduleName: string;
  /** 绑定的代码仓(HTTPS 地址)。 */
  repos: string[];
  /** 版本组 → 基线分支(如 "V100R025C10SPC010" -> "master");缺失时相关单据不可发起。 */
  versionBranchMap: Record<string, string>;
}

export interface ModuleBindings {
  source: "cloud" | "local";
  fetchedAt: string;
  modules: ModuleRepoBinding[];
}

export class ModuleBindingsError extends Error {}

export interface ResolvedModuleBindings {
  bindings: ModuleBindings;
  /** true=云端不可达,用了本地兜底(呼出 UI 的降级提示)。 */
  degraded: boolean;
  /** 降级原因(云端错误原文);非降级为 null。 */
  degradedReason: string | null;
}

export interface ResolveBindingsPorts {
  /** 云端层端口;null=未配置云端地址。失败(网络/非 2xx/格式)应抛错。 */
  cloud: (() => Promise<ModuleBindings>) | null;
  /** 本地兜底层端口;文件缺失应返回 null 而非抛错。 */
  local: () => Promise<ModuleBindings | null>;
  /** 两层都不可得时的 fail-loud 指路文案(本地兜底文件路径)。 */
  localHintPath: string;
}

/**
 * 两层解析:配置了云端地址就先拉云端;失败降级本地兜底并在结果里如实标注。
 * 两层都不可得 → fail-loud(指路:检查云端地址,或写本地兜底文件)。
 */
export async function resolveModuleBindings(ports: ResolveBindingsPorts): Promise<ResolvedModuleBindings> {
  if (ports.cloud !== null) {
    try {
      return { bindings: await ports.cloud(), degraded: false, degradedReason: null };
    } catch (error) {
      const local = await ports.local();
      if (local !== null) {
        return {
          bindings: local,
          degraded: true,
          degradedReason: error instanceof Error ? error.message : String(error),
        };
      }
      throw new ModuleBindingsError(
        `云端模块绑定不可得且无本地兜底(${String(error)});` +
          `检查云端地址,或在 ${ports.localHintPath} 写入本地兜底配置`,
      );
    }
  }
  const local = await ports.local();
  if (local === null) {
    throw new ModuleBindingsError(
      `未配置云端地址且无本地兜底;在 ${ports.localHintPath} 写入模块绑定,或配置云端地址`,
    );
  }
  return { bindings: local, degraded: false, degradedReason: null };
}

export function validateModules(modules: unknown, origin: string): ModuleRepoBinding[] {
  if (!Array.isArray(modules)) {
    throw new ModuleBindingsError(`${origin} 模块绑定格式非法:modules 必须是数组`);
  }
  return modules.map((item, index) => {
    if (item === null || typeof item !== "object") {
      throw new ModuleBindingsError(`${origin} 模块绑定格式非法:第 ${index + 1} 项不是对象`);
    }
    const record = item as Record<string, unknown>;
    const moduleName = record["moduleName"];
    const repos = record["repos"];
    const versionBranchMap = record["versionBranchMap"];
    if (typeof moduleName !== "string" || !moduleName.trim()) {
      throw new ModuleBindingsError(`${origin} 模块绑定格式非法:第 ${index + 1} 项缺 moduleName`);
    }
    if (!Array.isArray(repos) || repos.some((repo) => typeof repo !== "string")) {
      throw new ModuleBindingsError(`${origin} 模块绑定格式非法:「${moduleName}」的 repos 必须是字符串数组`);
    }
    if (
      versionBranchMap !== undefined &&
      (versionBranchMap === null || typeof versionBranchMap !== "object" || Array.isArray(versionBranchMap))
    ) {
      throw new ModuleBindingsError(`${origin} 模块绑定格式非法:「${moduleName}」的 versionBranchMap 必须是对象`);
    }
    return {
      moduleName,
      repos: repos as string[],
      versionBranchMap: (versionBranchMap ?? {}) as Record<string, string>,
    };
  });
}

/** 版本组→基线分支映射查询;命中返回分支,未命中返回 null(上游 UI 据此亮红色警示条)。 */
export function findVersionBranch(
  bindings: ModuleBindings,
  moduleName: string,
  versionGroup: string,
): string | null {
  const module = bindings.modules.find((item) => item.moduleName === moduleName);
  if (!module) return null;
  return module.versionBranchMap[versionGroup] ?? null;
}
