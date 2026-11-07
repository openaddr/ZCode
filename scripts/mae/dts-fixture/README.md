# dts-fixture:DTS 问题流外网验证靶场(GitHub 替身,#73)

把「外部 Git 平台 + 流水线」在外网以 GitHub 替身真实跑通 MR 验绿腿(唯一此前只到罐头的环节)。

**运行时适配已入产品(ADR-0002)**:GitHub(codehub-cli 同理)的 MR 适配是产品内的具名适配器类(`packages/mae-dts-flow/src/adapters/platformAdapter.ts`),由配置 `platform` 三选一——本目录不再承载运行时适配,只剩**靶场生命周期工具**(建仓/复跑清理)。本目录历史上承载过的 mr-status 适配器与 mr-adapter 配置样例已随 ADR-0002 删除,逻辑活在 `platformAdapter.test.ts` 里。

## 组成

| 文件 | 作用 |
|---|---|
| `fixture/` | 靶仓源:预埋 TTL bug+失败测试+PR 触发的 CI workflow |
| `setup.mjs` | 建 GitHub 私有仓并推 seed(`openaddr/mae-dts-fixture`);已有则强推回 seed |
| `reset.mjs` | 关靶仓全部开启 PR+删远端分支——「当之前的 PR 没发过」,同一靶题可复跑 |

## 适配面契约(产品内,specs/mae/dts-flow.md D15)

- `GithubPlatformAdapter.createMr`:`gh pr create --repo --head --title --body`,stdout 末行=PR URL;
- `GithubPlatformAdapter.pipelineStatus`:`gh pr view <url> --json state,statusCheckRollup` → MERGED/CLOSED 直接裁决,其余 checks rollup 映射三态;
- `CodehubCliPlatformAdapter`(内网):先查后建(mr list opened 复用)→ mr create(`--json web_url,iid`,目标分支取分支名约定首段)→ mr pipeline(`--no-cache`,状态词映射与平台 status_map 一字对应);
- 分支名契约 `目标分支_<工号>_<单号>`(服务端独知)与 git 推送(AI 原生+用户本地凭据)平台无关。

## 跑一轮(标准循环)

1. `node setup.mjs` — 靶仓回 seed;
2. WSL 真平台起(#69 验收层),业务模块仓库 URL 指 `https://github.com/openaddr/mae-dts-fixture.git`;
3. 服务配置:设置里数据源=云平台 + MR 平台=GitHub(即配置 `platform:"github"`) + cloudBaseUrl + 工号;gh 可被解析(binDir 或 PATH);
4. 看板发起(回归轮用 `full_auto` 无人值守;验闸轮 `align_first` 真窗放行);
5. 验收=真实 PR 建出、Actions 绿、台账 `closedAt` 收口;`node reset.mjs` 后可再跑。

## 诚实边界

GitHub 替身消除的是「假裁决」,不消除「平台差异」:内网 codehub 的分支保护/推送权限/内部流水线触发语义/审查流仍未真测——那些留给内网部署日;本靶场保证的是**流程与适配面在外网可无限复归地真实跑通**。
