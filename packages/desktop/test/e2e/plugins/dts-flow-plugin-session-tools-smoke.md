# dts-flow 官方内置插件 · 手工冒烟清单（工单 #97，spike 闸降级路径的兜底）

适用对象：含 #96 交付（`OFFICIAL_PLUGIN_DEFINITIONS` 的 `dts-flow` 条目 + 插件包随桌面 stage）的
zcode-mae 打包版。e2e 自动化用例见同目录
`plugin-dts-flow-builtin-session-tools.test.ts`（真实执行前置条件见文末「自动化运行」）。
机制依据：`C:\Users\ning\AppData\Local\Temp\dts-plugin-notes\95-spike.md`（#95 查证笔记）。

术语：`<home>` = 用户主目录；插件存储 = `<home>/.zcode/cli/plugins/`；
seed 缓存 = `<home>/.zcode/cli/plugins/cache/zcode-plugins-official/dts-flow/<版本>/`。

---

## 冒烟 1：首装自动装 + 插件读态可见

1. 备份并清空 `<home>/.zcode`（模拟干净 home；或使用独立测试账号 home）。
2. 启动打包版 ZCode（zcode-mae），进入任意项目工作区。
3. 打开 设置 › 插件（管理页，scope=user）。
4. **期望**：已装/可恢复列表出现 `dts-flow`（官方来源 `zcode-plugins-official`），**无需手动安装**，
   启用态为开（defaultEnabled）。开关状态来源显示 user/default。
5. 打开 插件商店，官方分组能搜到 dts-flow 卡片。
6. **期望（存储面）**：`<home>/.zcode/cli/plugins/cache/zcode-plugins-official/dts-flow/<版本>/.zcode-plugin/plugin.json`
   存在，含 `mcpServers` 与 `skills` 字段。

## 冒烟 2：新会话见五件套工具

1. 保持 dts-flow 启用，**新建**一个会话（草稿即可，发送任意消息让会话跑起来）。
2. 打开 设置 › MCP。
3. **期望**：出现 dts-flow 的插件 server 行（行 id 形如 `plugin:dts-flow:<mcpServers 键>`），
   状态为已连接（`data-mcp-status="connected"`）。
4. 有条件的看模型请求 `tools[]`（会话调试/抓包）。
   **期望**：包含 5 个 dts-flow 工具，全名形状 `mcp__plugin_dts-flow_<键>__<叶子名>`：
   `server_info`、`dts_get_ticket`、`submit_analysis`、`create_mr`、`complete_stage`。
   （注意：不是 mock 手写 MCP 路径的 `mcp__dts-flow__<叶子名>`；插件化后必带 `plugin:` 命名空间。）

## 冒烟 3：禁用 → 只对新会话生效

1. 设置 › 插件，对 dts-flow 执行停用（商店卡片 ⋮ 菜单或详情开关；商店页写 workspace scope）。
2. **期望（存储面）**：`<工作区>/.zcode/config.json` 的 `plugins.enabledPlugins["dts-flow@zcode-plugins-official"]`
   （或 user 层 `~/.zcode/cli/config.json` 同键，取决于 scope）变为 `false`。
3. **新建**一个会话，发消息让它跑起来，重复冒烟 2 的 2–4 步。
   **期望**：dts-flow 的 MCP 行消失/不再注册；模型请求 `tools[]` 不含任何 `mcp__plugin_dts-flow_*`。
   ⚠️ **必须在新建会话里看**：spike 实锤变更只对新会话生效（runtimeConfig 在会话/app 创建时固化），
   旧会话里的旧工具仍在属正常现象，勿据此误报。
4. 重新启用后**再新开**会话，五件套回归。

## 冒烟 4：失败可见（负路径，模拟服务入口缺失）

1. 关闭 app。
2. 把 seed 缓存里的服务入口改名（模板 `${ZCODE_PLUGIN_ROOT}/dist/mcp/server.js`）：
   `cache/zcode-plugins-official/dts-flow/<版本>/dist/mcp/server.js` → `server.js.e2e-masked`。
3. 启动 app，**新建**会话并发消息。
4. **期望（三通道留痕，缺一即为「静默缺席」回归）**：
   - 设置 › MCP 页：dts-flow 插件行状态变错误（`data-mcp-status="error"`）；
   - 行内「详情」popover 错误文本含 `Plugin host failed: Plugin server file does not exist.`
     （plugin-host stderr 尾巴经 mcp.server.failed 结构化日志并进失败状态）；
   - agent 侧结构化日志可见 `mcp.server.failed`（logger.warn，含 failureKind 与 stderr 尾巴）。
5. **期望**：会话本身不被拖死——消息照常得到回复，只是 dts-flow 工具缺席。
6. 把文件名改回，重启 app 后新会话恢复五件套。

## 冒烟 5（可选）：plugin-host 直驱（spike 同款命令）

```bash
ELECTRON_RUN_AS_NODE=1 ZCODE_PLUGIN_ID=dts-flow@zcode-plugins-official \
  "<安装目录>/ZCode.exe" \
  "<安装目录>/resources/glm/zcode.cjs" \
  __zcode-plugin-host \
  "<seed 缓存>/dist/mcp/server.js"
```

**期望**：JSON-RPC `initialize`/`tools/list` 正常应答，`tools/list` 恰好五件套；
负向（入口改名后再跑）stderr 尾行 `Plugin host failed: Plugin server file does not exist.`、exit 1。

---

## 自动化运行（#96 合入集成书签后）

前置条件：

1. #96 已合入：`OFFICIAL_PLUGIN_DEFINITIONS` 含 `dts-flow` 条目（defaultEnabled），
   插件包随桌面 stage（e2e 下由 bundled-plugins 的 rootCandidates 解析 seed）。
2. 桌面 e2e 构建产物就绪（wdio 需要打包态 renderer/agent 产物）。

命令（仓库根；`test:e2e:serial` = `wdio run wdio.conf.ts`）：

```bash
# 只跑本用例（--spec 过滤，wdio 与配置层双通道识别）
pnpm --dir packages/desktop test:e2e:serial -- --spec test/e2e/plugins/plugin-dts-flow-builtin-session-tools.test.ts
# 或（等价环境变量入口）
ZCODE_E2E_SPEC=test/e2e/plugins/plugin-dts-flow-builtin-session-tools.test.ts pnpm --dir packages/desktop test:e2e:serial
```

注意：默认 e2e spec 集是 `./test/e2e/**/*.test.ts`，本文件合入后即进全量批次；
#96 合入前该用例在断言 A（插件读态无 dts-flow）处失败，属预期的红灯，不是环境故障。
