// 工单 #97：dts-flow 官方内置插件（#96 提供随包 stage 与 OFFICIAL_PLUGIN_DEFINITIONS 条目）
// 的桌面 e2e 三断言——「装上可见 → 禁用后新会话消失 → 服务入口缺失失败可见」。
// 目标：让 #92 类「插件静默缺席」从此有机器拦截。
//
// 执行前置条件（未满足时断言 A 直接红，属预期）：
// 1. #96 已合入集成书签：插件 id `dts-flow`（dts-flow@zcode-plugins-official）出现在
//    OFFICIAL_PLUGIN_DEFINITIONS 且 defaultEnabled，包随桌面 stage（首跑自动 seed）。
// 2. 完整桌面 e2e 环境（wdio + 打包态构建产物），运行命令见同目录
//    dts-flow-plugin-session-tools-smoke.md 的「自动化运行」一节。
//
// 机制依据（#95 spike + 源码核对，详见 helpers/plugin-dts-flow.ts 头注）：
// - 工具全名形状：插件化后带 `plugin:` 命名空间（`mcp__plugin_dts-flow_<server 键>__<leaf>`），
//   不是 mock 全链路实录里手写 MCP server 路径的 `mcp__dts-flow__<leaf>`；断言按 seed 产物
//   manifest 现场推导全名，server 键不写死。
// - 启停键 plugins.enabledPlugins[<id>]（plugins/setEnabled 协议，UI 开关即该服务面的消费方）；
//   spike 实锤变更只对新会话生效（runtimeConfig 在会话/app 创建时固化），故断言 B 必须「新开会话」。
// - 失败可见性：plugin-host 对缺失入口写 stderr `Plugin host failed: Plugin server file does not exist.`
//   并 exit 1（apps/zcode-cli/packages/cli/src/plugin-host-command.ts）；MCP manager 把同连接的
//   stderr 尾巴并进失败状态（adapters/src/mcp/index.ts stdio statusMessage）落到设置 › MCP 页
//   插件行 data-mcp-status="error" 与失败详情 popover（先例：settings/manual-review mcp-failure-guidance）。
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  TID_PLUGIN_MCP_SERVER_ROW,
  TID_SETTINGS_PAGE,
  TID_SETTINGS_SECTION_NAV,
  TID_TASK_SETTINGS_BUTTON,
  testId,
} from "@zcode/shared/test-ids";
import {
  clearAppData,
  clickTestIdByDom,
  getE2EAppDataPaths,
  waitForTestIdByDom,
} from "../helpers/desktop-app.js";
import { waitForUpstreamRequestContaining } from "../helpers/conversation-session-network.js";
import { findUpstreamRequestContaining } from "../helpers/plugin-mcp-skill.js";
import {
  countDtsFlowAdvertisedTools,
  dtsFlowNamespacedToolName,
  DTS_FLOW_PLUGIN_ID,
  DTS_FLOW_TOOL_LEAF_NAMES,
  findDtsFlowPlugin,
  maskDtsFlowServerEntry,
  readAdvertisedToolNames,
  readDtsFlowPluginManifest,
} from "../helpers/plugin-dts-flow.js";
import {
  getPluginList,
  openPluginSettings,
  pluginPathExists,
  setPluginEnabledThroughUi,
  waitUntilPluginList,
} from "../helpers/plugin-management-lifecycle.js";
import {
  E2E_REPLY_TOKEN,
  prepareV4ConversationE2E,
  sendV4Prompt,
  startNewV4Draft,
  waitForV4AssistantMessageContaining,
} from "../helpers/v4-conversation.js";

const CASE_TIMEOUT_MS = 420000;
const MCP_FAILURE_VISIBLE_TIMEOUT_MS = 60000;
const ACTIVE_FAILURE_POPOVER = '[data-testid="mcp-failure-popover"][data-state="open"]';

