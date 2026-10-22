# AGENTS —— mae fork 工作区规则

本文件是本 fork（主干 `mae`）的规则入口，由 mae 维护。上游 ZCode 的工程规则快照在 [upstream-AGENTS.md](upstream-AGENTS.md)（每次上游同步整体替换）。

## 规则层级

涉及仓库内代码的改动，先读 [upstream-AGENTS.md](upstream-AGENTS.md) 对应章节——验证命令、架构治理、UI 与平台边界、进程与协议、日志、测试纪律都在那里。**它与 mae 目标或 `specs/mae/` 冲突时，以本文件与 specs/mae/ 为准。**

## 铁律

1. **写盘先开工作区**：任何改动（代码/文档/配置）先 `jj workspace add ../zcode-ws-<代号>` 再动手，主树 `@` 只读停靠。jj 命令配方与上游同步 runbook 见 [MAE.md](MAE.md)。
2. **交付走书签+PR**：`jj describe` → 独立书签 → `jj git push -b <书签>` → PR squash 合入；本地 `mae` 不前移、不直推。
3. **定制隔离**：定制进新增文件（`packages/mae-*/`、`specs/mae/`、`docs/mae/`、`.agents/skills/`）；必须改上游文件时薄改（≤10 行）+ `// mae:` 标记 + MAE.md 定制清单登记。zcode-mae 独立版改动先读对应 spec（`specs/mae/`）。

## 硬性验证

行为改动先补测试；交付前 `pnpm typecheck` 与 `pnpm lint` 真实通过，失败不得写成通过。上游工程验证全貌（verify:pre-push、架构检查、affected 测试）见 upstream-AGENTS.md。

## Agent Skills

> mae 定制配置。`docs/agents/` 与 `docs/issues/` 是上游自带的本地 Markdown 约定，不适用于本 fork 的任务跟踪，勿以其为准。

- Issue tracker：GitHub Issues（openaddr/ZCode，`gh --repo openaddr/ZCode`）。见 `docs/mae/agents/issue-tracker.md`。
- Triage labels：五个规范角色。见 `docs/mae/agents/triage-labels.md`。
- Domain docs：mae 单上下文（`docs/mae/GLOSSARY.md` + `docs/mae/adr/`）。见 `docs/mae/agents/domain.md`。
