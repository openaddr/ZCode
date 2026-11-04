# mae fork 同步与 jj 运维手册

> 上游 `upstream` = zai-org/ZCode(main 由 Sync Bot **每日 squash 发布**,无细粒度历史,tag 如 v3.15.1 是稳定锚点)。
> 本仓 `origin` = openaddr/ZCode,唯一主干 = **mae**。工具 = jj(colocated,`.jj` 与 `.git` 共存,git 仅作逃生舱)。
> 模型:**mae = 定制提交栈 + 每次同步新增一个 merge 提交(merge 基线模式,2026-11-04 起;切换实录与回退配方见「6」)**。本手册是同步解冲突的现场手册与全部命令配方的唯一事实源;定制触碰台账在 [customization-registry.md](customization-registry.md)。

## 1. 模型与铁律

```
U1───U2───U3───U4              main@upstream(每日 squash 前进;只读地基,永不本地提交)
 │         ╲   ╲
 C1─C2─C3──M1──M2              mae = 定制栈(C*)+ 同步 merge 提交(M);M 每次落在最新上游头
```

1. 不建本地 `main` 分支;上游引用一律写 `main@upstream`。
2. 同步 = `fetch + jj new mae main@upstream`(新增 merge 提交,每个冲突区域解一遍最终态);不 rebase 整链重放、不手工复制上游文件(那是上游 bot 的活)。
3. 定制隔离遵守「附录」——新增文件优先。
4. 模型切换信号(2026-11-04 实锤触发,已切换 merge 基线):连续两三次同步同一批文件反复冲突,单次解冲突超约 30 分钟;栈中直接改动上游文件的提交超过约 10 个(切换时实测:45 个定制提交,约 40 个触碰上游文件,其中约 30 个为删除/修改类)。

## 2. jj 日常纪律(0.45 实踩,借鉴 dafung-web「版本协作」经验)

- **并行隔离(最重要)**:任何写盘改动先 `jj workspace add ../zcode-ws-<代号>` 开工作区,建后 `jj new mae` 起基(勿照主树停靠的 `@` 起基,它可能落后);在 workspace 内干活与交付。主树 `@` 只读停靠,发现 `@` 有非自己生产的内容 = 让位勿盖——jj 快照会把并行写入折进你的提交(本仓多次实锤)。谁建谁清:`jj workspace forget <名>` + 删目录。
- **交付三步**:`jj describe -m "<type>(<scope>): 中文描述"` → `jj bookmark create/move` → `jj git push --bookmark <名>`。**push 过的 change 视为只读**,续活先 `jj new` 起新票。
- **PR 收账(GitHub squash 合入后)**:`jj git fetch` → `jj bookmark move mae --to mae@origin` → `jj new mae` 停靠。本地 `mae` 与旧 `mae@origin` 同位时 fetch 自动快进,move 是幂等保险;本地已领先/分叉时 squash 产生"同树不同身份"的新提交,**必须显式 move 承认远端为准**——不 move 的后果:mae_custom() 读旧栈、下次 push 被安全检查挡住、log 永远双位置。
- **push 前两查**:`jj diff --stat` 文件集与预期一致(多出的文件 = 被并行折入,先 `jj split <paths>` 拆分再推);`pnpm verify:pre-push` 手动跑——jj 不执行 git hooks,而本仓 husky pre-push 对 `git push` 逃生舱生效,其中 `test:unit:affected` **拒绝脏工作区**(并行写入滞留时必被挡)。
- **rebase 前后两查**:前 `jj workspace update-stale`(stale 副本上 rebase 静默不生效);后 `jj log -r @-` 回读父链确认落位。
- **diff / 文件提取端点认 change-id 不认 git hash**(快照会重写 hash,拿旧 hash 会提出旧版内容)。
- **兜底**:`jj op log` 全量可撤销;git 对象库是最后保险(`git show <hash>` 验内容、`git checkout <hash> -- <file>` 捞回)。
- 话术:`jj git init --colocate` 报 "target repo already exists" 但实际成功,以 `jj log` 为准,勿重复 init。
- **EOL 口径(全仓文本恒 LF,2026-10-21 实锤换来的)**:Windows autocrlf 检出 CRLF × jj 按原始字节快照 = 全树 15146 文件、305 万行的幻影 diff。修法三件套:`.gitattributes` 首部 `* text=auto eol=lf`(随仓库分发,治本)+ jj `working-copy.eol-conversion = input`(快照侧)+ repo 局部 `git config core.autocrlf false`(本机检出侧);`.bat/.cmd` 以 `-text` 逐字节保真(2026-10-22 定稿,理由见台账)。**renormalize 顺序铁律:先落盘后改属性文件**——`git checkout-index -f -a` 会用旧索引覆盖刚改过的 `.gitattributes`;jj 侧等价落盘用 `jj restore`。
- 本仓 repo 级配置**存于用户目录(Windows:`AppData/Roaming/jj/repos/<id>/config.toml`)而非 `.jj` 内——机器本地、不随克隆迁移**。当前值:`trunk() = main@upstream`、`mae_custom() = main@upstream..mae`、`immutable_heads() = main@upstream | main@origin | tags()`、`snapshot.max-new-file-size = 5MiB`、`working-copy.eol-conversion = input`。新机器/重新克隆后按此重放:

  ```bash
  jj bookmark track mae@origin
  jj config set --repo 'revset-aliases."mae_custom()"' 'main@upstream..mae'
  jj config set --repo 'revset-aliases."immutable_heads()"' 'main@upstream | main@origin | tags()'
  jj config set --repo snapshot.max-new-file-size 5242880
  jj config set --repo working-copy.eol-conversion input
  git config core.autocrlf false
  ```

