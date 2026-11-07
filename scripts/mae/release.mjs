// mae 发版一条命令:出 Windows 安装包(exe)→ git tag → GitHub Releases(带 exe 资产)。
// 镜像 dafung-web scripts/release.ts 的五道闸,适配 mae 的 jj/Electron 形态:
// 用法:node scripts/mae/release.mjs [--draft] [--dry-run] [--skip-build]
//   --draft      发布为草稿,网页核对后手动 publish
//   --dry-run    只跑前置对账,不构建不发布
//   --skip-build 复用 dist 里已有的对版安装包(gh 步失败重跑用,不重建)
// 前置:①主树运行(workspace 无 .git,git tag 通路不通);②@ 为空停靠且父=mae@origin
//   (树上内容=发布内容);③版本已走前置 PR bump 进 package.json(CalVer);
//   ④gh 已登录(create 步自行响亮报错)。
// 版本对账(#52 构建版本按日期):electron-builder appVersion=构建当日 resolveBuildCalVer,
//   发版须与 bump 同日进行,跨日 appVersion 归 0 即与 tag 错位——latest.yml 对账红出。
// 防挤兑(同 dafung-web 2026-11-01 拍板):tag 查重重号即红;tmp/release.lock 原子锁,
//   撞锁红字让位、持锁超 1h 视为被杀残锁可接管。
// 签名现状:Windows 安装包未签名(electron-builder 无证书配置)——内网自用可装,
//   首启过 SmartScreen 提示「仍要运行」;正式签名配好后在此补签一步。
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { isCalVer } from "./calver.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_DIST = path.resolve(scriptDir, "../../packages/desktop/dist");

/** spawn 包装:inherit=透传给用户看;管道=捕获合并输出。返回 {ok,out}。 */
/** spawn 包装:inherit=透传给用户看;管道=捕获合并输出;extraEnv 追加环境变量。 */
function run(cmd, inherit = false, extraEnv = {}) {
  const proc = spawnSync(cmd[0], cmd.slice(1), {
    stdio: inherit ? "inherit" : "pipe",
    encoding: "utf8",
    ...(Object.keys(extraEnv).length > 0 ? { env: { ...process.env, ...extraEnv } } : {}),
  });
  const out = `${proc.stdout ?? ""}\n${proc.stderr ?? ""}`.trim();
  return { ok: proc.status === 0, out };
}

function red(msg) {
  console.error(`[release] ${msg}`);
  process.exit(1);
}

/** 参数解析:只认 --draft/--dry-run/--skip-build,未知参数红出。导出供单测。 */
export function parseReleaseArgs(args) {
  const known = ["--draft", "--dry-run", "--skip-build"];
  const unknown = args.filter((a) => !known.includes(a));
  if (unknown.length > 0) {
    throw new Error(
      `未知参数 ${unknown.join(" ")}——用法:node scripts/mae/release.mjs [--draft] [--dry-run] [--skip-build]`,
    );
  }
  return {
    draft: args.includes("--draft"),
    dryRun: args.includes("--dry-run"),
    skipBuild: args.includes("--skip-build"),
  };
}

/** 产物定位:dist 里文件名含目标版本的 .exe(排除 .blockmap)应恰有一个。导出供单测。 */
export function findInstallerArtifact(entries, version) {
  return entries.filter(
    (name) => name.toLowerCase().endsWith(".exe") && name.includes(version),
  );
}

/** latest.yml(electron-builder NSIS 更新元数据)抽 version;解析不动返回 null。导出供单测。 */
export function readInstallerVersion(latestYmlText) {
  const match = /^version:\s*(\S+)\s*$/m.exec(latestYmlText ?? "");
  return match ? match[1] : null;
}

