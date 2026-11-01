# dts-fixture:DTS 问题流外网验证靶场(GitHub 替身,#73)

把「外部 Git 平台 + 流水线」在外网以 GitHub 替身真实跑通 MR 验绿腿(唯一此前只到罐头的环节)。**适配层隔离约束:GitHub 只存在于本目录与部署配置(`platform-adapter.json`)中,产品代码(服务/mrGate/四件套)对 GitHub 零感知**——内网终态=codehub+内部流水线,替换时只动本目录的 GitHub 实现,不动产品。

## 组成

| 文件 | 作用 | 内网替换点 |
|---|---|---|
| `fixture/` | 靶仓源:预埋 TTL bug+失败测试+PR 触发的 CI workflow | 内网靶仓删 workflow,内部流水线对 MR 自动触发 |
| `setup.mjs` | 建 GitHub 私有仓并推 seed(`openaddr/mae-dts-fixture`);已有则强推回 seed | 换 codehub 建仓等价操作 |
| `reset.mjs` | 关靶仓全部开启 PR+删远端分支——「当之前的 PR 没发过」,同一靶题可复跑 | codehub 关 MR+删分支 |
| `mr-status.mjs` | mrStatus 适配器:PR checks → `{"pipeline":"green\|red\|running"}` | `codehubcli mr status` 直接满足同一契约 |
| `platform-adapter.github.example.json` | 服务适配器配置样例(放服务 dataDir 的 `platform-adapter.json`) | 内网覆盖为 codehubcli 模板(spec D15 既定) |

## 适配面契约(specs/mae/dts-flow.md D15)

- `createMr` 模板占位符 `{repo}/{branch}/{title}/{description}/{ticket}`;**stdout 末行=MR URL**;
- `mrStatus` 模板占位符 `{url}`;**stdout=JSON `{"pipeline":"green|red|running"}`**;
- 分支名契约 `master_<工号>_<单号>`(服务端独知)与 git 推送(AI 原生+用户本地凭据)平台无关。

## 跑一轮(标准循环)

1. `node setup.mjs` — 靶仓回 seed;
2. WSL 真平台起(#69 验收层),业务模块仓库 URL 指 `https://github.com/openaddr/mae-dts-fixture.git`;
3. 服务配置:`mock:false` + cloudBaseUrl + dataDir 放 `platform-adapter.json`(由 example 本地化绝对路径);
4. 看板发起(回归轮用 `full_auto` 无人值守;验闸轮 `align_first` 真窗放行);
5. 验收=真实 PR 建出、Actions 绿、台账 `closedAt` 收口;`node reset.mjs` 后可再跑。

## 诚实边界

GitHub 替身消除的是「假裁决」,不消除「平台差异」:内网 codehub 的分支保护/推送权限/内部流水线触发语义/审查流仍未真测——那些留给内网部署日;本靶场保证的是**流程与适配面在外网可无限复归地真实跑通**。
