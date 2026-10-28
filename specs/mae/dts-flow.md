# DTS 问题流本地化(zcode-mae 内闭环)

一句话:把 mae-flow-cloud 的 DTS 问题单处理流程本地化——在 zcode-mae 内拉问题列表、发起会话、可见阶段推进、自动处理到 MR 流水线全绿;实现重写,只参考云端思路,不搬其代码。

> 设计全程:wayfinder 地图 [openaddr/ZCode#37](https://github.com/openaddr/ZCode/issues/37)(研究 #38/#39,决策 #40/#42/#43/#44,原型 #41)。本 spec 是工程口径的收敛;与地图冲突时以地图决议评论为准。

## 决策登记

| # | 决策 |
| --- | --- |
| D15 | DTS 问题流本地化进 zcode-mae(本 spec);一单一会话+专属工作区 `~/.zcode-mae/dts-issues/<单号>/`;本地服务双面承载(stdio MCP 给会话 Agent,本地 HTTP 给 UI),DTS token 只进服务进程;阶段真相=服务台账(工作区外)+自报制,平台只守两道核验(分析报告确认闸/MR 验绿门);工具四件套 `dts_get_ticket`/`create_mr`/`submit_analysis`/`complete_stage`(拉仓/改码/推送=AI 原生 git+用户本地配置);统计=MR 账唯一口径;介入档位三档(全自动/优先报告/优先对齐),**本地默认优先对齐**;报告=`issue-analysis.md` 四章节(md 本体);无单流程、检视圈注、月光通知、HTML 报告展示均后置;本地与云端数据互不读写,共享的只有外部事实源(DTS 网关单据、Git 平台仓/MR/流水线) |

## 服务形态

一个本地服务进程,双面:

- **HTTP 面**(UI 消费):问题列表、发起动作、阶段查询、模块绑定、健康检查;listen 地址默认 `127.0.0.1`,端口可配。
- **stdio MCP 面**(会话 Agent 消费):阶段机工具(施工票 3 起四件套);与 HTTP 面同进程,共享台账与配置。`--stdio` 时 stdin/stdout 归 MCP 协议。
- **数据目录**(缺省 `~/.zcode-mae/dts-flow/`):`config.json`、`issues/<单号>/ledger.json` + `events.jsonl`(阶段台账,AI 只读)、`module-bindings.local.json`(本地兜底配置)。
- **依赖组件**:codehubcli/ops 二进制约定放 `~/.zcode-mae/bin/`,服务启动探测(该目录+PATH);缺席**不阻启动**、调用时 fail-loud(施工票 7 才消费 codehubcli)。

## 配置体系

| 字段 | 缺省 | 说明 |
| --- | --- | --- |
| `dataDir` | `~/.zcode-mae/dts-flow` | 服务数据根 |
| `binDir` | `~/.zcode-mae/bin` | 依赖组件目录 |
| `employeeId` | 必填 | 工号(分支名 `master_<工号>_<单号>` 因子) |
| `cloudBaseUrl` | 空 | mae-flow-cloud 地址(模块绑定云端拉取;空=只用本地) |
| `dtsGatewayUrl` | 空 | DTS MCP 网关地址(#38 对拍) |
| `dtsTokenPath` | `<dataDir>/mcp-token` | x-auth-token 文件(权限 600) |
| `httpPort` | 8788 | HTTP 面端口 |
| `mock` | false | mock 模式(罐头单据,外网开发/演示) |

## 模块绑定(两层)

- 云端层:`GET <cloudBaseUrl>/…` 拉取模块→仓绑定与版本组→分支映射(端点在施工票 2 落实;鉴权凭据为配置项)。
- 本地层:`module-bindings.local.json`,结构与云端一致;**云端可达时云端为准,不可达时本地兜底并可启动**;数据来源(`cloud`/`local`)随查询结果标明。

## 阶段机与门禁(概要,详见地图 #42)

有单五阶段:`拉单 → 拉仓 → 分析 → 修复 → MR验绿`;推进=AI 调 `complete_stage` 自报,服务记账不核实;两道核验:`submit_analysis` 举分析确认闸(UI 确认放行,全自动档自动放行)、MR 验绿门(申报清单=MR 账对拍+流水线三态裁决)。分支名服务独知:`master_<工号>_<单号>`,create_mr 按期望名直建,不采信 AI 报名。软门禁边界如实登记:无容器,防意外不防蓄意。

## UI 挂点(#41 原型定形)

主视图第四页签「DTS列表」(云平台 IssueBoard 同款整页);任务列表新增与项目平级的「问题会话」分组;发起=弹窗(单号远程补查/模块带出/附加信息/档位三选一);阶段显示=问题会话 composer 上方「处理阶段」块。

## 施工切分(#44 决议)

7 票:①服务骨架与配置体系(本 spec 对应 [#45](https://github.com/openaddr/ZCode/issues/45))→②DTS 网关客户端+mock→③四件套工具+阶段机→④问题会话链路→⑤DTS列表页 UI→⑥阶段块 UI→⑦MR 验绿与收尾。外网开发期 ①-⑥ mock 全可验;⑦ 的 codehubcli 端到端等内网部署。

## 已知边界(诚实清单)

- 软门禁:工作区 pushurl 指空+hook 拦截防意外直推;执意绕过不可防(单用户本地,权威在用户)。
- DTS 网关/流水线状态依赖内网;外网全链路只有 mock 形态。
- 台账 bash 直改未防(与云端同款残余风险);单号门禁查服务侧状态不受影响。
