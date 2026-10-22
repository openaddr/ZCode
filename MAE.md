# MAE —— 本 fork 的运维手册（模型 · jj 纪律 · 上游同步 · 定制登记）

> 上游 `upstream` = zai-org/ZCode（main 由 Sync Bot **每日 squash 发布**，无细粒度历史，tag 如 v3.15.1 是稳定锚点）。
> 本仓 `origin` = openaddr/ZCode，唯一主干 = **mae**。工具 = jj（colocated，`.jj` 与 `.git` 共存，git 仅作逃生舱）。
> 模型：**mae = main@upstream + 定制提交栈（rebase 模式）**。本文件是同步解冲突的现场手册，也是全部命令配方的唯一事实源。

## 一、模型与铁律

```
U1───U2───U3                  main@upstream（fetch 自动前进；只读地基，永不本地提交）
            ╲
             C1───C2───C3     mae = 定制提交栈；每次同步整链重放到新上游头
```

1. 不建本地 `main` 分支；上游引用一律写 `main@upstream`。
2. 同步 = `fetch + rebase 整栈`；不做 merge、不手工复制上游文件（那是上游 bot 的活）。
3. 定制隔离遵守「三、定制隔离规则」——新增文件优先。
4. 出现下列信号即按「四」末尾配方切换 merge 模式（一次性操作，无损）：
   - 连续两三次同步同一批文件反复冲突，单次解冲突超约 30 分钟；
   - 栈中直接改动上游文件的提交超过约 10 个。

## 二、jj 纪律（0.45 实踩，借鉴 dafung-web「版本协作」经验）

- **并行隔离（最重要）**：任何写盘改动先 `jj workspace add ../zcode-ws-<代号>` 开工作区，建后 `jj new mae` 起基（勿照主树停靠的 `@` 起基，它可能落后）；在 workspace 内干活与交付——workspace 无 `.git`，git/gh 命令需回主树或显式 `-R`/`-R openaddr/ZCode`。主树 `@` 只读停靠，发现 `@` 有非自己生产的内容 = 让位勿盖——jj 快照会把并行写入折进你的提交（本仓多次实锤）。谁建谁清：`jj workspace forget <名>` + 删目录。
- **交付三步**：`jj describe -m "<type>(<scope>): 中文描述"` → `jj bookmark create/move` → `jj git push --bookmark <名>`。**push 过的 change 视为只读**，续活先 `jj new` 起新票。
- **PR 收账（GitHub squash 合入后）**：`jj git fetch` → `jj bookmark move mae --to mae@origin` → `jj new mae` 停靠。move 的必要性分两种：本地 `mae` 与旧 `mae@origin` 同位（PR 流下未提前动过 mae，待合工作放独立书签）→ fetch **自动快进**，move 只是幂等保险；本地 `mae` 已领先/分叉 → squash 合并产生"同树不同身份"的新提交（SHA 与 change-id 都不同），fetch 后两书签必然分叉，**必须显式 move 承认远端为准**——不 move 的后果：mae_custom() 读旧栈、下次 push 试图非快进覆盖远端合并结果（被安全检查挡住）、log 永远双位置。
- **push 前两查**：`jj diff --stat` 文件集与预期一致（多出的文件 = 被并行折入，先 `jj split <paths>` 拆分再推）；`pnpm verify:pre-push` 手动跑——jj 不执行 git hooks，而本仓 **husky pre-push 已生效**：`git push` 逃生舱会触发它，且其中 `test:unit:affected` **拒绝脏工作区**（并行写入滞留时必被挡，2026-10-21 实锤；纯 ref 删除可 `git push --no-verify`）。
- **rebase 前后两查**：前 `jj workspace update-stale`（stale 副本上 rebase 静默不生效）；后 `jj log -r @-` 回读父链确认落位。
- **diff / 文件提取端点认 change-id 不认 git hash**（快照会重写 hash，拿旧 hash 会提出旧版内容）。
- **兜底**：`jj op log` 全量可撤销；git 对象库是最后保险（`git show <hash>` 验内容、`git checkout <hash> -- <file>` 捞回）。
- 话术：`jj git init --colocate` 报 "target repo already exists" 但实际成功，以 `jj log` 为准，勿重复 init。
- **EOL 口径（全仓文本恒 LF，2026-10-21 实锤换来的）**：Windows autocrlf 检出 CRLF × jj 按原始字节快照 = 全树 15146 文件、305 万行的幻影 diff。修法三件套：`.gitattributes` 首部 `* text=auto eol=lf`（随仓库分发，治本）+ jj `working-copy.eol-conversion = input`（快照侧）+ repo 局部 `git config core.autocrlf false`（本机检出侧）；`.bat/.cmd` 例外 CRLF。**renormalize 顺序铁律：先落盘后改属性文件**——`git checkout-index -f -a` 会用旧索引覆盖刚改过的 `.gitattributes`（实锤）；jj 侧等价落盘用 `jj restore`（按存储字节原样写回）。
- 本仓 repo 级配置**存于用户目录（Windows：`AppData/Roaming/jj/repos/<id>/config.toml`）而非 `.jj` 内——机器本地、不随克隆迁移，是 jj 的设计行为**。当前值：`trunk() = main@upstream`（jj 自动判定）、`mae_custom() = main@upstream..mae`、`immutable_heads() = main@upstream | main@origin | tags()`（保证已推送的 mae 栈仍可 rebase）、`snapshot.max-new-file-size = 5MiB`、`working-copy.eol-conversion = input`（快照侧 CRLF→LF）。新机器/重新克隆后按此重放：

  ```bash
  jj bookmark track mae@origin
  jj config set --repo 'revset-aliases."mae_custom()"' 'main@upstream..mae'
  jj config set --repo 'revset-aliases."immutable_heads()"' 'main@upstream | main@origin | tags()'
  jj config set --repo snapshot.max-new-file-size 5242880
  jj config set --repo working-copy.eol-conversion input
  git config core.autocrlf false
  ```

  不重放的后果：`mae_custom()` 报未定义；`immutable_heads()` 退回默认值，rebase 已推送的 mae 栈会被拒。仓库内容、书签与 rebase 能力本身不受影响（change-id 映射与 op log 属 `.jj` 私有数据，换机会重新分配，属 jj+git 协作常态）。

