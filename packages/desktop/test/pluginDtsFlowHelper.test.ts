// plugin-dts-flow e2e helper 纯逻辑单测（#97）。
// 覆盖会话工具全名推导（descriptor.ts sanitize 镜像）、上游请求 tools[] 读态、
// 插件列表查找兼容形状、manifest 解析与入口遮蔽/恢复（断言 C 的故障注入）。
// 位置沿用 e2e helper 单测先例（pluginE2EAdmissionScripts.test.ts 同层）：
// vitest unit 项目排除 packages/desktop/test/e2e/**（那里是 wdio spec 全量 glob）。
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  countDtsFlowAdvertisedTools,
  DTS_FLOW_PLUGIN_ID,
  dtsFlowNamespacedToolName,
  DTS_FLOW_PLUGIN_TOOL_PREFIX,
  DTS_FLOW_TOOL_LEAF_NAMES,
  findDtsFlowPlugin,
  maskDtsFlowServerEntry,
  readAdvertisedToolNames,
  readDtsFlowPluginManifest,
} from "./e2e/helpers/plugin-dts-flow.js";
import type { ZCodePluginsListResult } from "@zcode/shared";

let fixtureRoot = "";

beforeAll(async () => {
  // 锚定到 node_modules（jj/git 均忽略）：vitest worker 里 os.tmpdir() 可能被环境变量
  // 清空导致 fixture 落进仓库根且清理失败（实际踩过）。
  fixtureRoot = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "node_modules",
    ".plugin-dts-flow-helper-fixture",
  );
  await rm(fixtureRoot, { force: true, recursive: true });
  await mkdir(fixtureRoot, { recursive: true });
});

afterAll(async () => {
  await rm(fixtureRoot, { force: true, recursive: true });
});

describe("dtsFlowNamespacedToolName", () => {
  it("按 descriptor.ts 规则推导工具全名（plugin: 命名空间 + sanitize 折叠）", () => {
    expect(dtsFlowNamespacedToolName("dts-flow", "dts_get_ticket")).toBe(
      "mcp__plugin_dts-flow_dts-flow__dts_get_ticket",
    );
    expect(dtsFlowNamespacedToolName("dts-flow", "server_info")).toBe(
      "mcp__plugin_dts-flow_dts-flow__server_info",
    );
    // server 键里的非法字符折叠为单下划线。
    expect(dtsFlowNamespacedToolName("dts__flow", "dts_get_ticket")).toBe(
      "mcp__plugin_dts-flow_dts_flow__dts_get_ticket",
    );
  });

  it("五件套叶子名实录形状（server_info + 四件套）", () => {
    expect([...DTS_FLOW_TOOL_LEAF_NAMES]).toEqual([
      "server_info",
      "dts_get_ticket",
      "submit_analysis",
      "create_mr",
      "complete_stage",
    ]);
    expect(DTS_FLOW_PLUGIN_TOOL_PREFIX).toBe("mcp__plugin_dts-flow_");
  });
});

describe("readAdvertisedToolNames / countDtsFlowAdvertisedTools", () => {
  it("从上游请求 body.tools[] 读工具名，且只计 dts-flow 命名空间", () => {
    const requestJson = {
      tools: [
        { name: "mcp__plugin_dts-flow_dts-flow__server_info" },
        { name: "mcp__plugin_dts-flow_dts-flow__dts_get_ticket" },
        { name: "mcp__other-server__echo" },
        { name: "bash" },
        { description: "no name field" },
      ],
    };
    expect(readAdvertisedToolNames(requestJson)).toEqual([
      "mcp__plugin_dts-flow_dts-flow__server_info",
      "mcp__plugin_dts-flow_dts-flow__dts_get_ticket",
      "mcp__other-server__echo",
      "bash",
    ]);
    expect(countDtsFlowAdvertisedTools(requestJson)).toBe(2);
  });

  it("畸形请求体安全返回空", () => {
    expect(readAdvertisedToolNames(undefined)).toEqual([]);
    expect(readAdvertisedToolNames(null)).toEqual([]);
    expect(readAdvertisedToolNames({})).toEqual([]);
    expect(readAdvertisedToolNames({ tools: "not-an-array" })).toEqual([]);
    expect(countDtsFlowAdvertisedTools({ tools: [{ name: 42 }] })).toBe(0);
  });
});

