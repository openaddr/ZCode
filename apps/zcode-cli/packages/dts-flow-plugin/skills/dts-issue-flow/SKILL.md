---
name: dts-issue-flow
description: DTS 问题单本地闭环处理流程(拉单/拉仓/分析/修复/MR 验绿五阶段),经 dts-flow MCP 工具推进,阶段与门禁以服务台账为准。
---

# dts-issue-flow:DTS 问题单处理流程

处理 DTS 问题单时使用本技能。单据上下文不在本文写死:单号、标题、级别、描述以会话开场词与 `dts_get_ticket` 结果为准;工号、平台、数据目录等配置经 `server_info` 查询。全程按阶段推进,阶段真相在 dts-flow 服务台账,你只通过工具推进。

## 开场自检

1. 调 `server_info`:确认工号、平台(github/codehub/mock)与数据目录就位。
2. 调 `dts_get_ticket` 拉取当前单据详情,明确现象与版本。
3. 问题工作区与台账由用户在 UI 发起动作创建;工作区路径以开场词为准,不要自行编造。

## 工具名

MCP server 名为 `dts-flow`,会话内可见工具名带前缀:`mcp__dts-flow__dts_get_ticket`、`mcp__dts-flow__submit_analysis`、`mcp__dts-flow__create_mr`、`mcp__dts-flow__complete_stage`、`mcp__dts-flow__server_info`。若宿主以其他名字挂载,以当前工具列表里的 `mcp__<server>__...` 为准。

## 阶段与出口

- 拉单(dts_info):获取 DTS 单信息,明确现象与版本
- 拉仓(prep_repo):拉取相关代码仓,建立修复分支
- 分析(analyze):定位根因,产出四章节分析报告并过确认闸
- 修复(fix):按报告修改代码,补测试,推送分支
- MR 验绿(mr_green):创建 MR 并申报,流水线全绿收口

推进方式:完成阶段目标后调 `complete_stage` 自报收口;例外——分析阶段以 `submit_analysis` 为出口(触发用户确认闸),MR 阶段以 `create_mr` 建单后 `complete_stage` 申报 MR 清单。

## 工作区布局

- 工作区根:开场词给出的当前单号目录(每单一个)
- 代码仓克隆放 repo/ 子目录(每仓一个子目录)
- 日志材料放 local-logs/
- 分析报告:issue-analysis.md(四章节,submit_analysis 的门票)

## 分支与推送

- 修复分支名固定:`master_<工号>_<单号>`(工号经 server_info 获取,单号=当前处理单据);本地分支名无关,推送用 `git push origin HEAD:master_<工号>_<单号>`
- 推送用你自己的 git 环境;不要改工作区配置文件与台账

## 提交与 MR

- 提交格式:`[<单号>][类型] 描述`
- 建 MR 走 `create_mr` 工具(服务按期望分支名直建,不要自行调 MR 工具)

## 报告模板

issue-analysis.md 必须含四章节标题:问题现象 / 问题根因 / 修改方案 / 置信度。证据随文标注,置信度如实写局限。