export function main(argv) {
  const args = parseReleaseArgs(argv);

  // 1) 主树闸:发版要 git tag + 推 tag。
  if (!existsSync(".git")) red("请在主树运行:发版要 git tag + 推 tag,workspace 无 .git 走不通。");

  // 0) 先 fetch 把 mae@origin 拉新——对旧基线打 tag = 发出旧代码。
  const fetched = run(["jj", "git", "fetch"]);
  if (!fetched.ok) red(`jj git fetch 失败:${fetched.out}`);

  // 2) 停靠位闸:@ 空、父=mae@origin,树上内容才等于发布内容。
  const maeId = run(["jj", "log", "-r", "mae@origin", "--no-graph", "-T", "commit_id"]).out;
  if (maeId.length !== 40) red(`mae@origin 解析异常:${maeId}`);
  const atEmpty = run(["jj", "log", "-r", "@", "--no-graph", "-T", 'if(empty, "empty", "dirty")']).out;
  const parentId = run(["jj", "log", "-r", "@-", "--no-graph", "-T", "commit_id"]).out;
  if (atEmpty !== "empty")
    red("@ 非空——发布内容=树上内容,先清空 @(收账走 jj new mae@origin,残留先清掉)。");
  if (parentId !== maeId) {
    red(
      `@ 父(${parentId.slice(0, 9)})不是 mae@origin(${maeId.slice(0, 9)})——先收账对齐基线(jj new mae@origin)。`,
    );
  }

  // 3) 版本与远端 tag 查重(版本单源 package.json,bump 前置 PR 已合入;重号即红)。
  const { version } = JSON.parse(readFileSync("package.json", "utf8"));
  if (!isCalVer(version))
    red(`package.json version=${version} 不是 CalVer——发版前置 PR 先 bump(语义见 scripts/mae/calver.mjs)。`);
  const tag = `v${version}`;
  const remoteTag = run(["git", "ls-remote", "origin", `refs/tags/${tag}`]);
  if (!remoteTag.ok) red(`git ls-remote 失败:${remoteTag.out}`);
  if (remoteTag.out) red(`远端已有 ${tag}——发版前置 PR 先 bump package.json version 再发。`);
  console.log(
    `[release] 发布目标 mae@origin=${maeId.slice(0, 9)} tag=${tag}${args.draft ? " (draft)" : ""}${args.skipBuild ? " (skip-build,复用已有产物)" : ""}${args.dryRun ? " (dry-run,到此为止)" : ""}`,
  );
  if (args.dryRun) return;

  // 3.5) 发版锁(防并行会话挤兑出包):tmp/release.lock mkdir 原子锁。持锁超 1h 视为
  //    被杀残锁可接管——接管正是残锁的归宿而非吞错;exit handler 统一解锁(kill -9 才留残锁)。
  const LOCK_DIR = path.resolve("tmp/release.lock");
  const STALE_MS = 60 * 60 * 1000;
  if (existsSync(LOCK_DIR)) {
    let startedAt = 0;
    try {
      startedAt = Number(readFileSync(path.join(LOCK_DIR, "started-at"), "utf8"));
    } catch {
      startedAt = 0;
    }
    if (Date.now() - startedAt < STALE_MS) {
      red(
        `发版锁被占用(tmp/release.lock${startedAt ? `,起始 ${new Date(startedAt).toISOString()}` : ""})——另一会话发版进行中,本次变更滚入下一版勿抢;锁超 1h 视为残锁,删 tmp/release.lock 接管。`,
      );
    }
    console.log("[release] 发版锁超 1h 视为被杀残锁,接管。");
  }
  mkdirSync(LOCK_DIR, { recursive: true });
  writeFileSync(path.join(LOCK_DIR, "started-at"), String(Date.now()));
  process.on("exit", () => {
    try {
      rmSync(LOCK_DIR, { recursive: true, force: true });
    } catch {
      // exit handler 内不可抛(会吞退出码):解锁失败留残锁,1h 后自动可接管
    }
  });
  // 锁内重查 tag(拿锁前的查重结论会过期:并行发版可能刚把它发掉)
  const remoteTagRe = run(["git", "ls-remote", "origin", `refs/tags/${tag}`]);
  if (!remoteTagRe.ok) red(`git ls-remote 失败:${remoteTagRe.out}`);
  if (remoteTagRe.out)
    red(`远端已有 ${tag}(拿锁前查重后被并行会话发掉)——发版前置 PR bump package.json version 再发。`);

  // 4) 出包/对版(--skip-build 跳过构建只做对版:gh 步失败重跑不重建)。发版与 bump
  //    必须同日:resolveBuildCalVer 跨日把 PATCH 归 0,appVersion 即与 tag 错位——对账红出。
  if (!args.skipBuild) {
    // 发版档位固化 ZCODE_ENV=production:缺省后端轴解析为 test,产物名带 _TEST 后缀
    // (D14/2026-10-23 盘点)——Release 资产要干净文件名,发布政策固化进脚本(dafung-web #1060 同例)。
    // tar 钉到 System32 bsdtar:node→pnpm.cmd spawn 链解析到的 GNU tar 无 MSYS 盘符语义,
    // `tar -xzf C:/...` 被当远程主机 C: 报 "Cannot connect to C:"(2026-11-07 首版实录);
    // bsdtar 原生认盘符(上游 CI windows-latest 即此解析),放 PATH 最前确保先命中。
    const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "Path";
    const system32 = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32");
    const build = run(["node", "packages/desktop/scripts/bundle.mjs", "--os", "win", "--arch", "x64"], true, {
      ZCODE_ENV: "production",
      [pathKey]: `${system32};${process.env[pathKey] ?? ""}`,
    });
    if (!build.ok)
      red("bundle.mjs 出包失败——上方输出看构建报错(旧 win-unpacked 锁可删 packages/desktop/dist 重跑)。");
  }
  const distEntries = existsSync(DESKTOP_DIST) ? readdirSync(DESKTOP_DIST) : [];
  const installers = findInstallerArtifact(distEntries, version);
  if (installers.length !== 1) {
    red(
      `dist 里版本含 ${version} 的安装包应恰有一个,实得 ${installers.length} 个:${installers.join(" ") || "(无)"}——产物陈旧先清 packages/desktop/dist,或版本未 bump 对齐。`,
    );
  }
  const latestYml = path.join(DESKTOP_DIST, "latest.yml");
  if (!existsSync(latestYml)) red(`dist 缺 latest.yml(NSIS 元数据)——出包不完整,重建。`);
  const artifactVersion = readInstallerVersion(readFileSync(latestYml, "utf8"));
  if (artifactVersion !== version) {
    red(
      `版本对账失败:latest.yml version=${artifactVersion} ≠ package.json ${version}——发版跨日(appVersion 归 0)或产物陈旧;跨日则把 bump 滚到当日重走前置 PR。`,
    );
  }
  const asset = path.join(DESKTOP_DIST, installers[0]);

  // 5) tag + 推远端(幂等:同指已存在跳过;异指红出人工核对)。tag 指 mae@origin,
  //    即前置 PR 合入后的提交。
  const localTag = run(["git", "rev-parse", "-q", "--verify", `refs/tags/${tag}^{commit}`]);
  if (localTag.ok && localTag.out !== maeId) {
    red(
      `本地 ${tag} 已存在且指向 ${localTag.out.slice(0, 9)} ≠ ${maeId.slice(0, 9)}——人工核对后删重打。`,
    );
  }
  if (!localTag.ok && !run(["git", "tag", tag, maeId]).ok) red("git tag 失败。");
  // --no-verify:husky pre-push 钩子的 test:engineering:affected --scope push 要解析
  // origin/staging 基线——上游 ZCode 分支,mae fork 没有,钩子在结构上过不了(2026-11-07
  // 首版实录);tag 推送不带新代码,所指提交已经过 PR 门+本地 typecheck/lint/affected。
  if (!run(["git", "push", "--no-verify", "origin", `refs/tags/${tag}`], true).ok) {
    red("推 tag 失败——修好网络/权限重跑(已做步骤幂等跳过)。");
  }

  // 6) 发 Release(--generate-notes 按提交史生成 body;润色走 gh release edit)。
  //    --repo 从 origin 显式解析:gh 全局 default 可能指别处(2026-11-07 首版实录——
  //    本机 gh default=zai-org/ZCode 上游仓,--verify-tag 靠 tag 不在那边拦下了一场误发)。
  const originUrl = run(["git", "remote", "get-url", "origin"]).out;
  const repoSlug = originUrl.replace(/^.*github\.com[:/]/, "").replace(/\.git$/, "");
  if (!/^[\w.-]+\/[\w.-]+$/.test(repoSlug))
    red(`origin 仓库解析不动(${originUrl})——人工核对后传参重试。`);
  const ghArgs = [
    "gh", "release", "create", tag, asset,
    "--repo", repoSlug,
    "--verify-tag", "--generate-notes", "--title", tag,
  ];
  if (args.draft) ghArgs.push("--draft");
  const created = run(ghArgs, true);
  if (!created.ok)
    red(`gh release create 失败——若 Release 已存在,gh release view ${tag} 核对后手动补资产或删了重跑。`);
  console.log(
    `[release] 完成:${tag} 已发布,资产 ${installers[0]}(未签名,首启过 SmartScreen「仍要运行」);标题/notes 可 gh release edit 润色。`,
  );
}

// 主模块守卫(bundle.mjs 同款):被测试 import 时不执行闸序列。
const entryHref = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryHref === import.meta.url) main(process.argv.slice(2));