describe("findDtsFlowPlugin", () => {
  const baseList = { marketplaces: [], availablePlugins: [], installedPlugins: [] } as unknown;

  it("兼容带/不带官方市场后缀的 id 形状", () => {
    const list = {
      ...(baseList as object),
      plugins: [
        { id: "skill-creator@zcode-plugins-official", enabled: true },
        { id: DTS_FLOW_PLUGIN_ID, enabled: true, rootPath: "C:/seeded/dts-flow/1.0.0" },
      ],
    } as ZCodePluginsListResult;
    expect(findDtsFlowPlugin(list)?.rootPath).toBe("C:/seeded/dts-flow/1.0.0");

    const suffixed = {
      ...(baseList as object),
      plugins: [{ id: "dts-flow", enabled: false }],
    } as ZCodePluginsListResult;
    expect(findDtsFlowPlugin(suffixed)?.enabled).toBe(false);
  });

  it("列表里没有 dts-flow 时返回 undefined", () => {
    const list = {
      ...(baseList as object),
      plugins: [{ id: "skill-creator@zcode-plugins-official", enabled: true }],
    } as ZCodePluginsListResult;
    expect(findDtsFlowPlugin(list)).toBeUndefined();
  });
});

describe("readDtsFlowPluginManifest / maskDtsFlowServerEntry", () => {
  // 注意：fixture 路径必须在 beforeAll 内求值——模块加载期 fixtureRoot 还是空串，
  // 相对路径会把 fixture 写进测试进程 cwd（工作区根），污染 jj 工作副本（实际踩过）。
  let pluginRoot = "";
  let entryPath = "";

  beforeAll(async () => {
    pluginRoot = join(fixtureRoot, "dts-flow", "1.2.3");
    entryPath = join(pluginRoot, "dist", "mcp", "server.js");
    await mkdir(join(pluginRoot, ".zcode-plugin"), { recursive: true });
    await mkdir(join(pluginRoot, "dist", "mcp"), { recursive: true });
    await writeFile(
      join(pluginRoot, ".zcode-plugin", "plugin.json"),
      `${JSON.stringify({
        name: "dts-flow",
        version: "1.2.3",
        mcpServers: {
          "dts-flow": {
            type: "stdio",
            command: "node",
            args: ["${ZCODE_PLUGIN_ROOT}/dist/mcp/server.js"],
          },
        },
      })}\n`,
      "utf-8",
    );
    await writeFile(entryPath, "export async function main() {}\n", "utf-8");
  });

  it("解析 seed 产物 manifest 的 mcpServers 键", async () => {
    const manifest = await readDtsFlowPluginManifest(pluginRoot);
    expect(manifest.serverKeys).toEqual(["dts-flow"]);
  });

  it("遮蔽入口文件后恢复原名（断言 C 的故障注入/复位）", async () => {
    const mask = await maskDtsFlowServerEntry(pluginRoot);
    expect(mask.serverKey).toBe("dts-flow");
    expect(mask.entryPath).toBe(entryPath);
    await expect(readFile(entryPath, "utf-8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(`${entryPath}.e2e-masked`, "utf-8")).resolves.toContain("main");
    await mask.restore();
    await expect(readFile(entryPath, "utf-8")).resolves.toContain("main");
    await expect(readFile(`${entryPath}.e2e-masked`, "utf-8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("manifest 无 mcpServers / 无模板入口 / 入口缺失时给出可诊断错误", async () => {
    const bareRoot = join(fixtureRoot, "dts-flow-bare");
    await mkdir(join(bareRoot, ".zcode-plugin"), { recursive: true });
    await writeFile(
      join(bareRoot, ".zcode-plugin", "plugin.json"),
      JSON.stringify({ name: "dts-flow", version: "0.0.0" }),
      "utf-8",
    );
    await expect(maskDtsFlowServerEntry(bareRoot)).rejects.toThrow(/no mcpServers/);

    const tokenlessRoot = join(fixtureRoot, "dts-flow-tokenless");
    await mkdir(join(tokenlessRoot, ".zcode-plugin"), { recursive: true });
    await writeFile(
      join(tokenlessRoot, ".zcode-plugin", "plugin.json"),
      JSON.stringify({
        name: "dts-flow",
        version: "0.0.0",
        mcpServers: { dts: { type: "stdio", command: "node", args: ["server.js"] } },
      }),
      "utf-8",
    );
    await expect(maskDtsFlowServerEntry(tokenlessRoot)).rejects.toThrow(/\$\{ZCODE_PLUGIN_ROOT\}/);
  });
});
