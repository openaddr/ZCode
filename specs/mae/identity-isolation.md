# P0 — 产品身份与数据隔离规格

## 产品规则

- 默认产品身份为 mae,命名按决策 D10 执行。
- 官方(production/preview)身份仅在显式 `ZCODE_ALLOW_OFFICIAL_IDENTITY=1` 时可解析;未授权解析到非 mae 身份时构建期直接抛错。守卫内建于身份解析路径,覆盖全部构建入口(消除"忘带 env / 走了上游原生命令"这类无意产出官方包的失败类别)。
- 身份轴与 `ZCODE_ENV` 轴正交(沿用 preview 先例);mae 构建固定 `ZCODE_ENV=production`。
- 单实例锁、Electron userData/sessionData、安装器注册表、任务栏 AUMID 随身份自动隔离;业务数据根由 mae 启动路径显式 `setDataBaseDir(~/.zcode-mae)`(其数据落在 `~/.zcode-mae/.zcode`,优先级高于 env)。
- 安装身份(构建侧)与运行身份(运行侧)**必须同一 patch 内联动修改**——只改一侧会出现"安装目录分开但单实例锁/userData 仍与官方互斥"的半隔离(实锤现象:自构建版启动只激活官方版窗口)。
- deep link 全链路换 `zcode-mae://`,包括 macOS Finder 打开文件夹工作流(隐蔽消费方)与 web 分享页链接生成方。

## 状态所有者与接口

- 新增 `packages/desktop/scripts/mae-identity.mjs`(构建期)与 `packages/desktop/src/main/mae/`(运行期模块):身份常量、默认翻转逻辑、授权守卫、数据根、scheme 常量的唯一出口。
- 上游文件只做 ≤3 行挂接(委托 mae 模块),每处加 `// mae:` 标记并登记 MAE.md「五」。

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
| `packages/desktop/src/main/index.ts`(启动早期) | mae 身份时 `setDataBaseDir(~/.zcode-mae)` |

## 守卫与测试

- 新增单测文件(纯新增,rebase 不可冲掉):断言默认 flavor = mae;断言未设授权 env 时解析官方身份抛错。挂接被 rebase 冲掉时该测试变红,即"防丢网"。
- Windows 数据根沿用 paths.ts 现有防护(base 不得指向应用安装目录)。

## 验收场景

1. 全新克隆、不设任何 env,分别经 `pnpm bundle:desktop` 与 mae 专属构建入口构建 → 产物名/appId 均为 mae。
2. 官方版运行中启动 mae → 打开新窗口,互不激活;反向同样。
3. 双方各自产生数据(会话/登录态/窗口状态)后,检查 `~/.zcode-mae/.zcode`、`%APPDATA%\ZCode Mae` 与官方对应目录互不相交。
4. 人为移除任一挂接行(模拟 rebase 丢失)→ 默认身份单测失败。