## 3. 交付与验证流水线(2026-10-22 实锤沉淀)

```bash
jj describe -m "..."          # 1. 描述
jj new                        # 2. 空停靠:让 git HEAD 对齐提交树,否则 affected 脏树门必挡
pnpm verify:pre-push          # 3. 验证(见下方基线说明)
jj git push -b <书签>          # 4. 推送
```

- **affected 基线**:本 fork 无 `origin/staging`(上游 CI 分支),push scope 会报错——一律显式 `pnpm test:unit:affected --scope push --base origin/mae`。
- **workspace 分工**:workspace 无 `.git`,`architecture:check` / `test:unit:affected` 等 git 集成脚本在里面必炸。workspace 只跑 `typecheck`/`lint`;git 类校验回主树检出书签(`jj new <书签>`)后跑。
- **affected 选择器命中全量套件时会"跳过执行"**——那不是通过。以定向 `pnpm vitest run <涉改测试文件>` 作为真实执行证据。
- **绿灯前先断言改动在树上**:跑测试前 `test -f <新文件>` 确认检出的是目标提交(停错树跑出的绿是假绿,2026-10-22 险情)。
- **PR 合入后必须补跑合并区间单测**:每张 PR 独立验证 ≠ 组合体验证——squash 合入后对合并区间跑定向 vitest。2026-10-22 实锤:#15 组合体带着 4 个 session-share gate 失败上树,直到 #10 agent 实测才暴露(合并后只跑了 typecheck/lint 的缺口)。

## 4. 冲突与救援(2026-10-22 实锤沉淀)

