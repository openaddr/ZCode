# mae 定制清单(台账)

> 每处触碰上游文件必须在此登记(规则与"≤10 行 + `// mae:` 标记 + 薄改"三强制见 [sync-runbook.md](sync-runbook.md) 附录)。同步解冲突时按本表逐条恢复。append-only:历史行不改写,新触碰追加新行。

| 日期 | 文件/位置 | 类型 | 意图与要点 |
| --- | --- | --- | --- |
| 2026-10-21 | 根 `MAE.md`(新增,后于 2026-10-22 拆分为 sync-runbook + 本台账并删除) | 手册 | fork 运维手册首版:模型/jj 纪律/同步 runbook/定制登记 |
| 2026-10-21 | `AGENTS.md`(改,「核心原则」首条) | 铁律内联 | 三条铁律(工作区/书签+PR/定制隔离)内联+指向手册;上游若改此文件,同步时整块重放 |
| 2026-10-21 | `.gitattributes`(改,首部 7 行) | 口径 | 全仓文本恒 LF + `.bat/.cmd` CRLF 豁免;根因与双保险见 sync-runbook「EOL 口径」 |
| 2026-10-21 | `specs/mae/`(新增目录:README + identity-isolation + feature-gates + versioning-branding) | 规格 | zcode-mae 独立版决策总表(D1–D14)与 P0–P2 规格;行为改动先更新此处 spec(AGENTS.md spec-first 纪律) |
| 2026-10-21 | `AGENTS.md`(改,核心原则首条末尾) | 指针补全 | 补 `specs/mae/` 指向 |
| 2026-10-21 | `docs/mae/agents/`(新增目录:issue-tracker + triage-labels + domain) | 技能配置 | matt-pocock 技能体系的 mae 侧配置:GitHub Issues 跟踪(`gh --repo openaddr/ZCode`,与上游本地 Markdown 约定区分)、五角色标签、mae 单上下文领域文档 |
| 2026-10-21 | `AGENTS.md`(改,末尾追加 Agent Skills 节) | 入口补全 | 指向 `docs/mae/agents/` 三份配置;声明上游 `docs/agents/`、`docs/issues/` 约定不适用于本 fork |
| 2026-10-22 | `.gitattributes`(改,`*.bat`/`*.cmd` 例外口径) | 口径 | jj 按字节快照下 `text eol=crlf` 要求 blob 归一 LF,与上游 CRLF blob 形成永久幻影 M(实锤挡住 affected 脏树门);改 `-text` 逐字节保真 |
| 2026-10-22 | `AGENTS.md`(重写为我方薄宪法层)+ `upstream-AGENTS.md`(新增,85 行上游快照) | 结构变更 | **所有权模型**:AGENTS.md 归 mae(铁律/规则层级/Agent Skills),上游规则降级为快照引用、冲突以我方为准;同步冲突固定解法见 sync-runbook「6」 |
| 2026-10-22 | `config/provider/mae-builtin.json` + `mae-builtin.test.json`(新增,`scripts/mae/generate-mae-builtin-catalog.mjs` 生成) | 目录裁剪 | mae 内置 provider 目录(#7/D8):官方 zcode-builtin(.test).json 经 `@zcode/shared/mae` 的 filterZCodeBuiltinCatalogForMae 派生,仅留 14 个 API-key 型第三方模板,删全部账号型 provider 与智谱系/opencode-go 端点;上游目录变更后须重跑生成脚本(provider-node 测试强制校验) |
| 2026-10-22 | `packages/shared/src/mae/`(新增目录:externalSilence + providerCatalogFilter + index + adopt 工件)+ `packages/shared/package.json`(改,exports 加 `./mae` 一行;JSON 无法注释,以此登记为准) | 定制模块 | mae 外联静默唯一所有者(#7/D8/D9/D14):`isMaeExternalSilenceEnabled` 默认开、`ZCODE_ALLOW_OFFICIAL_IDENTITY=1` 显式恢复官方;`stripMaeExternalTelemetryEnv` 剥离遥测键;目录裁剪过滤函数同置于此 |
| 2026-10-22 | `architecture-policy.yaml`(改,+7 行,`# mae:`) | 治理登记 | `architecture:adopt mae-external-silence` 登记新 managed 模块(packages/shared/src/mae,domain 层) |
| 2026-10-22 | `packages/desktop/src/main/desktopProviderConfig.ts`(改,~8 行,`// mae:`) | 薄挂接 | 内置目录解析默认指向 mae-builtin(.test).json;显式 env 覆盖与官方身份授权时保持原行为 |
| 2026-10-22 | `packages/desktop/electron-builder.config.js`(改,+6 行,`// mae:`) | 薄挂接 | extraResources 增加随包发布的 mae 目录文件 |
| 2026-10-22 | `packages/services/src/model-provider/providerConfigRuntime.ts`(改,~7 行,`// mae:`) | 薄挂接 | 静默时丢弃 zcodeBuiltinRemote/zcodeBuiltinEnvironment 装配——切断官方提供商目录 CDN 后台刷新与 60s 周期检查 |
| 2026-10-22 | `scripts/build-time-config.mjs`(改,~9 行,`// mae:`) | 薄挂接 | 构建期 ARMS RUM/事件上报端点解析为空(空端点=SDK 关闭,框架保留) |
| 2026-10-22 | `packages/desktop/tsup.config.ts`(改,+3 行,`// mae:`) | 薄挂接 | `resolveBuildPackagedAgentTelemetryEnv` 静默时返回 `{}`——打包 Agent OTLP 端点不注入;bundle.mjs 的 OTLP 模块闭包机械校验清单不动 |
| 2026-10-22 | `packages/desktop/src/main/desktopRuntimeEnv.ts`(改,~5 行,`// mae:`) | 薄挂接 | `buildHostProcessEnv` 静默时 OTLP 定向注入置空——dev 本机 shell 遗留的 OTEL 端点不进 host/Agent |
| 2026-10-22 | `packages/desktop/src/main/index.ts`(改,~20 行三处,`// mae:`) | 薄挂接 | /api/v1/client/configs 业务配置后台请求默认切断;主进程 TTFT 与渲染动作追踪 OTLP 导出器静默时无端点 |
| 2026-10-22 | `packages/ui/src/mae/featureGates.ts` + `packages/desktop/src/main/mae/featureGates.ts`(新增,含单测 ×2) | 定制代码 | **P1 feature gates(#6)**:十类云端功能禁用清单唯一所有者(D7);渲染侧与 main 侧清单由互锁单测同步;各入口点一行引用 |
| 2026-10-22 | `architecture-policy.yaml`(改,exceptions 追加 `mae-feature-gates-unmanaged-files`) | 门禁登记 | mae gate 新增目录与上游 introduced 文件 `MarketingTouchProvider.tsx` 薄改的 `unmanaged-new-file` 例外 |
| 2026-10-22 | `packages/ui/src/Root.tsx`(3 处薄改) | gate 挂接 | `allowRemoteWorkspace` 默认值随 gate;`onLogin` 两处随 gate(#6) |
| 2026-10-22 | `packages/ui/src/WelcomeScreen.tsx`(1 处) | gate 挂接 | `resolveVisibleLoginProviders` gate 早退:OAuth 按钮清空,登录入口仅剩 API Key(#6) |
| 2026-10-22 | `packages/ui/src/WorkspaceSidebarFooter.tsx`(2 处) | gate 挂接 | 头像菜单「用量/升级」与「奖励中心」随 gate 隐藏(#6) |
| 2026-10-22 | `packages/ui/src/rewards/RewardsProvider.tsx` + `components/marketing-touch/MarketingTouchProvider.tsx`(各 1 处早退) | gate 挂接 | rewards Provider 只透传 children;marketing runtime 置空(轮询/弹窗/banner 全停)(#6) |
| 2026-10-22 | `packages/ui/src/WebRemoteControlFeatureProvider.tsx`(1 处) | gate 挂接 | 手机远控 feature context 默认值随 gate,触发按钮/状态全链隐藏(#6) |
| 2026-10-22 | `packages/ui/src/web-remote-control/WebRemoteControlDialog.tsx`(1 处) | gate 挂接 | 远控弹层「管理 Bots」按钮随 bots gate 隐藏(BotsDialog 唯一挂载点)(#6) |
| 2026-10-22 | `packages/ui/src/WorkspaceHeaderSections/WorkspaceHeaderActionSection.tsx`(1 处)+ `root/useRootPlatformEffects.ts`(1 处) | gate 挂接 | 会话分享:头部发布菜单项条件追加 gate;renderer 侧 share import 深链接监听不注册(#6) |
| 2026-10-22 | `packages/ui/src/lib/settingsNavigation.ts`(1 处) | gate 挂接 | `isSettingsSectionEnabled` 对 `usage`/`remoteDevices` 分区 gate 隐藏(#6) |
| 2026-10-22 | `packages/ui/src/settings/CodingPlanUpgradeDialogProvider.tsx`(1 处) | gate 挂接 | `openCodingPlanUpgrade` gate 早退:套餐升级弹窗全入口统一失效(#6) |
| 2026-10-22 | `packages/ui/src/WorkspaceHelpMenuButton.tsx`(2 处)+ `WindowsCaptionMenuButton.tsx`(1 处)+ `quickpick/quickPickCommands.ts`(1 处)+ `ChatErrorBanner.tsx`(1 处) | gate 挂接 | 反馈表单:帮助菜单/Windows 标题栏/命令面板 feedback 命令/错误横幅反馈按钮随 gate 隐藏(#6) |
| 2026-10-22 | `packages/ui/src/settings/AutomationsSection.tsx`(1 处) | gate 挂接 | `offPeakVisible` 追加 gate:闲时任务入口隐藏,定时任务不受影响(#6) |
| 2026-10-22 | `packages/ui/src/hooks/useRemoteConnectionEntryVisibility.ts`(1 处) | gate 挂接 | 远程连接入口可见性随 gate:入口与远程 workspace 恢复全链隐藏(#6) |
| 2026-10-22 | `packages/ui/src/v4/SessionPane.tsx`(1 处) | gate 挂接 | 左下角加速分享卡发布调用随 gate 跳过(#6) |
| 2026-10-22 | `packages/desktop/src/main/desktopOAuthDeepLink.ts`(1 处)+ `desktopApplicationMenu.ts`(1 处) | gate 挂接 | main 侧 share import 深链接随 gate 忽略;原生菜单「问题上报」不注册(#6) |
| 2026-10-22 | 单测调整 ×9 文件(loginDialogProviders/quickPickCommands/settingsNavigation/settingsPageConfig/rewardsProvider/rewardsMenuIcon/codingPlanUpgradeDialogProvider/chatErrorBannerFeedbackDraft/workspaceWebRemoteControlTrigger) | 测试 | 被裁剪功能牵连的既有单测改到 mae 语义;纯组件逻辑类以 `vi.mock` 显式放开 gate 保持上游行为验证(#6) |
| 2026-10-22 | `packages/desktop/scripts/mae-identity.mjs` + `mae-identity.d.mts`(新增) | 身份模块 | mae 身份常量(D10)/默认翻转+授权守卫(D14)/运行名链/开发态 AUMID 唯一出口,构建期与运行期共用 |
| 2026-10-22 | `packages/desktop/scripts/desktop-product-identity.mjs`(改,4 处薄挂接) | 挂接 | flavor 路由委托 mae 模块:未授权默认 mae、显式官方请求未授权抛错、授权后沿用官方语义(#8) |
| 2026-10-22 | `packages/desktop/scripts/desktop-product-identity.d.mts`(改) | 挂接 | `DesktopProductFlavor` 联合类型、cuaHelperInstallVariant、identities 表加入 "mae"(#8) |
| 2026-10-22 | `packages/desktop/src/main/desktopRuntimeEnv.ts`(改,3 处) | 挂接 | isMaePackagedRuntime / runtimeApplicationName 委托 mae 模块 / helper 变体 mae 分支;运行名链 ZCode Mae / ZCode Mae Dev(#8) |
| 2026-10-22 | `packages/shared/src/env.ts`(改,2 处) | 挂接 | ZCodeProductFlavor 类型 + normalize 接受 "mae"(#8) |
| 2026-10-22 | `packages/desktop/test/desktopProductIdentity.test.ts` / `viteRendererConfig.test.ts` / `tsupChunkIsolation.test.ts`(改,每处 1-3 行) | 测试适配 | 官方语义测试统一带 `ZCODE_ALLOW_OFFICIAL_IDENTITY=1`;默认期望翻转为 mae(#8) |
| 2026-10-22 | `packages/desktop/test/mae-identity.test.ts` + `mae-runtime-identity.test.ts`(新增) | 测试 | 防丢网:默认身份=mae、未授权抛错、运行名链/helper 变体;挂接被 rebase 冲掉即红(#8) |
| 2026-10-22 | `docs/mae/sync-runbook.md` + `docs/mae/customization-registry.md`(新增)+ 根 `MAE.md`(删除) | 文档重构 | MAE.md 按职能拆分:运维手册与定制台账分置,规则单一事实源回归 AGENTS.md 铁律,归位 docs/mae/ 自家约定;顺带清除 #15/#16 合并解冲突残留的 3 行 jj 多侧分隔垃圾行 |
| 2026-10-22 | `AGENTS.md`(改,铁律①③指针)+ `specs/mae/README.md`(D6)+ `specs/mae/identity-isolation.md` + `docs/mae/agents/issue-tracker.md`(指针同步) | 引用更新 | 原 MAE.md 引用点全部改指新文件 |
| 2026-10-22 | `packages/desktop/scripts/mae-identity.mjs` + `mae-identity.d.mts`(改,新增数据根节) | 身份模块 | mae 数据根常量与启动决策(#9):`MAE_DATA_BASE_DIR_NAME`/`resolveMaeDataBaseDir`/`resolveMaeDataRootBootstrap`——mae 身份默认 `~/.zcode-mae`,显式 `ZCODE_DATA_BASE_DIR` 为保留覆盖轴(e2e/CLI 调试),官方身份返回 null |
| 2026-10-22 | `packages/desktop/src/main/desktopDataBaseDirBootstrap.ts`(改,~14 行,`// mae:`) | 薄挂接 | 启动早期 `setDataBaseDir(~/.zcode-mae)`(优先级高于 env)+ bootstrap setting.json 同根解析 + 注入 `ZCODE_DESKTOP_HOME_DIR` 让 settingService/host 侧 setting.json 落 mae 根(#9;挂接点从 spec 原定的 index.ts 移至本文件——index.ts 顶部副作用 import 链使此处才是真正"启动早期") |
| 2026-10-22 | `packages/desktop/src/main/desktopRuntimeEnv.ts`(改,~5 行,`// mae:`) | 薄挂接 | 开发态 computer-use helper 兜底路径 mae 化:mae 运行时兜底 `getZCodeDataRootDir()`(~/.zcode-mae/.zcode),显式 ZCODE_HOME 仍优先,官方身份保持 `~/.zcode`(#9) |
| 2026-10-22 | `packages/desktop/test/mae-data-root.test.ts`(新增) | 测试 | 防丢网(#9):数据根解析纯函数 / 启动挂接(含官方身份与显式 env 覆盖回归)/ Host 透传 ZCODE_DATA_BASE_DIR+ZCODE_DESKTOP_HOME_DIR / helper 兜底 mae 化(darwin 分支以平台 mock 真跑);挂接被 rebase 冲掉即红 |
| 2026-10-22 | 根 `package.json`(改,version 与 release 脚本各 1 行;JSON 无法注释,以此登记为准) | CalVer | 版本改 `2026.1022.0`(#11);`release` 脚本指向 `scripts/mae/release-calver.mjs`,杜绝语义化 bump 回退 |
| 2026-10-22 | `scripts/mae/`(新增:calver.mjs + calver.test.mjs + release-calver.mjs) | 定制模块 | CalVer 版本语义唯一所有者(#11):解析/时间序比较(为 P3 更新通道预留)/同日 PATCH 递增/发布版本决策;release 包装只做参数解析与 release-it 进程转发 |
| 2026-10-22 | `vitest.config.ts`(改,+2 行,`// mae:`) | 测试挂接 | include 追加 `scripts/mae/**/*.test.mjs`——mae 根脚本单测纳入 vitest 管线(#11) |
| 2026-10-22 | `packages/desktop/scripts/mae-upstream-base.mjs` + `mae-upstream-base.d.mts`(新增) | 定制模块 | 上游基线解析唯一所有者(#11):env 覆盖(`ZCODE_UPSTREAM_BASE[_COMMIT]`)→ `merge-base HEAD refs/remotes/upstream/main` → `origin/main` 镜像 → unknown 回落;jj workspace 无 .git 时走 env 或 unknown |
| 2026-10-22 | `packages/desktop/scripts/build-metadata.mjs`(改,~7 行,`// mae:`) | 薄挂接 | collectBuildMetadata 展开 upstreamBase/upstreamBaseCommit/upstreamBaseSource 进 build-meta.json;CLI 输出附基线一行 |
| 2026-10-22 | `packages/desktop/src/main/mae/aboutUpstreamBase.ts`(新增;归 existing 例外 `mae-feature-gates-unmanaged-files` 的目录路径覆盖)+ `src/main/about.ts`(改,~13 行多处 1-2 行,`// mae:`)+ `src/main/aboutWindow.ts`(改,+3 行,`// mae:`) | 挂接 | 关于页双信息「ZCode Mae <version> · 基于 ZCode <upstreamBase>」(#11):文案/留空策略在 mae 模块,about 快照/弹窗/日志导出薄挂接;基线 unknown 不渲染 |
| 2026-10-22 | `packages/desktop/test/about.test.ts`(改,追加 3 用例)+ `test/mae-upstream-base.test.ts` + `test/mae-build-metadata.test.ts`(新增) | 测试 | #11 防丢网:版本比较时间序、基线解析优先级链、build-meta 含 upstreamBase、关于页双信息渲染与 unknown 留空 |
| 2026-10-22 | `packages/shared/src/mae/deeplinkScheme.mjs` + `deeplinkScheme.d.mts`(新增)+ `index.ts`(+2 行再导出,`// mae:`) | 定制代码 | mae 深链接 scheme `zcode-mae` 唯一定义(#10):.mjs 使 TS 消费方(经 `@zcode/shared/mae` 公共入口)与 Node 构建脚本(electron-builder.config.js 直接 import)共用同一份常量;防丢网单测 ×2(`packages/shared/test/maeDeeplinkScheme.test.ts`、`packages/desktop/test/maeDeepLinkScheme.test.ts`) |
| 2026-10-22 | `packages/desktop/electron-builder.config.js`(改,protocols 段 + import,+5 行,`// mae:`) | 薄挂接 | 安装协议注册随身份(#10):mae → `zcode-mae`(macOS Info.plist/Windows NSIS 注册表/Linux desktop entry MimeType),显式授权官方身份保留上游 `zcode` 供对照 |
| 2026-10-22 | `packages/desktop/src/main/desktopDeepLinkUrl.ts`(改,~4 行,`// mae:`) | 薄挂接 | 深链接协议校验与 argv 提取正则收敛到 mae scheme——官方 `zcode://` 不再被 mae 解析(#10) |
| 2026-10-22 | `packages/desktop/src/main/desktopLinuxDeepLinkRegistration.ts`(改,常量 2 行 + 注释/日志措辞,`// mae:`) | 薄挂接 | Linux 注册走 `zcode-mae.desktop` + `x-scheme-handler/zcode-mae`:desktop 文件名随 scheme 隔离,避免与官方 zcode.desktop 互相遮蔽/误抑制(#10) |
| 2026-10-22 | `packages/desktop/src/main/desktopFinderOpenFolderWorkflow.ts`(改,+3 行,`// mae:`) | 薄挂接 | macOS Finder「打开文件夹」服务 shell 链接改 `zcode-mae://workspace/open`(隐蔽消费方,漏改静默失效)(#10) |
| 2026-10-22 | `packages/desktop/src/main/desktopOAuthDeepLink.ts`(改,+3 行,`// mae:`) | 薄挂接 | 运行期 `setAsDefaultProtocolClient` 注册 `zcode-mae`——枚举外的第 7 处散落字面量,不换会在 Windows 上劫持官方协议归属(#10) |
| 2026-10-22 | `packages/shared/src/platform.ts`(改,doc 注释 2 行,`// mae:`) | 注释 | `onShareImport` 契约注释指向 `zcode-mae://share/import`(#10) |
| 2026-10-22 | `packages/web/src/share/conversationSharePreviewClient.ts`(改,+3 行,`// mae:`) | 薄挂接 | web 分享落地页「导入到客户端」链接生成 `zcode-mae://share/import?code=...`(#10) |
| 2026-10-22 | 单测适配 ×10 文件(desktopDeepLinkUrl/desktopOAuthDeepLink/desktopLinuxDeepLinkRegistration/desktopDeepLinkRegistration/desktopSecondInstanceDeepLink/startupWorkspaceDeepLinkGate/oauth-callback-bridge/web conversationSharePreviewClient/web conversationShareLandingPage/ui rootOAuthCallbackCancellation) | 测试适配 | 深链接 URL/scheme 期望统一切到 `zcode-mae`(行为变更的机械跟随,#10) |
| 2026-10-22 | `specs/mae/identity-isolation.md`(改,#10 落地记录) | 文档 | scheme 常量落点定为 shared/src/mae(原候选 mae-identity.mjs 因 web/shared 无法跨包导入而排除);OAuth provider redirect URI 属 gate 外遗留 |
| 2026-10-22 | `packages/shared/src/mae/userHome.ts`(新增)+ `index.ts`(+2 行再导出,`// mae:`) | 定制代码 | hooks/MCP 用户级 home 统一 resolver(#25):`resolveMaeAwareUserHomeDir` = `ZCODE_DESKTOP_HOME_DIR → HOME → USERPROFILE`(空白跳过,全缺失返回 undefined 由调用方 `os.homedir()` 兜底——domain 层禁 node:*),与 settingService 既有链同源——mae 身份(bootstrap 注入数据根)下用户级配置基目录落 `~/.zcode-mae` 数据树,官方身份(未注入覆盖)上游行为原样 |
| 2026-10-22 | `packages/services/src/hooks/hooksService.ts`(改,~5 行,`// mae:`) | 薄挂接 | 私有 `resolveUserHomeDir` 委托统一 resolver(#25):mae 下用户级 hooks 配置(`.zcode/cli/config.json`)与 trust store(`.zcode/security`)落 mae 数据根;顺带治好 hooks 与数据轴对 `~/.zcode/cli` 的双解析错位;官方身份不变 |
| 2026-10-22 | `packages/services/src/mcp-sync/mcpSyncService.ts`(改,~5 行,`// mae:`) | 薄挂接 | 私有 `resolveUserHomeDir` 委托统一 resolver(#25):mae 下用户级 MCP(zcode 源 `.zcode/cli/config.json` 与 agents 源 `.agents/mcp.json`)落 mae 数据根,两源同根;官方身份不变。commandsService/memoryService 有意共享,豁免不动(#23 豁免清单) |
| 2026-10-22 | `packages/services/test/maeUserConfigHome.test.ts`(新增)+ `packages/shared/test/maeUserHome.test.ts`(新增) | 测试 | 防丢网(#25):resolver 纯函数契约(覆盖优先/空白跳过/回落链/兜底/公共入口再导出)+ 两服务用户级路径经公共接口断言(mae 根读写下官方 home 对应文件零变化、`.agents` 源同根、官方身份保持真实 HOME);挂接被 rebase 冲掉即红 |
 | 2026-10-22 | `packages/desktop/src/main/desktopRuntimeEnv.ts`(改,+3 行,`// mae:`) | 薄挂接 | `buildHostProcessEnv` 为 mae 身份注入 `ZCODE_STORAGE_DIR=mae 数据根`——Agent 侧 exec 输出/剪贴板/SEA 运行时工具/插件与技能存储已读该变量,随轴落 mae 树;官方身份不注入(#24) |
 | 2026-10-22 | `apps/zcode-cli/packages/adapters/src/workflow/index.ts`(改,1 行→6 行,`// mae:`) | 薄挂接 | 动态工作流 `DEFAULT_WORKFLOW_ROOT` 挂 `ZCODE_STORAGE_DIR` 优先:mae 桌面注入时默认根随 CLI 存储轴落 `~/.zcode-mae/.zcode/cli/workflows`;未注入保持官方 `~/.zcode/cli/workflows`(#24) |
 | 2026-10-22 | `packages/desktop/src/main/exportLogs.ts`(改,+12 行含 import,`// mae:`) | 薄挂接 | 诊断导出的 cli 目录与 computer-use run 目录经 `getZCodeHomeRootDir()` 随 mae 数据根收集(两处目录共享一个 3 行 helper)——导出包只含 mae 自己的数据,不打包官方副本;官方身份保持 `~/.zcode`(#24) |
 | 2026-10-22 | `packages/desktop/src/main/index.ts`(改,+3 行两处,`// mae:`) | 薄挂接 | 启动设置读取 `settingsFile` 改走 `resolveBootstrapSettingsFile()`(重定向 home):mae 身份解析 `~/.zcode-mae/.zcode/v2/setting.json`,窗口状态不读官方副本;官方身份等价 homedir()(#24) |
 | 2026-10-22 | `packages/desktop/test/mae-runtime-reloc.test.ts`(新增,6 例)+ `apps/zcode-cli/packages/adapters/tests/workflow-root-mae-reloc.test.ts`(新增,3 例) | 测试 | #24 防丢网:ZCODE_STORAGE_DIR 注入(mae/官方/继承覆盖)、exportLogs 收集路径(mae 根收集+官方树零打包+官方身份上游语义)、settingsFile 挂接源断言、workflow 默认根(注入/空白/未注入);挂接被 rebase 冲掉即红。注:adapters 测试不在根 vitest include 内,定向跑 `pnpm --dir apps/zcode-cli/packages/adapters vitest run tests/workflow-root-mae-reloc.test.ts` |
 | 2026-10-22 | `packages/desktop/test/mae-runtime-identity.test.ts`(改,mock +2 行) | 测试适配 | `@zcode/services/node` 的枚举式 mock 补 `getZCodeDataRootDir`——#24 的 buildHostProcessEnv 存储根注入读取该导出,不补则本文件误红(#24) |
-| 2026-10-22 | `packages/shared/src/mae/userHome.ts`(新增)+ `index.ts`(+2 行再导出,`// mae:`) | 定制代码 | hooks/MCP 用户级 home 统一 resolver(#25):`resolveMaeAwareUserHomeDir` = `ZCODE_DESKTOP_HOME_DIR → HOME → USERPROFILE`(空白跳过,全缺失返回 undefined 由调用方 `os.homedir()` 兜底——domain 层禁 node:*),与 settingService 既有链同源——mae 身份(bootstrap 注入数据根)下用户级配置基目录落 `~/.zcode-mae` 数据树,官方身份(未注入覆盖)上游行为原样 |
-| 2026-10-22 | `packages/services/src/hooks/hooksService.ts`(改,~5 行,`// mae:`) | 薄挂接 | 私有 `resolveUserHomeDir` 委托统一 resolver(#25):mae 下用户级 hooks 配置(`.zcode/cli/config.json`)与 trust store(`.zcode/security`)落 mae 数据根;顺带治好 hooks 与数据轴对 `~/.zcode/cli` 的双解析错位;官方身份不变 |
-| 2026-10-22 | `packages/services/src/mcp-sync/mcpSyncService.ts`(改,~5 行,`// mae:`) | 薄挂接 | 私有 `resolveUserHomeDir` 委托统一 resolver(#25):mae 下用户级 MCP(zcode 源 `.zcode/cli/config.json` 与 agents 源 `.agents/mcp.json`)落 mae 数据根,两源同根;官方身份不变。commandsService/memoryService 有意共享,豁免不动(#23 豁免清单) |
-| 2026-10-22 | `packages/services/test/maeUserConfigHome.test.ts`(新增)+ `packages/shared/test/maeUserHome.test.ts`(新增) | 测试 | 防丢网(#25):resolver 纯函数契约(覆盖优先/空白跳过/回落链/兜底/公共入口再导出)+ 两服务用户级路径经公共接口断言(mae 根读写下官方 home 对应文件零变化、`.agents` 源同根、官方身份保持真实 HOME);挂接被 rebase 冲掉即红 |
| 2026-10-22 | `packages/shared/src/mae/userHome.ts`(新增)+ `index.ts`(+2 行再导出,`// mae:`) | 定制代码 | hooks/MCP 用户级 home 统一 resolver(#25):`resolveMaeAwareUserHomeDir` = `ZCODE_DESKTOP_HOME_DIR → HOME → USERPROFILE`(空白跳过,全缺失返回 undefined 由调用方 `os.homedir()` 兜底——domain 层禁 node:*),与 settingService 既有链同源——mae 身份(bootstrap 注入数据根)下用户级配置基目录落 `~/.zcode-mae` 数据树,官方身份(未注入覆盖)上游行为原样 |
| 2026-10-22 | `packages/services/src/hooks/hooksService.ts`(改,~5 行,`// mae:`) | 薄挂接 | 私有 `resolveUserHomeDir` 委托统一 resolver(#25):mae 下用户级 hooks 配置(`.zcode/cli/config.json`)与 trust store(`.zcode/security`)落 mae 数据根;顺带治好 hooks 与数据轴对 `~/.zcode/cli` 的双解析错位;官方身份不变 |
| 2026-10-22 | `packages/services/src/mcp-sync/mcpSyncService.ts`(改,~5 行,`// mae:`) | 薄挂接 | 私有 `resolveUserHomeDir` 委托统一 resolver(#25):mae 下用户级 MCP(zcode 源 `.zcode/cli/config.json` 与 agents 源 `.agents/mcp.json`)落 mae 数据根,两源同根;官方身份不变。commandsService/memoryService 有意共享,豁免不动(#23 豁免清单) |
| 2026-10-22 | `packages/services/test/maeUserConfigHome.test.ts`(新增)+ `packages/shared/test/maeUserHome.test.ts`(新增) | 测试 | 防丢网(#25):resolver 纯函数契约(覆盖优先/空白跳过/回落链/兜底/公共入口再导出)+ 两服务用户级路径经公共接口断言(mae 根读写下官方 home 对应文件零变化、`.agents` 源同根、官方身份保持真实 HOME);挂接被 rebase 冲掉即红 |
| 2026-10-22 | `packages/desktop/src/main/desktopRuntimeEnv.ts`(改,+3 行,`// mae:`) | 薄挂接 | `buildHostProcessEnv` 为 mae 身份注入 `ZCODE_STORAGE_DIR=mae 数据根`——Agent 侧 exec 输出/剪贴板/SEA 运行时工具/插件与技能存储已读该变量,随轴落 mae 树;官方身份不注入(#24) |
| 2026-10-22 | `apps/zcode-cli/packages/adapters/src/workflow/index.ts`(改,1 行→6 行,`// mae:`) | 薄挂接 | 动态工作流 `DEFAULT_WORKFLOW_ROOT` 挂 `ZCODE_STORAGE_DIR` 优先:mae 桌面注入时默认根随 CLI 存储轴落 `~/.zcode-mae/.zcode/cli/workflows`;未注入保持官方 `~/.zcode/cli/workflows`(#24) |
| 2026-10-22 | `packages/desktop/src/main/exportLogs.ts`(改,+12 行含 import,`// mae:`) | 薄挂接 | 诊断导出的 cli 目录与 computer-use run 目录经 `getZCodeHomeRootDir()` 随 mae 数据根收集(两处目录共享一个 3 行 helper)——导出包只含 mae 自己的数据,不打包官方副本;官方身份保持 `~/.zcode`(#24) |
| 2026-10-22 | `packages/desktop/src/main/index.ts`(改,+3 行两处,`// mae:`) | 薄挂接 | 启动设置读取 `settingsFile` 改走 `resolveBootstrapSettingsFile()`(重定向 home):mae 身份解析 `~/.zcode-mae/.zcode/v2/setting.json`,窗口状态不读官方副本;官方身份等价 homedir()(#24) |
| 2026-10-22 | `packages/desktop/test/mae-runtime-reloc.test.ts`(新增,6 例)+ `apps/zcode-cli/packages/adapters/tests/workflow-root-mae-reloc.test.ts`(新增,3 例) | 测试 | #24 防丢网:ZCODE_STORAGE_DIR 注入(mae/官方/继承覆盖)、exportLogs 收集路径(mae 根收集+官方树零打包+官方身份上游语义)、settingsFile 挂接源断言、workflow 默认根(注入/空白/未注入);挂接被 rebase 冲掉即红。注:adapters 测试不在根 vitest include 内,定向跑 `pnpm --dir apps/zcode-cli/packages/adapters vitest run tests/workflow-root-mae-reloc.test.ts` |
| 2026-10-22 | `packages/desktop/test/mae-runtime-identity.test.ts`(改,mock +2 行) | 测试适配 | `@zcode/services/node` 的枚举式 mock 补 `getZCodeDataRootDir`——#24 的 buildHostProcessEnv 存储根注入读取该导出,不补则本文件误红(#24) |

| 2026-10-23 | `packages/desktop/src/main/desktopRuntimeEnv.ts`(改,追加 1 行注入)+ `mae-runtime-reloc.test.ts` | 薄挂接 | 会话 DB 隔离补遗(#24 核实结论):内嵌 agent 每次启动 open 的 SqliteSessionStore 不吃存储根变量,单独注入其 env 覆盖轴 `ZCODE_SESSION_DB_PATH` 落 `~/.zcode-mae/.zcode/cli/db/db.sqlite`,防与官方 sqlite 版本错位互踩;官方身份不注入 |
