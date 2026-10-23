# P0 — 产品身份与数据隔离规格

## 产品规则

- 默认产品身份为 mae,命名按决策 D10 执行。
- 官方(production/preview)身份仅在显式 `ZCODE_ALLOW_OFFICIAL_IDENTITY=1` 时可解析;未授权解析到非 mae 身份时构建期直接抛错。守卫内建于身份解析路径,覆盖全部构建入口(消除"忘带 env / 走了上游原生命令"这类无意产出官方包的失败类别)。
  - 守卫触发口径(2026-10-22 实现定稿):身份轴显式请求官方身份(`ZCODE_PREVIEW_IDENTITY=1`)而未授权 → 抛错;`ZCODE_ENV=production` 属后端轴(mae 构建固定该值),未授权时**静默回落 mae 不抛错**,否则 `bundle:desktop` 默认路径必炸。授权后完全沿用上游两轴语义(production→production、test→preview、preview flag→preview),供对照调试。
- 身份轴与 `ZCODE_ENV` 轴正交(沿用 preview 先例);mae 构建固定 `ZCODE_ENV=production`。
- 单实例锁、Electron userData/sessionData、安装器注册表、任务栏 AUMID 随身份自动隔离;业务数据根由 mae 启动路径显式 `setDataBaseDir(~/.zcode-mae)`(其数据落在 `~/.zcode-mae/.zcode`,优先级高于 env)。
- 安装身份(构建侧)与运行身份(运行侧)**必须同一 patch 内联动修改**——只改一侧会出现"安装目录分开但单实例锁/userData 仍与官方互斥"的半隔离(实锤现象:自构建版启动只激活官方版窗口)。
- deep link 全链路换 `zcode-mae://`,包括 macOS Finder 打开文件夹工作流(隐蔽消费方)与 web 分享页链接生成方。

## 状态所有者与接口