## 三、定制隔离规则（业界三流派，本仓取组合）

| 流派 | 代表 | 做法 | 本仓采用 |
| --- | --- | --- | --- |
| 集中补丁 | patch-package / quilt（oh-my-pi 的 `patches/`） | 钉版本最小补丁集中一目录 | 借鉴其"补丁思维"：改上游文件的每处都薄、登记、可审 |
| 平行结构 | oh-my-pi 主体、OpenSearch | 只新增自己的 crates/packages，不改上游文件，放弃细粒度同步 | **新增文件永不冲突是第一原则**；定制代码进新目录/新 package |
| 散布+标记 | Chromium（`CHROMIUM:` 前缀）、Android vendor | 改上游文件处注释标记 + 提交规范审计 | 采用 `// mae:` 标记 + 本文件登记 |

目录约定：

| 类型 | 位置 |
| --- | --- |
| 定制代码 | 新 package（如 `packages/mae-*/`）或独立目录，不放进上游现有 package 内部 |
| 技能 / agent 配置 | `.agents/skills/`（既有惯例） |
| 文档 | `docs/mae/` + 根 `MAE.md` |

必须修改上游现有文件时三条强制：

1. **登记**：在「五、定制清单」加一行（文件、类型、意图）。
2. **标记**：改动处加 `// mae:` 注释 + 一句中文原因——`git grep -rn "mae:" apps packages` 一秒审全 delta。
3. **薄**：每处尽量 ≤10 行，适配器/注入点式，不内联重写；超长说明该抽独立模块。

两条增量原则：优先用 ZCode 自己的扩展面（plugins / skills / `.agents/`），core 能不动就不动（同 oh-my-pi "Nothing is reserved" 哲学：内置能用扩展 API 实现的就不改内置）；通用性强的修改提 PR 给上游，合入上游即从本仓栈里消失。

## 四、同步上游 runbook（按需，不追 bot 日更；重叠面变大后对齐 v3.x tag）

```bash
jj git fetch --remote upstream         # ≈ git fetch upstream
jj rebase -b mae -d main@upstream      # 整栈重放到新上游头（可带冲突完成，可 op log 撤销）
jj log -r 'conflicts() & mae_custom()' # 列出带冲突的定制提交（无输出 = 零冲突）
# 解冲突：直接在工作副本改文件（jj 已物化 conflict 标记），保存即生效
node scripts/check-workspace-freshness.mjs
pnpm typecheck && pnpm lint            # 语义冲突（文本无冲突但构建挂）的唯一防线
jj git push -b mae                     # 改写后的栈，jj 自动处理非快进推送
git push origin refs/remotes/upstream/main:refs/heads/main  # 建议顺手做：快进 fork 的 main 镜像
```