describe("DTS-FLOW-PLG dts-flow 官方内置插件会话工具 E2E", () => {
  after(async () => {
    await browser.electron.restoreAllMocks();
    await clearAppData();
  });

  it("装上→新会话见五件套；禁用→新会话消失；入口缺失→失败可见", async function () {
    this.timeout(CASE_TIMEOUT_MS);

    // ---- 断言 A：装上可见（干净 e2e home 首跑，随包 seed 自动出现在插件读态） ----
    await waitUntilPluginList(
      (list) => Boolean(findDtsFlowPlugin(list)),
      "dts-flow 官方内置插件没有出现在插件读态（随包 seed 未生效：确认 #96 已提供 definitions 条目与随包 stage）",
      120000,
    );
    const seeded = findDtsFlowPlugin(await getPluginList());
    expect(seeded).toMatchObject({ enabled: true });
    expect(seeded?.rootPath).toBeTruthy();
    expect(pluginPathExists(seeded!.rootPath)).toBe(true);
    // seed 产物形状：.zcode-plugin/plugin.json（与官方内置插件家族一致）。
    expect(existsSync(join(seeded!.rootPath, ".zcode-plugin", "plugin.json"))).toBe(true);
    const manifest = await readDtsFlowPluginManifest(seeded!.rootPath);
    expect(manifest.serverKeys.length).toBeGreaterThan(0);

    // 新建会话 → 上游请求 tools[] 是会话工具清单的强证据
    // （先例：conversation-session-plugin-mcp-skill-*，只有 MCP server 被 listTools 成功，
    // 归一化后的 mcp__* 工具才会进模型请求 tools 数组）。
    await prepareV4ConversationE2E();
    const enabledMarker = `E2E_DTS_FLOW_ENABLED_${Date.now()}`;
    await sendV4Prompt(
      `${enabledMarker}: Reply with exactly "${E2E_REPLY_TOKEN}" and no other text.`,
    );
    await waitForUpstreamRequestContaining(enabledMarker, 60000);
    const enabledRequest = await findUpstreamRequestContaining(enabledMarker, 60000);
    expect(enabledRequest).not.toBeNull();
    const enabledTools = readAdvertisedToolNames(enabledRequest?.requestJson);
    for (const serverKey of manifest.serverKeys) {
      for (const leafName of DTS_FLOW_TOOL_LEAF_NAMES) {
        expect(enabledTools).toContain(dtsFlowNamespacedToolName(serverKey, leafName));
      }
    }
    // 命名空间下不允许混入五件套之外的工具（防多装/串键）。
    expect(countDtsFlowAdvertisedTools(enabledRequest?.requestJson)).toBe(
      manifest.serverKeys.length * DTS_FLOW_TOOL_LEAF_NAMES.length,
    );
    // 等 turn 收尾，避免下一阶段在会话运行态叠插件商店页。
    await waitForV4AssistantMessageContaining(E2E_REPLY_TOKEN);

    // ---- 断言 B：经 plugins/setEnabled 禁用 → 新会话工具清单不含 dts-flow ----
    // 插件商店的启用开关是 IPluginManagementService.setPluginEnabled（协议 plugins/setEnabled）
    // 的真实消费方；商店页写 workspace scope（PluginStorePage actions.onSetEnabled）。
    await openPluginSettings();
    await setPluginEnabledThroughUi(DTS_FLOW_PLUGIN_ID, false, "detail");
    await waitUntilPluginList(
      (list) => findDtsFlowPlugin(list)?.enabled === false,
      "dts-flow 禁用后插件读态没有翻转为 disabled",
    );
    const disabledPlugin = findDtsFlowPlugin(await getPluginList());
    expect(disabledPlugin).toMatchObject({ enabled: false, enabledSource: "workspace" });
    // plugins/setEnabled 落盘证据：workspace 层 config 的 plugins.enabledPlugins[id]=false。
    const workspaceConfig = await readJsonRecord(
      join(getE2EAppDataPaths().workspace, ".zcode", "config.json"),
    );
    expect(readEnabledPlugins(workspaceConfig)[DTS_FLOW_PLUGIN_ID]).toBe(false);

    // 变更只对新会话生效（spike 实锤）：必须新开 draft，不能在旧会话里等工具消失。
    await startNewV4Draft();
    const disabledMarker = `E2E_DTS_FLOW_DISABLED_${Date.now()}`;
    await sendV4Prompt(
      `${disabledMarker}: Reply with exactly "${E2E_REPLY_TOKEN}" and no other text.`,
    );
    await waitForUpstreamRequestContaining(disabledMarker, 60000);
    const disabledRequest = await findUpstreamRequestContaining(disabledMarker, 60000);
    expect(disabledRequest).not.toBeNull();
    expect(countDtsFlowAdvertisedTools(disabledRequest?.requestJson)).toBe(0);
    // 等 turn 收尾，避免下一阶段在会话运行态叠设置页。
    await waitForV4AssistantMessageContaining(E2E_REPLY_TOKEN);

    // ---- 断言 C：失败可见（负路径）——服务入口缺失不得静默缺席 ----
    // 重新启用（同一条 plugins/setEnabled 服务面），再把 seed 产物里的服务入口文件改名。
    await openPluginSettings();
    await setPluginEnabledThroughUi(DTS_FLOW_PLUGIN_ID, true, "detail");
    await waitUntilPluginList(
      (list) => findDtsFlowPlugin(list)?.enabled === true,
      "dts-flow 重新启用后插件读态没有恢复 enabled",
    );
    const remasked = findDtsFlowPlugin(await getPluginList());
    expect(remasked?.rootPath).toBeTruthy();
    const mask = await maskDtsFlowServerEntry(remasked!.rootPath);
    try {
      await startNewV4Draft();
      const failureMarker = `E2E_DTS_FLOW_BROKEN_${Date.now()}`;
      await sendV4Prompt(
        `${failureMarker}: Reply with exactly "${E2E_REPLY_TOKEN}" and no other text.`,
      );
      // 失败不得拖死会话：MCP server 失败只降级，turn 照常完成（mcp.startup.completed 计失败数）。
      await waitForUpstreamRequestContaining(failureMarker, 60000);
      const failureRequest = await findUpstreamRequestContaining(failureMarker, 60000);
      expect(failureRequest).not.toBeNull();
      expect(countDtsFlowAdvertisedTools(failureRequest?.requestJson)).toBe(0);
      // 失败只降级不拖死：dts-flow 缺席但 turn 仍走到确定性回复。
      await waitForV4AssistantMessageContaining(E2E_REPLY_TOKEN);

      // 会话侧可观测信号：设置 › MCP 页的插件 server 行（id=plugin:dts-flow:<键>）变 error。
      await clickTestIdByDom(TID_TASK_SETTINGS_BUTTON, {
        timeout: 15000,
        timeoutMsg: "会话失败态下没有回到全局设置入口",
      });
      await waitForTestIdByDom(TID_SETTINGS_PAGE, { timeout: 15000 });
      await clickTestIdByDom(testId(TID_SETTINGS_SECTION_NAV, "mcp"), {
        timeout: 15000,
        timeoutMsg: "Settings 没有暴露 MCP section",
      });
      const failureRowId = testId(TID_PLUGIN_MCP_SERVER_ROW, `plugin:dts-flow:${mask.serverKey}`);
      await browser.waitUntil(
        () =>
          browser.execute(
            (rowTestId) =>
              document
                .querySelector(`[data-testid="${rowTestId}"]`)
                ?.getAttribute("data-mcp-status") === "error",
            failureRowId,
          ),
        {
          timeout: MCP_FAILURE_VISIBLE_TIMEOUT_MS,
          timeoutMsg:
            "dts-flow 插件 MCP server 失败没有以 error 状态暴露在设置 › MCP 页（静默缺席回归）",
        },
      );
      // 失败详情（stderr 尾巴）可读：plugin-host 对缺失入口写
      // `Plugin host failed: Plugin server file does not exist.` + exit 1，
      // MCP manager 把它并进失败状态带到该 popover（先例：mcp-failure-guidance 用例同款读法）。
      const failureRow = await browser.$(`[data-testid="${failureRowId}"]`);
      await failureRow.scrollIntoView({ block: "center" });
      await failureRow.$('button[aria-label="详情"], button[aria-label="Details"]').click();
      await browser.waitUntil(() => browser.$(ACTIVE_FAILURE_POPOVER).isExisting(), {
        timeout: 10000,
        timeoutMsg: "dts-flow 失败详情 popover 没有打开",
      });
      const failureText = await browser
        .$(`${ACTIVE_FAILURE_POPOVER} [data-testid="mcp-failure-error"]`)
        .getText();
      expect(failureText).toMatch(/Plugin host failed|Plugin server file does not exist/u);
      await browser.keys(["Escape"]);
    } finally {
      // 恢复入口文件：后续断言/清理不受残留故障注入影响。
      await mask.restore();
    }
  });
});

async function readJsonRecord(path: string): Promise<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf-8")) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

function readEnabledPlugins(config: Record<string, unknown>): Record<string, unknown> {
  const plugins = config.plugins;
  if (typeof plugins !== "object" || plugins === null || Array.isArray(plugins)) return {};
  const enabledPlugins = (plugins as Record<string, unknown>).enabledPlugins;
  if (
    typeof enabledPlugins !== "object" ||
    enabledPlugins === null ||
    Array.isArray(enabledPlugins)
  ) {
    return {};
  }
  return enabledPlugins as Record<string, unknown>;
}