- 新增 `packages/desktop/scripts/mae-identity.mjs`(+ 手写 `mae-identity.d.mts`):构建期与运行期**共用**的身份模块——身份常量、默认翻转逻辑、授权守卫、运行名链的唯一出口(与上游 `desktop-product-identity.mjs`「构建脚本与 main 进程共用 ESM」同一模式;架构治理要求 `packages/desktop/src` 下新 `.ts` 走模块 adopt 五件套,故运行期暂不另设 `src/main/mae/`,待 #9/#10 落地数据根/scheme 时再评估 adopt)。数据根、scheme 常量属后续票,仍在本模块或其派生模块内收敛。
- 开发态 AUMID 为 `dev.zcode-mae.app.dev`:与官方开发态 `cn.aminer.zcode`、mae 打包态 appId 三方互不混淆。
- 上游文件只做 ≤10 行挂接(委托 mae 模块),每处加 `// mae:` 标记并登记 docs/mae/customization-registry.md。

### 挂接点清单(实现时逐处登记)

| 上游文件 | 用途 |
| --- | --- |
| `packages/desktop/scripts/desktop-product-identity.mjs` | flavor 解析委托 mae 模块(默认 mae + 授权守卫) |
| `packages/desktop/src/main/desktopRuntimeEnv.ts` | runtimeApplicationName 链、isMaePackagedRuntime、computer-use helper 兜底路径 mae 化 |
| `packages/desktop/electron-builder.config.js` | protocols schemes 走 identity |
| `packages/desktop/src/main/desktopDeepLinkUrl.ts` | scheme 校验引用 mae 常量 |
| `packages/desktop/src/main/desktopLinuxDeepLinkRegistration.ts` | Linux 协议注册 scheme 常量 |
| `packages/desktop/src/main/desktopFinderOpenFolderWorkflow.ts` | Finder 工作流链接 scheme 常量 |
| `packages/shared/src/platform.ts` | share/import 意图注册 scheme 常量 |
| `packages/desktop/src/main/index.ts`(启动早期) | mae 身份时 `setDataBaseDir(~/.zcode-mae)`(落地移至 `desktopDataBaseDirBootstrap.ts`,见落地记录) |
| `packages/shared/src/env.ts` | `ZCodeProductFlavor` 类型与 normalize 接受 "mae"(编译期 define 不回落官方 preview) |

> 落地记录(2026-10-22,#8):已落地 desktop-product-identity.mjs(flavor 委托+mae 注册+AUMID 分支)、desktopRuntimeEnv.ts(运行名链/isMaePackagedRuntime/helper 变体)、shared/env.ts;electron-builder 配置无需改动——productName/appId/linux 包名本就参数化走 identity。scheme 相关行与 index.ts 数据根行属 #9/#10。

> 落地记录(2026-10-22,#9):数据根挂接落点为 `desktopDataBaseDirBootstrap.ts` 而非原列 index.ts——index.ts 顶部 `desktopEarlyDataBaseDirBootstrap.js` 副作用 import 使前者才是启动 import 链中最早的 dataBaseDir 触点,index.ts 函数体注入为时已晚(bootstrap setting.json 会先按官方 `~/.zcode` 解析)。该挂接三件事:启动早期 `setDataBaseDir(~/.zcode-mae)`(经 paths.ts 编程接口,优先级高于 env)、bootstrap setting.json 默认路径同根切到 `~/.zcode-mae/.zcode/v2/setting.json`、注入 `ZCODE_DESKTOP_HOME_DIR=~/.zcode-mae`(settingService 的 home 覆盖轴,主进程与 host 子进程的 setting.json 均落 mae 根,经 buildHostProcessEnv 现有继承机制透传)。决策函数在 mae-identity.mjs(`resolveMaeDataRootBootstrap`):显式 `ZCODE_DATA_BASE_DIR` 为保留覆盖轴(上游 e2e wdio 与 CLI 调试依赖它重定向,mae 不劫持);官方身份返回 null 完全保留上游语义。desktopRuntimeEnv.ts 开发态 helper 兜底 mae 化(显式 ZCODE_HOME 仍优先)。遗留:services 侧 commands/hooks/mcp-sync 的用户级目录(`~/.zcode/commands`、`~/.zcode/cli/config.json`、hooks)仍按真实 HOME 解析(上游与 CLI 对等的设计),彻底收敛待后续票。

> 落地记录(2026-10-22,#10):scheme 常量 `zcode-mae` 落点定为 `packages/shared/src/mae/deeplinkScheme.mjs`(+手写 .d.mts,经 index.ts 公共入口再导出)——原候选 mae-identity.mjs 因 shared/web 无法跨包导入 desktop/scripts 而排除;electron-builder.config.js(Node 构建脚本)直接 import 该 .mjs,与 TS 消费方共用同一份常量。六消费方 + 枚举外第 7 处(desktopOAuthDeepLink 运行期 setAsDefaultProtocolClient,不换会劫持官方协议)已统一切换;Linux desktop 文件名随 scheme 隔离为 `zcode-mae.desktop`。遗留:services OAuth provider redirect URI(`zcode://oauth/callback`)随 account-login gate 关闭,未随本票切换;Linux desktop entry `Icon=zcode` 图标命名与官方共名。

> 落地记录(2026-10-22,#24 运行态写入重定位):四处薄挂接——(1)`buildHostProcessEnv` 为 mae 身份注入 `ZCODE_STORAGE_DIR=mae 数据根`(`~/.zcode-mae/.zcode`),Agent 侧 exec 输出(`adapters/src/exec/execution-utils.ts`)、剪贴板(`cli/src/clipboard-image.ts`)、SEA 运行时工具(`cli/src/sea-runtime-tools.ts`)三处本就读该变量,插件存储与技能(`bootstrap/src/plugins.ts`、`skills.ts` 经 `config.storage.dir`)同轴白拿;注入值优先于继承 env(mae 数据根是权威)。(2)CLI `adapters/src/workflow/index.ts` 的 `DEFAULT_WORKFLOW_ROOT` 改为 `ZCODE_STORAGE_DIR` 优先(未注入保持官方 `~/.zcode/cli/workflows`)。(3)`exportLogs.ts` 的 cli 目录与 computer-use run 目录经共享 `getZCodeHomeRootDir()` 随 mae 数据根收集,诊断导出不再打包官方副本。(4)`index.ts` 的 `settingsFile` 改走 `resolveBootstrapSettingsFile()`(mae 窗口状态落 mae 根)。核实结论:CLI sqlite(`~/.zcode/cli/db/db.sqlite`)**被内嵌 agent 使用**——`app-server` 经 zcode-protocol 入口每次启动都 open SqliteSessionStore(路径走 `config.storage.sessionDbPath`,默认 `~/` 前缀由 `resolvePath` 按真实 homedir 解析,`ZCODE_STORAGE_DIR` 不影响它;env 覆盖轴为 `ZCODE_SESSION_DB_PATH`),**不可按"不用"豁免**,其收口(注入 ZCODE_SESSION_DB_PATH 或 config 改造)留待 #23 收口票定夺;插件存储归属 CLI 存储轴(`{storage.dir}/cli/plugins`),随本票 ZCODE_STORAGE_DIR 注入隔离成立,desktop/services 侧无独立插件路径解析。防丢网:`packages/desktop/test/mae-runtime-reloc.test.ts`(6 例)+ `apps/zcode-cli/packages/adapters/tests/workflow-root-mae-reloc.test.ts`(3 例)。

## D3 定稿:用户级存储隔离全景与豁免清单(2026-10-22,#23/#26)

**口径**:mae 身份(默认)下,本机用户级数据、运行态与配置存储完全隔离于 `~/.zcode-mae/.zcode`;官方 `~/.zcode` 除下表「有意共享」外零写入、零读取依赖。官方身份(`ZCODE_ALLOW_OFFICIAL_IDENTITY=1`)保留上游全部语义。隔离轴六条:`setDataBaseDir(~/.zcode-mae)`(启动早期,优先级高于 env)、`ZCODE_DESKTOP_HOME_DIR`(setting.json 与用户级 hooks/MCP/插件配置基目录)、`ZCODE_STORAGE_DIR`(Agent 侧 exec/剪贴板/SEA/工作流/user script workflow/插件/技能/standalone 设备态)、`ZCODE_SESSION_DB_PATH`(会话 DB)、`ZCODE_MAILBOX_ROOT`(会话邮箱,#31)、`ZCODE_DATA_BASE_DIR`(host 透传共享凭证等)。

### 目录级全景表

| 目录/内容 | mae 归属 | 轴/依据 |
| --- | --- | --- |
| `~/.zcode-mae/.zcode`(业务数据根) | mae 独占 | `setDataBaseDir` 启动挂接(#9) |
| `~/.zcode-mae/.zcode/v2/setting.json`(主进程+host) | mae | `ZCODE_DESKTOP_HOME_DIR`(#9/#24) |
| 同上(早期 Chromium HW accel 布尔,只读) | mae | 与启动 setting.json 同根解析(#31) |
| `~/.zcode-mae/.zcode/cli/config.json`(用户级 hooks/MCP/插件配置,四端:hooksService、mcpSyncService、CLI file-config 读写、desktop 设置页 mcpUserDirectory)、`.zcode/security`(services + CLI 执行侧 trust store) | mae | `resolveMaeAwareUserHomeDir`(#25/#31) |
| `~/.zcode-mae/.zcode/cli/workflows`(动态工作流)、`~/.zcode-mae/.zcode/workflows`(user script workflow 分类/按名解析) | mae | `ZCODE_STORAGE_DIR` 优先(#24/#31) |
| `~/.zcode-mae/.zcode/cli/db/db.sqlite`(会话 DB) | mae | `ZCODE_SESSION_DB_PATH` 注入(#24 补遗) |
| `~/.zcode-mae/.zcode/mailbox`(会话邮箱) | mae | `ZCODE_MAILBOX_ROOT` 注入(#31) |
| exec 输出/剪贴板/SEA 运行时工具/插件存储/技能存储 | mae | `ZCODE_STORAGE_DIR`(#24) |
| computer-use helper(dev 兜底)与 run 目录、诊断导出收集 | mae | #9 兜底 mae 化 + #24 `getZCodeHomeRootDir()` |
| 共享凭证/telemetry-state/个人 provider 配置(`.zcode/v2`;CLI standalone 设备态含 `ZCODE_STORAGE_DIR` 优先级,`ZCODE_HOME` 显式覆盖轴保留) | mae | `ZCODE_DATA_BASE_DIR` host 透传 + `ZCODE_STORAGE_DIR`(#31) |
| Electron userData/sessionData/单实例锁(`%APPDATA%\ZCode Mae`) | mae | 身份轴(#8) |
| `~/.zcode/cli/log`、`~/.zcode/cli/rollout|debug` | **有意共享** | append 型诊断流,豁免清单 |
| `~/.zcode/commands` | **有意共享** | 用户手写命令资产,双端可用 |
| `~/.claude/*`、`~/.claude.json`(记忆接口/导入) | **跨工具导入** | Claude 生态只读互通 |
| 项目级 `.zcode`、`.agents/skills`、`.agents/mcp.json` | 项目所有 | workspace 参数 join,非用户级 |
| 远程主机 `~/.zcode/server` 等 | 远程主机轴 | 在远端 HOME 解析,不落本机 |

### 有意共享清单(与 `scripts/audit-mae-user-paths.mjs` WHITELIST 同源)

agent 日志目录;模型轨迹 rollout/debug(写入端 runner-debug + 读取端 modelTrajectoryFileTail);自定义命令目录(commandsService + 设置页路径提示);用户记忆接口(`~/.claude/memory`);`.claude`/`.claude.json` 跨工具导入(output-style/settings/claude-native 会话导入等);项目级 `.zcode` 与 `.agents/skills`;onboarding 使用证据对官方会话库的只读探测(env 轴注入时跟随 agent 轴);远程主机轴路径。

### 已取消项(固化记录,后续会话不再重启)

- `.zcode` 常量化重构(全仓 107 处)——以 audit 门禁替代,机械拦截新增散点。
- 项目级 `.zcode` 目录改名——项目所有,双工具对等,保持。
- 单层目录方案 B(`~/.zcode-mae` 下直接平铺,不再嵌 `.zcode`)——维持双层,与上游存储结构对齐减小同步面。

### 门禁与漏网登记

门禁:`pnpm audit:mae-user-paths`(接入 `verify:pre-push` 与 `test:architecture`),扫描 `apps/zcode-cli/packages/*/src` 与 `packages/*/src` 的 HOME 直拼 `.zcode` 模式(join(homedir(), ".zcode") / join(home 变量, ".zcode") / ".zcode" 首段 join / 整串 "~/.zcode" 字面量),语义放行已挂接形态(env 轴兜底、mae 身份三元、参数/配置优先),白名单与上表同源;白名单外命中即非零退出。自测:`scripts/test/audit-mae-user-paths.test.mjs`(注入假散点应红、白名单项全绿、known-leftover 组保持清空)。

漏网收口记录(#31,known-leftover 白名单组已清空,ratchet 由自测空组断言把守):七项全部薄挂接——CLI 执行侧 workspace hook trust store 与 CLI 插件配置默认基目录挂 `resolveMaeAwareUserHomeDir`(与 services #25 同链,四端同一份 config.json/trust store);user script workflow 分类/按名解析根挂 `ZCODE_STORAGE_DIR`(#24 同轴);早期 Chromium HW 布尔复用启动 bootstrap 的 mae 感知 setting.json 解析;standalone 设备态挂 `ZCODE_STORAGE_DIR`(`ZCODE_HOME` 显式覆盖轴保留)、services telemetryCore 设备态统一走数据基目录轴(显式 homeDir 优先);会话邮箱经桌面注入 `ZCODE_MAILBOX_ROOT`。边界核实两项结论(#31):(a) desktop `mcpUserDirectory` 的 HOME 解析确需挂 `ZCODE_DESKTOP_HOME_DIR`(核实时用户级 MCP 仍读写官方 `~/.zcode/cli/config.json`,与 #25 错位),已一并收口;(b) shell 侧 `$HOME/.zcode` 引用全部为远程主机轴(`$HOME/.zcode/server`,SSH 在远端 HOME 解析,白名单 remote-host-path 组同源)或官方身份工具脚本(macOS doctor 诊断、上游发行版 installer 的 `$HOME/.zcode/runtime`),无本机 mae 实体,记录不动。扫描器已知局限(动态段展开与 shell 字符串)保留,形态化收口以本节记录为准。

## 守卫与测试

- 新增单测文件(纯新增,rebase 不可冲掉):断言默认 flavor = mae;断言未设授权 env 时解析官方身份抛错。挂接被 rebase 冲掉时该测试变红,即"防丢网"。
- Windows 数据根沿用 paths.ts 现有防护(base 不得指向应用安装目录)。

## 验收场景

1. 全新克隆、不设任何 env,分别经 `pnpm bundle:desktop` 与 mae 专属构建入口构建 → 产物名/appId 均为 mae。
2. 官方版运行中启动 mae → 打开新窗口,互不激活;反向同样。
3. 双方各自产生数据(会话/登录态/窗口状态)后,检查 `~/.zcode-mae/.zcode`、`%APPDATA%\ZCode Mae` 与官方对应目录互不相交。
4. 人为移除任一挂接行(模拟 rebase 丢失)→ 默认身份单测失败。
