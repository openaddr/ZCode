# AGENTS —— mae fork 工作区规则

本文件是本 fork（主干 `mae`）的规则入口，由 mae 维护。上游 ZCode 的工程规则快照在 [upstream-AGENTS.md](upstream-AGENTS.md)（每次上游同步整体替换）。

## 规则层级

涉及仓库内代码的改动，先读 [upstream-AGENTS.md](upstream-AGENTS.md) 对应章节——验证命令、架构治理、UI 与平台边界、进程与协议、日志、测试纪律都在那里。**它与 mae 目标或 `specs/mae/` 冲突时，以本文件与 specs/mae/ 为准。**

> **mae 状态标注（D6 例外条款，#12）**：本 fork 已裁剪官方云端功能（登录/套餐/分享/闲时/反馈/营销/奖励/手机远控/Bots/远程工作区，specs/mae/ D7，gates 见 `packages/ui/src/mae/featureGates.ts` 与 `packages/desktop/src/main/mae/featureGates.ts`）。upstream-AGENTS.md 与上游 docs/skills 中涉及这些功能的流程、入口与验证描述在 mae 下不可达，以其为据写的测试须按 mae 语义适配（显式 `ZCODE_ALLOW_OFFICIAL_IDENTITY=1` 才回到官方语义）；深链接协议为 `zcode-mae://`（D4），上游 `zcode://` 字面量对本应用无效。

## 铁律

1. **写盘先开工作区**：任何改动（代码/文档/配置）先 `jj workspace add ../zcode-ws-<代号>` 再动手，主树 `@` 只读停靠。jj 命令配方与上游同步 runbook 见 [docs/mae/sync-runbook.md](docs/mae/sync-runbook.md)。
2. **交付走书签+PR**：`jj describe` → 独立书签 → `jj git push -b <书签>` → PR squash 合入；本地 `mae` 不前移、不直推。
3. **定制隔离**：定制进新增文件（`packages/mae-*/`、`specs/mae/`、`docs/mae/`、`.agents/skills/`）；必须改上游文件时薄改（≤10 行）+ `// mae:` 标记 + docs/mae/customization-registry.md 台账登记。zcode-mae 独立版改动先读对应 spec（`specs/mae/`）。

## 硬性验证

行为改动先补测试；交付前 `pnpm typecheck` 与 `pnpm lint` 真实通过，失败不得写成通过。上游工程验证全貌（verify:pre-push、架构检查、affected 测试）见 upstream-AGENTS.md。

## Agent Skills

> mae 定制配置。`docs/agents/` 与 `docs/issues/` 是上游自带的本地 Markdown 约定，不适用于本 fork 的任务跟踪，勿以其为准。

- Issue tracker：GitHub Issues（openaddr/ZCode，`gh --repo openaddr/ZCode`）。见 `docs/mae/agents/issue-tracker.md`。
- Triage labels：五个规范角色。见 `docs/mae/agents/triage-labels.md`。
- Domain docs：mae 单上下文（`docs/mae/GLOSSARY.md` + `docs/mae/adr/`）。见 `docs/mae/agents/domain.md`。
