# mae

zcode-mae fork 的单上下文术语表:桌面定制版 ZCode(独立身份 ZCode Mae),当前最大的定制域是 DTS 问题流本地化(从 mae-flow-cloud 云平台搬到本机)。规则入口见 [AGENTS.md](../../AGENTS.md),规格见 [specs/mae/](../../specs/mae/)。

## Language

### DTS 问题流

**DTS 问题流**:
把云平台的「问题单处理」流程在本机复刻:看板拉单 → 发起 → Agent 按五阶段处理到 MR 验绿;数据同源自云平台,执行全在本地。
_Avoid_: DTS 集成、问题单同步

**问题单(单据/单)**:
DTS 系统里的一条缺陷/问题记录,以单号(如 DTS-2026-1002)为唯一标识;看板与问题会话都围绕它。
_Avoid_: ticket 工单、缺陷单混用

**发起**:
把一张可实施的问题单落成一个本地问题会话:服务端建工作区+台账,壳层自动发开场词开跑(openaddr/ZCode#68 起与云平台「发起即开跑」同语义)。
_Avoid_: 启动会话、创建任务

**发起即开跑**:
发起的语义契约:发起成功 = 会话已创建且开场词已作为首条用户消息自动发出,Agent 立即开始执行;不存在「预填草稿等用户确认」环节。
_Avoid_: 草稿预填

**问题会话**:
一张单对应的 Agent 会话(一单一会话),跑在专属问题工作区里;其发起状态由服务台账判定(非会话存在性)。
_Avoid_: DTS 会话、问题任务

**问题工作区**:
`~/.zcode-mae/dts-issues/<单号>/`,单据处理专用工作区;内含 SKILL.md 与分析报告等工作产物。
_Avoid_: 问题目录

**台账**:
服务端持有的单据处理真相(工作区外持久化):轮次、阶段、事件;同单重复发起被拦的判据,收口/归档后重发起翻轮次留档 `ledger.prev-*`。
_Avoid_: 状态库、进度表

**五阶段**:
拉单(dts_info)→ 拉仓(prep_repo)→ 分析(analyze)→ 修复(fix)→ MR 验绿(mr_green);推进由 Agent 调四件套工具自报,服务记账不核实。
_Avoid_: 步骤、流程节点

**四件套工具**:
本地服务经 stdio MCP 暴露给会话 Agent 的四个领域工具:`dts_get_ticket` / `submit_analysis` / `create_mr` / `complete_stage`。
_Avoid_: MCP 工具集泛称

**两道核验**:
平台只核实两处:分析确认闸(`submit_analysis` 举闸,UI 确认放行)与 MR 验绿门(MR 账对拍+流水线三态裁决);其余阶段自报制。
_Avoid_: 审核环节泛称

**介入档位**:
发起时可选的三档自治度(全自动/优先报告/优先对齐),本地默认「优先对齐」;发起后定格,进行中不可改。
_Avoid_: 自动化级别

### 数据面

**同源**:
本地不建第二事实源:单据/模块/绑定/人员全部实时读云平台(mae-flow-cloud),本地只存台账与工作产物。
_Avoid_: 本地缓存、双写

**免登录允许清单**:
云平台 ADR-0069 的匿名放行端点集(拉单/详情/绑定读写/模块/人员);未放行时请求 401,mae 显形为 `not_authorized` 并指路,不静默降级。
_Avoid_: 匿名模式、免鉴权

**mock 云平台**:
测试夹具(`packages/mae-dts-flow/test/mocks/mockCloudServer.ts`):按平台真实响应形状镜像的本地 HTTP 服务,用于外网全链路验证;区别于服务内置的「本地模拟」网关。
_Avoid_: 假平台、stub 服务

**本地模拟**:
本地服务配置 `mock:true`(设置页「数据来源=本地模拟」)时的内置罐头数据网关,零外部依赖;与 mock 云平台是两条独立的 mock 路径。
_Avoid_: mock 模式混称

### fork 基础

**mae**:
本 fork 的定制分支名与定制域统称;上游为 ZCode(openai 式内部命名,mirror 自官方 ZCode)。定制进新增文件,改上游文件须薄改+`// mae:` 标记+台账登记。
_Avoid_: fork 分支泛称

**zcode-mae**:
mae 定制版的应用身份:应用名 ZCode Mae、数据根 `~/.zcode-mae`、深链接 `zcode-mae://`;与官方 ZCode 并存隔离。
_Avoid_: 应用名混用 ZCode
