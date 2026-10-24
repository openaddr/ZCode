# zcode-mae 独立版改造

一句话:在 mae 分支上把 ZCode 桌面版定制为完全独立的应用 **zcode-mae**——独立身份、独立数据、纯本地运行,与官方 ZCode 同机共存、零数据交集。

## 决策总表(2026-10-21 对齐记录)

| # | 决策 |
| --- | --- |
| D1 | 构建工具链用 mise 隔离(node 24.14.0 / pnpm 10.33.2,已落地) |
| D2 | 不对接官方账号体系;账号系统后置,后续自建 |
| D3 | 用户级数据/运行态/配置存储完全隔离(`~/.zcode-mae`);**终稿**(有意共享清单、目录级全景、已取消项、漏网登记)见 [identity-isolation.md](identity-isolation.md)「D3 定稿」,由 `audit:mae-user-paths` 门禁看守(#26) |
| D4 | 深链接协议换 `zcode-mae://`;官方 `zcode://` 链接对 mae 无效为预期行为 |
| D5 | 更新通道暂不做;后续自建 generic feed;appId 发版后不变 |
| D6 | 定制隔离纪律:新增文件优先(细则见 docs/mae/sync-runbook.md 附录);**AGENTS.md 为我方自有文件**(薄宪法层),上游规则快照在 `upstream-AGENTS.md`,同步时整体替换、冲突以 AGENTS.md 与 specs/mae/ 为准 |
| D7 | 纯本地模式:登录/套餐/分享/闲时/反馈/营销/奖励/手机远控/Bots/SSH·WSL·Docker 全部禁用且入口隐藏 |
| D8 | provider 目录裁剪:仅保留 API-key 型第三方与自定义配置;目录本地化,切断官方后台刷新 |
| D9 | 遥测:框架保留,端点置空(数据不出本机) |
| D10 | 命名定稿:productName `ZCode Mae`、appId `dev.zcode-mae.app`、可执行名 `zcode-mae`、协议 `zcode-mae://`、业务数据根 `~/.zcode-mae`(其下 `.zcode/`)、Electron 数据 `%APPDATA%\ZCode Mae`、开发态应用名 `ZCode Mae Dev`、cuaHelperInstallVariant `mae` |
| D11 | 仅出 Windows 桌面安装包,不单独发行 CLI/TUI/Web |
| D12 | 插件市场保留官方只读(浏览/安装/更新);本地创建插件不受影响 |
| D13 | 版本采用 CalVer `YYYY.MMDD.PATCH`(如 2026.1021.0);上游基线进 build-meta 并在关于页展示 |
| D14 | **默认身份翻转**:任何构建路径、任何环境默认产出 mae 身份;官方身份仅在显式 `ZCODE_ALLOW_OFFICIAL_IDENTITY=1` 时可产出,未授权时构建期抛错(守卫内建于身份解析);另以新增文件中的默认身份单测防 rebase 丢挂接。不再需要独立的构建脚本产物断言 |

## Patch 划分

| Patch | 范围 | 规格 |
| --- | --- | --- |
| P0 | 产品身份与数据隔离(双轴联动,必须一个 patch 完成) | [identity-isolation.md](identity-isolation.md) |
| P1 | 功能裁剪(feature gates + provider 目录 + 遥测置空;独立 patch,测试梳理量大) | [feature-gates.md](feature-gates.md) |
| P2 | 版本与品牌 | [versioning-branding.md](versioning-branding.md) |
| P3 | 后续项(远程工作区资源自建、自有账号、自建更新 feed、自建插件市场源) | 各规格末尾「后续项」 |

## 全局验收

- 官方版与 zcode-mae 同机双装双开:互不激活对方窗口(单实例锁隔离);`%APPDATA%\ZCode Mae` 与 `%APPDATA%\ZCode` 互不相交;`~/.zcode-mae/.zcode` 与 `~/.zcode` 除 D3 有意共享清单(日志/轨迹/命令/记忆接口/跨工具导入/项目级/远程轴)外互不相交。
- 网络审计:运行期对官方域名的请求仅剩用户自配模型 API(若有)与插件市场 GitHub 源。
- **自动化部分已覆盖(#34)**:E2E `packages/desktop/test/e2e/mae-acceptance.test.ts`(定向运行方式见文件头注释)机械验证目录零交集(官方 `%APPDATA%\ZCode`、`~/.zcode` 快照 diff,D3 豁免表排除)、单实例自洽(第二实例退出+首实例存活+进程数不变)与启动期官方域名 denylist(zcode.z.ai/bigmodel.cn/z.ai/api.z.ai/cdn-zcode.z.ai)零命中,证据(目录快照对比+请求清单)落 `ZCODE_E2E_ARTIFACT_DIR`。系统级全进程抓包(绕过应用层代理的原生流量)仍为人工步骤(#4)。
- 全新克隆、不设任何环境变量、任一构建入口 → 产物默认 mae 身份。
- `pnpm typecheck`、`pnpm lint`、`pnpm verify:pre-push` 真实通过。
- 触碰上游文件的每处已按 docs/mae/sync-runbook.md 附录三强制登记(≤10 行、`// mae:` 标记)。