> `origin/main` **保留不删**：`scripts/check-workspace-freshness.mjs` 整体以 origin/main 为架构基线（落后超阈值直接失败），删了即断。把它维护成"上游同步点镜像"后，GitHub 网页上 `main..mae` 的 diff 就是定制全景，可视化定制清单。

> **AGENTS.md 冲突固定解法（所有权模型）**：`AGENTS.md` 归 mae 所有，同步冲突一律保留我方版本；`upstream-AGENTS.md` 是上游快照，同步时用上游新内容**整体替换**（`git show refs/remotes/upstream/main:AGENTS.md > upstream-AGENTS.md`），替换后 diff 一眼上游是否有实质规则变化。原「例外文件薄改」条款作废。

**切换 merge 模型**（满足铁律 4 信号时，一次性）：

```bash
jj git fetch --remote upstream
jj new mae main@upstream -m "mae: 切换为 merge 同步基线（upstream <短hash>）"
jj bookmark move mae --to @ && jj git push -b mae
# 此后每次同步 = 重复 jj new mae main@upstream（每个冲突区域解一遍最终态）
```

## 五、定制清单（同步解冲突的现场手册，新增定制必须登记）

| 日期 | 文件/位置 | 类型 | 意图与要点 |
| --- | --- | --- | --- |
| 2026-10-21 | `MAE.md`（新增） | 手册 | 本文件：模型/jj 纪律/同步 runbook/定制登记 |
| 2026-10-21 | `AGENTS.md`（改，「核心原则」首条） | 铁律内联 | 三条铁律（工作区/书签+PR/定制隔离）内联+指向本文件；上游若改此文件，同步时整块重放 |
| 2026-10-21 | `.gitattributes`（改，首部 7 行） | 口径 | 全仓文本恒 LF + `.bat/.cmd` CRLF 豁免；根因与双保险见 MAE.md「EOL 口径」 |
| 2026-10-21 | `specs/mae/`（新增目录：README + identity-isolation + feature-gates + versioning-branding） | 规格 | zcode-mae 独立版决策总表（D1–D14）与 P0–P2 规格；行为改动先更新此处 spec（AGENTS.md spec-first 纪律） |
| 2026-10-21 | `AGENTS.md`（改，核心原则首条末尾） | 指针补全 | 补 `specs/mae/` 指向。**AGENTS.md 为例外文件**：为 mae 项目目标可修改，接受同步冲突成本（用户裁决）；触碰照旧在此登记 |
| 2026-10-21 | `docs/mae/agents/`（新增目录：issue-tracker + triage-labels + domain） | 技能配置 | matt-pocock 技能体系的 mae 侧配置：GitHub Issues 跟踪（`gh --repo openaddr/ZCode`，与上游本地 Markdown 约定区分）、五角色标签（已建）、mae 单上下文领域文档（`docs/mae/GLOSSARY.md` + `docs/mae/adr/` 独立编号） |
| 2026-10-21 | `AGENTS.md`（改，末尾追加 Agent Skills 节） | 入口补全 | 指向 `docs/mae/agents/` 三份配置；声明上游 `docs/agents/`、`docs/issues/` 约定不适用于本 fork |
| 2026-10-22 | `.gitattributes`（改，`*.bat`/`*.cmd` 例外口径） | 口径 | jj 按字节快照下 `text eol=crlf` 要求 blob 归一 LF，与上游 CRLF blob 形成永久幻影 M（实锤挡住 affected 脏树门）；改 `-text` 逐字节保真。另：rebase 后 git index 陈旧会造成全树幻影，`rm .git/index && git reset --mixed HEAD` 重建即清 |
| 2026-10-22 | `AGENTS.md`（重写为我方薄宪法层）+ `upstream-AGENTS.md`（新增，85 行上游快照） | 结构变更 | **所有权模型**：AGENTS.md 归 mae（铁律/规则层级/Agent Skills），上游规则降级为快照引用、冲突以我方为准；同步冲突固定解法见「四」runbook，原「例外文件」条款作废 |
