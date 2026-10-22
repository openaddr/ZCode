# P1 — 功能裁剪规格(纯本地模式)

## 产品规则

- 以下功能禁用且**入口隐藏**(不置灰、不留死入口):账号登录、套餐页/升级、会话分享(发布+导入)、闲时任务、反馈表单、营销 banner/奖励中心、手机远控、Bots、SSH/WSL/Docker 远程工作区。
- 已核实:desktop 无全局登录强 gate,"请先登录"均为逐功能提示;禁用仅做入口屏蔽,不改认证架构。
- provider 目录:使用新增 `config/provider/mae-builtin.json`,仅含 API-key 型第三方(Kimi/MiniMax/DeepSeek/阿里/小米/OpenAI/Anthropic/xAI/OpenRouter 等)与自定义 OpenAI 兼容模板;移除全部 zhipu-account / coding-plan 账号型 provider。目录随包内置,切断官方提供商目录的后台刷新与下载。
- 遥测:OTLP/ARMS 端点在 mae 构建注入为空,遥测框架保留(不触碰 bundle.mjs 的 OTLP 模块闭包机械校验清单)。
- 插件市场保留官方只读(浏览/安装/更新);本地创建插件不受影响。
- 深链接入口(OAuth/支付/workspace/share)在本 patch 中无 UI 入口;`zcode-mae://` 的自有入口为后续项。

## 状态所有者

- 新增 gate 模块(如 `packages/ui/src/mae/featureGates.ts` 及 main 侧对应物)是禁用清单的**唯一所有者**;各入口点一行引用 gate,禁止在各组件内散布判断。
- `config/provider/mae-builtin.json` 及其构建注入参数由 mae 构建脚本唯一管理。

## 接口

- gate 以特性 key 查询(如 `isFeatureDisabled("session-share")`),key 清单集中定义于 gate 模块。
- provider 注入经 `ZCODE_BUILTIN_PROVIDER_CONFIG_FILE` 指向打包内 mae 目录文件。

## 验收场景

1. 主界面/设置/侧栏/托盘菜单无上述入口残留(渲染路径 grep + 人工过检)。
2. 启动后网络审计:无对官方提供商目录、业务配置、CDN 的后台请求。
3. 配置任一第三方 API Key provider 后可正常建会话、执行任务、恢复会话。
4. 既有 e2e/单测中引用被裁剪 provider 与功能的部分在本 patch 内调整或标注跳过(独立于 P0 交付)。
