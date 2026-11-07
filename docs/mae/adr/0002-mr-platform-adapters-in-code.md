# ADR-0002:MR 平台适配收敛为产品内具名适配器类,命令模板+外部脚本退役

- 状态:已接受(2026-11-07)
- 关联:specs/mae/dts-flow.md(D15 修订)、openaddr/ZCode#77/#78/#79(被本决策取代的外部适配物)、yunine9/mae-flow-cloud#580(内网命令手册)、[ADR-0001](0001-dts-data-plane-cloud-platform.md)

## 背景

mrGate 的 MR 腿(建 MR、流水线三态裁决)一期的接法是**配置驱动的命令模板**:`mr-adapter.json`(前身 platform-adapter.json)里的 `createMr`/`mrStatus` 两个 argv 数组经占位符填充后 spawn,stdout 按约定解析;GitHub 靶场(#74)与内网 CodeHub(#77/#78/#79)各配一份模板 + 一个外部包装脚本(`mr-status.mjs`/`mr-status-codehub.mjs`,binDir 里部署),选型理由是当时登记的「适配层隔离:平台只存在于 scripts 与部署配置,产品代码零感知」+「内网当天不改代码」。

v3.17.2 同步后用户复盘推翻了这组理由:①真实平台只有两个(GitHub 靶场、内网 codehub-cli),「几乎不会有新平台介入」;②「内网不改代码」的收益已由 #77 预烘交付——真实命令形状固化进代码后,配置解释器层只剩永久维护的双代码路径和散落产物(binDir 脚本 + dataDir JSON + 仓内 example + 两份 README + 包装脚本自带的 CLI 解析逻辑);③「平台自己也这么干」(mae-flow-cloud 的 pipeline-status.sh)不是理由——对齐平台看功能效果,不抄实现策略。

## 决策

**三选一具名适配器入产品**,配置键 `platform: "mock" | "github" | "codehub"`(统一三值;退役键 `mock:true` 映射为 `platform:"mock"`):

- `GithubPlatformAdapter`(外网靶场/验证):`gh pr create` / `gh pr view --json state,statusCheckRollup`;
- `CodehubCliPlatformAdapter`(内网):**先查后建**(`mr list --state opened` 复用同分支对已开 MR,平台幂等纪律)→ `mr create --json web_url,iid`(目标分支取分支名约定首段,**只用 mr create 不用 mr upload** 的 OMEGA 红线)→ `mr pipeline --no-cache`(状态词映射与平台 status_map 一字对应,认不出 fail-loud);
- `MockPlatformAdapter`(罐头,不变)。

`mr-adapter.json` 读写、`DEFAULT_COMMANDS` 模板、`CliPlatformAdapter` 解释器、两个外部包装脚本、`scripts/mae/dts-codehub/` 整目录全部删除;CLI 二进制解析不变(binDir 优先,`.cmd/.bat` 经 cmd /c);测试经 exec port 注入假执行器,服务经 `deps.platform` 注入假适配器。设置界面数据源=云平台时新增「MR 平台」选择器(默认 codehub)。

## 理由

1. **YAGNI 兑现**:两个真实场景直接写成两个类,可读、可跳转、可单测;新平台真来了,加一个类的 PR 成本不高于维护模板格式——抽象层没有省任何未来的事,只在今天的每条路径上加了一跳。
2. **行为升级搭车**:先查后建幂等在模板机制下做不了(模板只有 stdout 契约),具名类里是三行代码;消灭盲建重试产生重复 MR 的残余风险。
3. **产物收敛**:内网部署从「放两个文件+改 JSON+重启」收敛为「CLI 进 binDir → 设置选 CodeHub → git 凭据」三步。

## 后果

- 产品代码对 GitHub/codehub 的命令形状**显式知情**(此前是配置知情)——平台语义变化走正常产品 PR,不再有「改配置不改码」通道;换取的是删除一整层解释器。
- 旧 `mr-adapter.json`/`platform-adapter.json` 文件留在盘上会被静默忽略(不再读取);部署文档不再引用。
- 命令形状的真相源从「平台生产 adapter.codehub.json + #580 手册对拍」移入单测断言(假执行器的命令形状即契约);内网首访仍按 #77 的诚实边界做契约对账。
