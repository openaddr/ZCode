# mae-external-silence

一页以内。只写类型与测试表达不了的三样：模块存在的意图、不变量、与其它模块的交集在哪个 hook 点处理。

意图：zcode-mae 独立版的「外联静默」唯一所有者（specs/mae/README.md D8/D9/D14，工单 #7）。
任何构建路径、任何环境默认静默——provider 目录本地化（仅 API-key 型第三方）、官方提供商
目录后台刷新切断、遥测（OTLP/ARMS/事件上报）端点置空；官方云端外联仅在显式
`ZCODE_ALLOW_OFFICIAL_IDENTITY=1` 时恢复，供上游对比验证。

不变量：

- 判定函数是纯函数：不读盘、不计时、无副作用；同一 env 输入永远同一结果。
- 静默不删除遥测框架：端点为空让上游 SDK 自然落入 Noop（bundle.mjs 的 OTLP 模块闭包
  机械校验清单不受影响）。
- 目录裁剪是「官方目录 + 显式 allowlist」的确定性投影：不改 revision/schemaVersion，
  不发明新模板；上游目录变更后必须重跑 scripts/mae/generate-mae-builtin-catalog.mjs
  （packages/provider-node/test/mae-builtin-catalog.test.ts 强制两侧一致）。

hook 点（各调用方薄挂接 ≤10 行，禁止散布判定）：

- `packages/desktop/src/main/desktopProviderConfig.ts`：目录文件名选择。
- `packages/desktop/src/main/desktopRuntimeEnv.ts` / `index.ts`：OTLP 定向注入置空、
  主进程导出器无端点、`/api/v1/client/configs` 业务配置后台请求切断。
- `packages/services/src/model-provider/providerConfigRuntime.ts`：丢弃官方目录远端装配。
- `packages/desktop/tsup.config.ts` / `scripts/build-time-config.mjs`：构建期端点置空。
