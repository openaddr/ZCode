// dts-flow 官方内置插件（工单 #93 插件化 / #97 e2e 断言）的测试 helper。
//
// 机制依据（#95 spike 实锤 + 源码核对）：
// - dts-flow 以官方内置插件（OFFICIAL_PLUGIN_DEFINITIONS 条目 + 随包 stage，由 #96 提供）
//   首跑被 seedBundledOfficialPlugins 落到 <home>/.zcode/cli/plugins/cache/zcode-plugins-official/
//   dts-flow/<version>/，无 installed_plugins.json 记录，启用态 = enabledPlugins[id] ?? defaultEnabled。
// - 插件 MCP server 的 config 键是 `plugin:<manifest.name>:<mcpServers 键>`
//   （apps/zcode-cli/packages/adapters/src/plugins/mcp.ts toNamespacedServerName），
//   工具全名经 normalizeMcpToolDescriptor 归一化为
//   `mcp__<sanitize(serverName)>__<sanitize(toolName)>`
//   （apps/zcode-cli/packages/adapters/src/mcp/descriptor.ts sanitizeMcpName：
//   非 [a-zA-Z0-9_-] 折叠为单 "_"）。先例实录：zcode-cua → `mcp__plugin_zcode-cua_computer-use__*`。
//   注意：mock 全链路实录的 `mcp__dts-flow__<tool>` 是手写 MCP server 路径的形状；
//   插件化后必带 `plugin:` 命名空间，因此断言按 manifest 的 mcpServers 键现场推导工具全名，
//   不写死 server 键（#96 的键名选择不进断言）。
// - 工具叶子名五件套实录：packages/mae-dts-flow/src/adapters/serve.ts
//   `listTools: () => [SERVER_INFO_TOOL, ...flow.listTools()]`。
import { existsSync } from "node:fs";
import { readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import type { ZCodePluginInfo, ZCodePluginsListResult } from "@zcode/shared";

export const DTS_FLOW_PLUGIN_NAME = "dts-flow";
export const DTS_FLOW_OFFICIAL_MARKETPLACE_ID = "zcode-plugins-official";
/** 官方内置插件的 discovery id 形如 <manifest.name>@<marketplace>（先例：skill-creator@zcode-plugins-official）。 */
export const DTS_FLOW_PLUGIN_ID = `${DTS_FLOW_PLUGIN_NAME}@${DTS_FLOW_OFFICIAL_MARKETPLACE_ID}`;
/** 五件套叶子名：server_info（开场自检）+ 四件套（dts_get_ticket/submit_analysis/create_mr/complete_stage）。 */
export const DTS_FLOW_TOOL_LEAF_NAMES = [
  "server_info",
  "dts_get_ticket",
  "submit_analysis",
  "create_mr",
  "complete_stage",
] as const;
/** 插件化工具全名的稳定前缀：mcp__plugin_<name>_...（server 键不进前缀断言）。 */
export const DTS_FLOW_PLUGIN_TOOL_PREFIX = `mcp__plugin_${DTS_FLOW_PLUGIN_NAME}_`;
const ZCODE_PLUGIN_ROOT_TOKEN = "${ZCODE_PLUGIN_ROOT}";
const MASKED_ENTRY_SUFFIX = ".e2e-masked";

export interface DtsFlowPluginManifest {
  manifestPath: string;
  mcpServers: Record<string, { command?: string; args?: string[] }>;
  serverKeys: string[];
}

/** 会话工具清单（上游请求 body.tools[]）里出现的工具全名。 */
export function readAdvertisedToolNames(requestJson: unknown): string[] {
  const tools = (requestJson as { tools?: unknown } | null | undefined)?.tools;
  if (!Array.isArray(tools)) return [];
  return tools
    .filter((tool): tool is Record<string, unknown> => typeof tool === "object" && tool !== null)
    .map((tool) => (typeof tool.name === "string" ? tool.name : ""))
    .filter(Boolean);
}

/** 上游请求 tools[] 里属于 dts-flow 插件命名空间的工具数量。 */
export function countDtsFlowAdvertisedTools(requestJson: unknown): number {
  return readAdvertisedToolNames(requestJson).filter((name) =>
    name.startsWith(DTS_FLOW_PLUGIN_TOOL_PREFIX),
  ).length;
}

/** 从插件列表读态里找 dts-flow（id 兼容带/不带官方市场后缀两种形状）。 */
export function findDtsFlowPlugin(list: ZCodePluginsListResult): ZCodePluginInfo | undefined {
  return list.plugins.find(
    (plugin) => plugin.id === DTS_FLOW_PLUGIN_ID || plugin.id === DTS_FLOW_PLUGIN_NAME,
  );
}

/** 读取 seed 产物里的插件 manifest（官方内置插件的落盘形状是 .zcode-plugin/plugin.json）。 */
export async function readDtsFlowPluginManifest(rootPath: string): Promise<DtsFlowPluginManifest> {
  const manifestPath = join(rootPath, ".zcode-plugin", "plugin.json");
  const parsed = JSON.parse(await readFile(manifestPath, "utf-8")) as {
    mcpServers?: Record<string, { command?: string; args?: string[] }>;
  };
  const mcpServers = parsed.mcpServers ?? {};
  return { manifestPath, mcpServers, serverKeys: Object.keys(mcpServers) };
}

/** 按 descriptor.ts 同款规则推导某 (server 键, 工具叶子名) 的会话工具全名。 */
export function dtsFlowNamespacedToolName(serverKey: string, leafName: string): string {
  // toNamespacedServerName: `plugin:<manifest.name>:<serverKey>`
  const serverName = `plugin:${DTS_FLOW_PLUGIN_NAME}:${serverKey}`;
  return `mcp__${sanitizeMcpName(serverName)}__${sanitizeMcpName(leafName)}`;
}

function sanitizeMcpName(name: string): string {
  // 镜像 apps/zcode-cli/packages/adapters/src/mcp/descriptor.ts 的 sanitizeMcpName。
  const sanitized = name.replace(/[^a-zA-Z0-9_-]/gu, "_").replace(/_+/gu, "_");
  return sanitized.length > 0 ? sanitized : "unknown";
}

export interface DtsFlowServerEntryMask {
  /** 被遮蔽的 mcpServers 键（设置 › MCP 页插件行 id = `plugin:<name>:<key>`）。 */
  serverKey: string;
  /** 被改名的服务入口文件绝对路径。 */
  entryPath: string;
  /** 把入口文件名改回去。 */
  restore: () => Promise<void>;
}

/**
 * 断言 C 的故障注入：把 seed 产物里 mcpServers 声明的服务入口文件改名，
 * 让 plugin-host 在 existsSync 处确定性失败（stderr
 * `Plugin host failed: Plugin server file does not exist.` + exit 1，
 * apps/zcode-cli/packages/cli/src/plugin-host-command.ts）。
 * 选改名而不是改 manifest：宿主每次会话从 manifest 现场改写 spawn 参数，
 * 改 manifest 容易被 `plugin_variable_missing` 诊断提前吞掉而不 spawn；
 * 改入口文件让失败发生在 host 进程里，正是 spike 负向实测走过的路径。
 */
export async function maskDtsFlowServerEntry(rootPath: string): Promise<DtsFlowServerEntryMask> {
  const manifest = await readDtsFlowPluginManifest(rootPath);
  const serverKey = manifest.serverKeys[0];
  if (!serverKey) {
    throw new Error(
      `dts-flow plugin manifest has no mcpServers entry: ${manifest.manifestPath}（#96 manifest 形状变化时须同步本 helper）`,
    );
  }
  const server = manifest.mcpServers[serverKey] ?? {};
  // 官方内置插件 stdio 形如 command=node/zcode.cjs、args=["${ZCODE_PLUGIN_ROOT}/dist/mcp/server.js"]；
  // 落盘 manifest 保留模板，${ZCODE_PLUGIN_ROOT} 在宿主 spawn 前才被替换。
  const templated = [server.command, ...(server.args ?? [])].find(
    (value): value is string =>
      typeof value === "string" && value.includes(ZCODE_PLUGIN_ROOT_TOKEN),
  );
  if (!templated) {
    throw new Error(
      `dts-flow server "${serverKey}" has no ${ZCODE_PLUGIN_ROOT_TOKEN} entry to mask: ${JSON.stringify(server)}`,
    );
  }
  const entryPath = join(
    rootPath,
    templated.slice(templated.indexOf(ZCODE_PLUGIN_ROOT_TOKEN) + ZCODE_PLUGIN_ROOT_TOKEN.length),
  );
  if (!existsSync(entryPath)) {
    throw new Error(`dts-flow server entry to mask does not exist: ${entryPath}`);
  }
  const maskedPath = `${entryPath}${MASKED_ENTRY_SUFFIX}`;
  await rename(entryPath, maskedPath);
  return {
    serverKey,
    entryPath,
    restore: async () => {
      await rename(maskedPath, entryPath).catch((error: NodeJS.ErrnoException) => {
        // seed 标记幂等只在 agent 重启时触发；单测进程内恢复失败属真实异常。
        if (error.code !== "ENOENT") throw error;
      });
    },
  };
}