- **解冲突确定法**:`jj edit <书签>` 直接进提交本体,工作区改文件即 snapshot 进该提交,`jj new` 离开。勿走 `jj squash` 中转——squash 只进最近父提交,夹层空提交会吃掉解冲突内容(三轮回滚实锤)。
- **jj 冲突标记全家族**:`<<<<<<<`、`>>>>>>>`、`%%%%%%%`(diff from)、`+++++++`(多侧分隔行)、`\\\\\\\`(context)。清除脚本必须覆盖全部——漏掉 `++++` 侧分隔行会把垃圾行带进合并结果(#15/#16 各实锤一次)。
- **jj log 机器解析必带 `--no-graph`**(2026-11-04 实锤):图示前缀(`×  `/`○  `)混在行首会让 `grep '^[a-z0-9]'` 类解析永远空匹配——自动循环空转 50 轮还给出假"清零"结论;冲突清零必须双确认(`jj resolve --list` + 全仓标记扫描),勿只信脚本自查。
- **内容提取禁 `2>&1`**(2026-11-04 实锤):`jj file show … > f 2>&1` 会把 stderr(如 "Rebased N descendant commits…")灌进提取物首行,再落盘即污染仓库;typecheck 不覆盖的文件要靠 lint 的 parse error 兜底才拦住(vitest.config.ts 实锤)。
- **git index 陈旧幻影**:rebase 后 git status 报上万假 M 时,`rm .git/index && git reset --mixed HEAD` 重建即清(内容零风险)。
- **abandon 纪律**:禁止盲跑、禁止吞 stderr 的 `jj abandon @-`——2026-10-22 实锤把本地 mae 尖 abandon 掉。书签因此丢失时零恐慌:远端是真相之源,`jj bookmark set <名> -r <名>@origin` 重建 + `jj bookmark track` 即恢复。

## 5. agent 接管配方(后台实现者中断/限额死亡后)

1. **先查证再判死**:`jj workspace list` + 逐 workspace `jj st` 看进度——agent 长时间无产出可能只是处在读规格/探索阶段(#8 被误判死亡实锤)。
2. **收尾路径**:workspace 内 `typecheck`/`lint` → 主树检出其书签跑 git 类校验与定向测试 → `jj describe`/书签/推送/PR。
3. **workspace 谁建谁清**:内容全部进入书签后 `jj workspace forget <名>` + 删目录。

## 6. 同步上游 runbook(merge 基线,2026-11-04 起;按需,不追 bot 日更,对齐 v3.x tag)

```bash
jj git fetch --remote upstream         # ≈ git fetch upstream,确认 main@upstream 前进
jj new mae main@upstream -m "chore(mae): 同步上游 <tag/短hash>"   # 新增 merge 提交,@ 即其本体
# 解冲突:已物化到工作区,直接改文件(保存即 snapshot);每个冲突区域只解一遍最终态。
# 删除/修改类恒定「保留删除」;AGENTS.md 用下方固定解法。
node scripts/check-workspace-freshness.mjs
pnpm install                           # 大版本跳跃后先装再诊断——本机依赖落后上游声明版本会制造假类型错(2026-11-04 实锤:electron 41 vs 声明 44,5 个假 TS 错装完即消)
pnpm typecheck && pnpm lint            # 语义冲突(文本无冲突但构建挂)的唯一防线
# 门 1:jj 冲突标记全家族残留扫描(必须零输出;--untracked 必带——jj 会 snapshot 未跟踪文件;pattern 带上下文词,不误伤本手册正文)
git grep --untracked -nE '^(<{7}|>{7}) conflict|^%{7} diff from:|^\+{7} [a-z0-9]|^\\{7} '
# 门 2:vitest 冒烟——测试管线活着(unit 项目 include 与 ui 定向各验一面;勿指 DTS 组件测试,见 issue「DTS 组件测试缺 testing-library 依赖从未运行」)
pnpm vitest run scripts/mae packages/ui/test/maeFeatureGates.test.ts
jj git push -b mae                     # merge 提交随书签推送
git push --no-verify origin refs/remotes/upstream/main:refs/heads/main  # 快进 fork 的 main 镜像(husky 对纯引用推送误挡,--no-verify 是正解非绕行)
```

**机械收尾独立成票**:与解冲突无关的机械产物作 @ 的子提交单独 describe 随 mae 推送,并在 [customization-registry.md](customization-registry.md) 登记。已知一例:上游 `pnpm-lock.yaml` 可能不自洽(bot squash 固疾,2026-11-04 实锤 `pnpm install --frozen-lockfile` 直接报 badly resolved),此时用 install 重生成 lock(如"chore(mae): 上游同步收尾——pnpm-lock 重生成");根 `package-lock.json` 是手工 npm 镜像(install 不触碰),CalVer 版本随 #20 手改。

> `origin/main` **保留不删**:`scripts/check-workspace-freshness.mjs` 整体以 origin/main 为架构基线(落后超阈值直接失败),删了即断。把它维护成"上游同步点镜像"后,GitHub 网页上 `main..mae` 的 diff 就是定制全景。

> **AGENTS.md 冲突固定解法(所有权模型)**:`AGENTS.md` 归 mae 所有,同步冲突一律保留我方版本;`upstream-AGENTS.md` 是上游快照,同步时用上游新内容**整体替换**(`git show refs/remotes/upstream/main:AGENTS.md > upstream-AGENTS.md`),替换后 diff 一眼上游是否有实质规则变化。

**回退选项(rebase 模型,模型 B)**:merge 模式出现意外时,`jj rebase -b mae -d main@upstream` 仍是可用逃生舱(整栈重放,可带冲突完成,可 op log 撤销;冲突清单 `jj log --no-graph -r 'conflicts() & mae_custom()'`)。代价 = 同步成本 ≈ 栈深度 × 重叠面,随栈增长单调变贵(v3.15→v3.17.2 实录:44 提交栈产生 33 个冲突提交,级联把 12 处真冲突膨胀为 33 次往返;约 40 个提交触碰上游文件,超铁律 4 阈值 3 倍)——这正是 2026-11-04 改用 merge 基线的原因。merge 模式下 merge 提交之前的中间提交不保证可独立构建,fork 无 bisect 需求,可接受。

## 7. fork 环境差异(新机器/新会话必读)

| 差异 | 影响 | 对策 |
| --- | --- | --- |
| `gh` 默认解析到 upstream(zai-org/ZCode,无写权限) | label/issue/PR 操作 404 | 一律 `gh --repo openaddr/ZCode` |
| 无 `origin/staging` 分支 | affected push scope 报错 | `--base origin/mae`(见「3」) |
| mise 安装的 pnpm 是独立 exe,无 `pnpm.cmd` | bootstrap/构建脚本在 Windows 必炸 | mise node 下 `npm i -g pnpm@10.33.2` 生成 pnpm.cmd(版本随 mise.toml) |
| 上游 blob 与本仓 EOL 属性的历史错位 | 幻影 M / 脏树门 | 见「2」EOL 口径与「4」index 重建 |

## 附录:定制隔离规则(业界三流派,本仓取组合)

| 流派 | 代表 | 做法 | 本仓采用 |
| --- | --- | --- | --- |
| 集中补丁 | patch-package / quilt(oh-my-pi 的 `patches/`) | 钉版本最小补丁集中一目录 | 借鉴其"补丁思维":改上游文件的每处都薄、登记、可审 |
| 平行结构 | oh-my-pi 主体、OpenSearch | 只新增自己的 crates/packages,不改上游文件,放弃细粒度同步 | **新增文件永不冲突是第一原则**;定制代码进新目录/新 package |
| 散布+标记 | Chromium(`CHROMIUM:` 前缀)、Android vendor | 改上游文件处注释标记 + 提交规范审计 | 采用 `// mae:` 标记 + [台账](customization-registry.md)登记 |

目录约定:

| 类型 | 位置 |
| --- | --- |
| 定制代码 | 新 package(如 `packages/mae-*/`)或独立目录,不放进上游现有 package 内部 |
| 技能 / agent 配置 | `.agents/skills/`(既有惯例)与 `docs/mae/agents/` |
| 文档 / 规格 / 手册 / 台账 | `docs/mae/` 与 `specs/mae/` |

必须修改上游现有文件时三条强制:

1. **登记**:在 [customization-registry.md](customization-registry.md) 加一行(文件、类型、意图)。
2. **标记**:改动处加 `// mae:` 注释 + 一句中文原因——`git grep -rn "mae:" apps packages` 一秒审全 delta(JSON 等无法注释的文件以台账登记代替)。
3. **薄**:每处尽量 ≤10 行,适配器/注入点式,不内联重写;超长说明该抽独立模块。

两条增量原则:优先用 ZCode 自己的扩展面(plugins / skills / `.agents/`),core 能不动就不动;通用性强的修改提 PR 给上游,合入上游即从本仓栈里消失。
