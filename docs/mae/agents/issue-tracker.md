# Issue tracker: GitHub Issues(openaddr/ZCode)

mae 定制项目的 Issue 跟踪使用本 fork 的 GitHub Issues(`gh` CLI,账号 openaddr)。与上游仓库自带的本地 Markdown 约定(`docs/agents/issue-tracker.md`、`docs/issues/`)刻意区分:上游文件描述上游工作流,mae 的任务、spec 发布与分诊不使用它们,防止后续会话被上游约定带偏。

## 规则

- Issue 标题使用中文并带主题前缀,如 `[P0] 身份与隔离:...`、`[setup] ...`、`[P1] 功能裁剪:...`。
- 规格正文保留在 `specs/mae/`,Issue 与规格文件互链,不把规格复制进 Issue 正文。
- "publish to the issue tracker" = `gh issue create`;标签按 [triage-labels.md](triage-labels.md)。
- 关闭 Issue 不删除 `specs/mae/` 下的规格文件。
- PR 工作流沿用 docs/mae/sync-runbook.md 的 jj 纪律(交付三步 + PR squash 合入),与 Issue 跟踪相互独立。
