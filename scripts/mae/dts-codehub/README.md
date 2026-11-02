# dts-codehub —— 内网 CodeHub 适配物(外网预烘,内网直接用)

DTS 问题流的 mrGate 腿在内网 CodeHub 上的适配物。与 `../dts-fixture/`(GitHub 替身)同角色、同隔离纪律:**GitHub/CodeHub 只存在于本目录与部署配置(`platform-adapter.json`)中,产品代码(服务/mrGate/四件套)对具体平台零感知**。命令形状全部来自平台生产配置(`mae-flow-cloud` deploy/adapter-config/adapter.codehub.json)+ codehub-cli 官方 skill 手册 v3.7.1(issue yunine9/mae-flow-cloud#580),零猜测。

## 组成

| 文件 | 作用 | 内网部署位置 |
|---|---|---|
| `platform-adapter.codehub.example.json` | 服务适配器配置样例:createMr 直用 codehub-cli,mrStatus 指到包装脚本 | 拷到服务 dataDir(`~/.zcode-mae/dts-flow/platform-adapter.json`)改 mrStatus 的脚本绝对路径 |
| `mr-status-codehub.mjs` | mrStatus 适配器:MR URL → `codehub-cli mr pipeline` → `{"pipeline":"green\|red\|running"}` | 放 `~/.zcode-mae/bin/`(binDir)或任意路径(example 里填绝对路径) |

## 内网当天 runbook(五步)

1. **装 CLI**:`npm install -g @codehub/codehub-cli`(内网源 `cmc.centralrepo.rnd.huawei.com`;Node 14+)。Windows 全局装出来的是 `codehub-cli.cmd`,服务的 execJson 已做 cmd /c 转发,直接可用。
2. **认证**:`codehub-cli auth login --username <账号> --all`;`codehub-cli auth token` 能吐出令牌即通。CLI 找不到 host 时用 `-H <别名>`(green/open/yellow)——本适配物靠 `{repo}` 完整 URL 推导 host,常规情况无需 `-H`。
3. **git 推送凭据**:agent 在问题工作区自己 `git push`(分支 `master_<工号>_<单号>`)。给 codehub host 配一次 HTTPS 凭据:用户名=账号、密码=CodeHub token(`git config credential.helper` 或系统凭据管理器均可)。
4. **放文件**:`mr-status-codehub.mjs` 落 `~/.zcode-mae/bin/`;example json 拷为 `~/.zcode-mae/dts-flow/platform-adapter.json`,`mrStatus` 第二参改成脚本绝对路径。
5. **重启服务**:设置界面「DTS 问题流」保存任意配置(触发自动重启),让冻结的适配器模板重新加载。

验证一腿:`node ~/.zcode-mae/bin/mr-status-codehub.mjs https://codehub-y.huawei.com/<组>/<仓>/merge_requests/<iid>` 应输出三态 JSON。

## 关键纪律(为什么是这些命令)

- **必须 `mr create`,绝不用 `mr upload`**:我们的 agent 自己 `git push` 推进 MR。upload 建的是 OMEGA MR,普通 git push **不会**推进 MR head、不会重触发流水线;`mr create` 的常规分支 MR 才随 push 自动更新+重触发(skill 手册 §Incremental MR 的红线表)。
- **状态映射与平台 status_map 一字对应**:`success→green`,`failed/canceled/skipped→red`,`running/created/pending/manual→running`;认不出的词退出码 1(fail-loud),服务记 `pipeline_probe_failed` 继续轮询,预算耗尽转人工——不猜 running 白烧预算,不猜 red 白烧修复轮。
- **多条 run 取数值 id 最大者**:MR 头上可能挂多条历史流水线,拿旧绿灯放行是平台对比报告的头号根因。
- **`--no-cache`**:轮询场景必须绕 CLI 的 HTTP 响应缓存,否则绿灯可能永远是上一拍的缓存。
- **`{repo}` 用完整 URL**:`-p/--project` 官方接受项目路径/页面 URL/clone URL;我们的台账里只有 clone URL,直接给。

## 已知取舍(部署日确认项)

- **`--target-branch master` 写死**:我们的分支名约定 `master_<工号>_<单号>` 已嵌目标分支;目标分支不同的仓要在 example 里逐仓调整。
- **MR 描述不传**:`mr create` 官方旗标集没有 `--description`(描述走项目 MR 模板自动填充);服务侧 `{description}` 留空即可,不需要改代码。
- **`-k`(跳过证书校验)写死**:平台生产配置同款;内网证书环境若不需要,从两个模板里删掉该参。
- **host 多环境**:`{repo}` URL 已自含 host;若某仓 URL 不规范导致 CLI 选错 profile,在 createMr 模板里显式加 `"-H","<别名>"`。

## 未来口子(已本地化流程暂不消费,文档在手)

- **CI 红灯诊断**:`mr gate <iid> --action cloudbuild|codecheck|fossbot [--log]`(结构化报告+原始日志)、`pipeline view <target_url> --action <name> --log --tail 100`——把失败原文喂修复会话用,接入点是 mrGate 的 verdict 附带材料,当前流程修复靠本地复现。
- **检视意见闭环**:`mr review list/reply/resolve`(`--discussion` 是 SHA 样字符串)。
- **合并门禁九项**:`mr gate <iid> --columns merge_gate_passed,ci_state_passed,...`(当前只吃流水线三态)。
- **工单截图**:`dts-cli ticket batchQueryTicket --convertAttachment` 有附件转换旗标但无独立下载命令;真要「截图进分析」需平台补图片代理端点(平台侧已有 `fetchWithAuth` 同源凭据机制)或 dts-cli 出下载子命令。
