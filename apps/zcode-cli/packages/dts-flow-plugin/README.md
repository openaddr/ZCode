# @mae/dts-flow-plugin

mae 定制(#96):把 DTS 问题单本地闭环服务(`packages/mae-dts-flow`)包装成宿主原生官方插件,替代"发起时往单号工作区手写项目级 .zcode/config.json"的脆弱挂载链(#92)。

## 包内容

- `.zcode-plugin/plugin.json`:官方插件 manifest——`mcpServers["dts-flow"]` stdio 入口 + `skills` 目录;
- `src/mcp/server.ts`:MCP server 入口,以 `export main()` 形状供宿主 `__zcode-plugin-host` 动态 import(spike #95 实测的硬形状);薄适配层,全部装配复用 `@mae/dts-flow` 公开出口(serve.ts 的 stdio 面等价物),服务本体零改动;
- `skills/dts-issue-flow/SKILL.md`:泛化版流程技能(由 `issueFlow.buildSkillMarkdown` 模板去单号/工号/分支烤死而来,单据上下文改由开场词+工具获取);
- `scripts/build-mcp.mjs`:esbuild 把 `@mae/dts-flow` 源码打进单文件 ESM `dist/mcp/server.js`。

## 构建与测试

```bash
pnpm --filter @mae/dts-flow-plugin build   # tsc --noEmit + esbuild 产出 dist/mcp/server.js
pnpm --filter @mae/dts-flow-plugin test    # 出仓契约(manifest/构建产物/技能)
```

## 随包与注册

- 注册条目:`apps/zcode-cli/packages/bootstrap/src/app/official-plugin-definitions.ts`(mae 薄改);
- 打包 stage:`packages/desktop/scripts/prepare-agent-node-bundle.mjs` 的 `officialPluginPackages`(mae 薄改)——构建并 stage 到 `bundled-agents/<platform>/glm/packages/dts-flow-plugin`,随 extraResources 进安装包 `resources/glm/packages/dts-flow-plugin`,首启 `seedBundledOfficialPlugins` 自动装(与 android-emulator 完全同构);
- 商店 listing 暂未声明(与 node-repl-host 同形),避免上游 `pluginCount` 断言漂移;随 #97 分发票一并处理。

## 真机自检(spike 同款)

```bash
ELECTRON_RUN_AS_NODE=1 ZCODE_PLUGIN_ID=dts-flow@zcode-plugins-official \
  "C:\App\ZCode\ZCode.exe" "C:\App\ZCode\resources\glm\zcode.cjs" \
  __zcode-plugin-host "<本包>/dist/mcp/server.js"
```

对 stdin 发 initialize / tools/list:应回 5 个工具(server_info + 四件套)。
