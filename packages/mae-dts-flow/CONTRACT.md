# mae-dts-flow

zcode-mae 内本地闭环 DTS 问题处理的服务进程:一个进程双面承载——HTTP 面给 UI(列表/发起/阶段查询),stdio MCP 面给会话 Agent(施工票 3 起四件套工具)。spec 见 `specs/mae/dts-flow.md`(D15);设计决议见 wayfinder 地图 openaddr/ZCode#37。

类型与测试表达不了的不变量:

- **凭据止步服务进程**:DTS token 只存路径、只在服务内消费;`configSummary`、HTTP 响应、MCP 工具结果、日志里永不出现凭据内容。
- **台账写入原子**:ledger.json 一律临时文件+rename;崩溃恢复宁可读到旧状态也不读半截 JSON。同单台账的并发写由单进程内串行化保证(一期无跨进程写方)。
- **阶段自报制**:recordStage 只记账不核实工作事实;两道核验(分析确认闸/MR 验绿门)在后续施工票里以门禁数据落台账,不由 AI 侧写路径。
- **模块绑定云端优先**:配置了 cloudBaseUrl 时云端成功必须以云端为准;降级本地兜底必须带 `degraded: true` 与原因,不得静默。两层都不可得 fail-loud。
- **依赖缺席不阻启动**:probe 只汇总;`requireDependency` 在调用期 fail-loud,报错必须指名组件与 binDir 安装路径。
- **--stdio 时 stdout 独占**:stdio MCP 面启用后,除协议帧外任何代码不得向 stdout 写字节;服务日志一律 stderr。
- **数据目录在问题工作区之外**(~/.zcode-mae/dts-flow):Agent 会话工作区(~/.zcode-mae/dts-issues/<单号>/)对台账零写路径。
