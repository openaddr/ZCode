# ADR-0001:dts-flow 数据面同源 mae-flow-cloud,直连 DTS 网关退役

- 状态:已接受(2026-10-30)
- 关联:specs/mae/dts-flow.md(D15 修订)、openaddr/ZCode#57、[yunine9/mae-flow-cloud#566](https://github.com/yunine9/mae-flow-cloud/issues/566)

## 背景

dts-flow 一期的拉单面是**直连 DTS MCP 网关**(14 参 JSON-RPC over HTTP、x-auth-token 文件、SSE 双形态容忍),模块/分支映射走「云端配置 primary + 本地 `module-bindings.local.json` fallback」两层。对齐云平台 DTS 列表的走查拷问(openaddr/ZCode#58/#59 前置决策)暴露了这组自建面的真实成本:branch(版本→分支映射)与 module(特性→模块带出)是云平台服务端单点计算的字段,本地直连拿不到,要么自建第二套映射解析(与云端漂移),要么发起闸数据缺席。

## 决策

**拉单/查单/模块目录/绑定读写全部改走 mae-flow-cloud HTTP 接口**(`GET /issues/dts?owner=`、`GET /issues/dts/:ticket`、`GET /business-modules`、`GET/PUT /issues/dts-bindings[/:ticket]`、`GET /auth/people`),`DtsGateway` 接口形状不变、实现整体替换;直连网关代码、x-auth-token 文件、本地映射 fallback 全部删除。

依赖纪律(最小依赖):不碰云平台问题会话 CRUD(发起/台账/查重/收口全在本地)、不碰配置中心接口族(branch 随列表下发)、不碰附件;工单/版本串口径跟随云平台(版本取 C 版字段,mae-flow-cloud#564)。

## 理由

1. **同源消灭漂移**:branch/module 是平台服务端单点计算并随响应下发的字段,本地消费即与云端永不漂移;自建解析注定两套口径。
2. **零凭据**:平台对这组读接口的免登录允许清单提案见 #566;放行前 401 显形为 `not_authorized` 并明确指路,mock 全流程不受影响。相比直连网关时代的 token 文件管理,配置面只剩 `cloudBaseUrl`+`employeeId`。
3. **免费获得云端演进**:责任人切换(`owner=`)、远程补查、绑定团队共享,都是平台既有能力,本地零实现。

## 后果

- 真实模式强依赖云平台可达且 #566 放行;降级路径=mock(外网开发照常)。
- 旧配置文件中的 `dtsGatewayUrl`/`dtsTokenPath` 键容忍忽略不炸(config 装配层 DEPRECATED_CONFIG_KEYS)。
- 发起查重语义从「台账存在即拒」放宽为「只拦进行中」(`!closedAt && !archived`),对齐云端;收口后再发起=新一轮,旧台账就地留档 `ledger.prev-*`。
