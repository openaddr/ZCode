#!/usr/bin/env node
// mae: audit:mae-user-paths——HOME 直拼产品命名空间(~/.zcode)散点扫描器(#26,#23 收口票的门禁)。
//
// 扫描面:apps/zcode-cli/packages/<pkg>/src 与 packages/<pkg>/src 下的源码文件(测试文件与非 src 目录不扫)。
// 扫描模式(HOME 直拼 .zcode 产品命名空间):
//   1. bare-homedir-join  join(homedir(), ".zcode", ...)——上游新散点的典型形态
//   2. home-var-join      join(<home 变量>, ".zcode", ...)——home/homeDir/homePath/userHome/userHomeDir/zcodeHome 首参
//   3. first-segment-join join(".zcode", ...)——".zcode" 首段相对 join(含 posix.join),出现即需解释收集根
//   4. tilde-literal      整串 "~/.zcode..." 字面量默认值(注释与提示文案不扫)
//
// 语义放行(已挂接形态,不算违规):
//   - 环境轴兜底:X || join(homedir(), ".zcode") / ZCODE_* 覆盖变量出现在同语句窗口——mae 桌面注入
//     ZCODE_STORAGE_DIR/ZCODE_SESSION_DB_PATH/ZCODE_DATA_BASE_DIR 等后该 join 仅官方路径触达
//   - mae 身份路由:窗口内出现 ZCODE_PRODUCT_FLAVOR/getZCodeDataRootDir/resolveMae*/setDataBaseDir/mae: 标记
//   - 参数/配置优先:?? 与三元兜底(override-first,join 只是 fallback 分支)
//   - resolver 首参:join(resolveXxx(...), ".zcode")——"先解析再 join",不构成候选
//   - 项目级 join:join(workingDirectory/workspace/cwd..., ".zcode")——首参非 HOME,不构成候选
//
// 范围外(有意,见 specs/mae D3 有意共享清单):.claude / .claude.json 跨工具导入(Claude 命名空间,
// 非本产品命名空间);项目级 .zcode(workspace 参数);.zcode-plugin/.zcode-beta/.zcode-mae 等异名字面量。
// 已知局限:动态段展开(join(base, ...segments))与 shell 字符串 "$HOME/.zcode" 不在本扫描器模式内
// (#31 边界核实:动态段代表 mcpUserDirectory 已挂 ZCODE_DESKTOP_HOME_DIR 收口;shell 串全部为远程主机轴
// ($HOME/.zcode/server,在远端 HOME 解析)或官方身份工具脚本(doctor/installer),无本机 mae 实体)。
//
// 白名单(WHITELIST)与 specs/mae 豁免清单同源,四组:
//   intentional-share 有意共享 / hooked-elsewhere 官方默认轴已由 env/身份注入收口 /
//   remote-host-path 远程主机轴(在其 HOME 解析,不落本机)/ known-leftover 漏网登记(ratchet;
//   #31 收口后清空,自测断言空组,新漏网须显式登记)。
// 命中白名单外 → 非零退出,列出 文件:行:片段。

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";

const repoRoot = resolve(import.meta.dirname, "..");
const selfPath = "scripts/audit-mae-user-paths.mjs";

const DEFAULT_ROOTS = ["apps/zcode-cli/packages", "packages"];

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);

const ALWAYS_SKIPPED_SEGMENTS = new Set([
  ".git",
  "node_modules",
  "dist",
  "out",
  "build",
  "coverage",
  ".turbo",
  ".vite",
  "__tests__",
  "bundled-agents",
  "bundled-resources",
]);

const HOME_VAR_FIRST_ARG = "home|homeDir|homePath|userHome|userHomeDir|userHomePath|zcodeHome";

const CANDIDATE_PATTERNS = [
  { kind: "bare-homedir-join", regex: new RegExp(String.raw`join\(\s*homedir\(\)\s*,\s*["']\.zcode["']\s*,`, "u") },
  { kind: "home-var-join", regex: new RegExp(String.raw`join\(\s*(?:${HOME_VAR_FIRST_ARG})\s*,\s*["']\.zcode["']\s*,`, "u") },
  { kind: "first-segment-join", regex: new RegExp(String.raw`join\(\s*["']\.zcode["']\s*,`, "u") },
  { kind: "tilde-literal", regex: /["']~\/\.zcode(?:\/[a-zA-Z0-9._-]+)*["']/u },
];

// 语义放行标记(同语句窗口内出现即视为已挂接形态)。
const ENV_AXIS_MARKER = /ZCODE_[A-Z][A-Z0-9_]{3,}/u;
const MAE_ROUTE_MARKER =
  /ZCODE_PRODUCT_FLAVOR|getZCodeDataRootDir|getZCodeHomeRootDir|resolveMae[A-Z]\w*|resolveBootstrapHomePath|setDataBaseDir|getDataBaseDir|\bmae:/u;
const FALLBACK_SHAPE_BEFORE = /\|\||\?\?|\?\s/u;

const WINDOW_BEFORE = 3;
const WINDOW_AFTER_MULTILINE = 2;

/**
 * 白名单:与 specs/mae/identity-isolation.md D3 有意共享清单同源。
 * intentional-share = 有意共享;hooked-elsewhere = 官方默认轴,mae 侧由 env/身份注入收口;
 * remote-host-path = 远程主机轴(~/ 在远程主机 HOME 解析,不落本机 ~/.zcode);
 * known-leftover = 漏网登记(修复后删除条目,ratchet 收紧;#31 七项收口后保持清空,自测断言空组)。
 */
export const WHITELIST_GROUPS = [
  "intentional-share",
  "hooked-elsewhere",
  "remote-host-path",
  "known-leftover",
];

export const DEFAULT_WHITELIST = [
  {
    id: "mae-share-agent-log",
    group: "intentional-share",
    pattern: /^apps\/zcode-cli\/packages\/adapters\/src\/logging\/index\.ts$/u,
    reason: "agent 日志目录(append 型诊断流,有意共享,#23 豁免清单)",
  },
  {
    id: "mae-share-model-rollout",
    group: "intentional-share",
    pattern: /^apps\/zcode-cli\/packages\/adapters\/src\/model\/runner-debug\.ts$/u,
    reason: "模型轨迹 rollout/debug(有意共享,#23 豁免清单)",
  },
  {
    id: "mae-share-commands-service",
    group: "intentional-share",
    pattern: /^packages\/services\/src\/commands\//u,
    reason: "自定义命令目录共享(commandsService,#23 豁免清单)",
  },
  {
    id: "mae-share-memory-service",
    group: "intentional-share",
    pattern: /^packages\/services\/src\/memory\//u,
    reason: "用户记忆接口共享(~/.claude/memory,#23 豁免清单)",
  },
  {
    id: "mae-share-model-trajectory-read",
    group: "intentional-share",
    pattern: /^packages\/services\/src\/zcode-agent\/modelTrajectoryFileTail\.ts$/u,
    reason: "模型轨迹读取端,与 runner-debug 写入端同一豁免(#23 模型轨迹 rollout)",
  },
  {
    id: "mae-share-commands-path-hint",
    group: "intentional-share",
    pattern: /^packages\/ui\/src\/settings\/commandsSettingsShared\.ts$/u,
    reason: "命令目录共享的设置页路径提示文案,与 commandsService 同源(#23)",
  },
  {
    id: "mae-share-onboarding-usage-evidence",
    group: "intentional-share",
    pattern: /^packages\/services\/src\/onboarding\/localUsageEvidence\.ts$/u,
    reason: "onboarding 本机使用证据刻意只读官方 CLI 会话库(env 轴注入时跟随 agent 轴)",
  },
  {
    id: "mae-hooked-session-db-default",
    group: "hooked-elsewhere",
    pattern: /^apps\/zcode-cli\/packages\/adapters\/src\/storage\/session-store\/paths\.ts$/u,
    reason: "会话 DB 官方默认路径;mae 桌面注入 ZCODE_SESSION_DB_PATH 落 mae 根(#24 补遗)",
  },
  {
    id: "mae-hooked-contracts-storage-default",
    group: "hooked-elsewhere",
    pattern: /^apps\/zcode-cli\/packages\/contracts\/src\/config\/index\.ts$/u,
    reason: "storage 默认 ~/ 值属官方 CLI 语义;mae 消费端经 env 轴收口(#24)",
  },
  {
    id: "mae-hooked-export-logs-segments",
    group: "hooked-elsewhere",
    pattern: /^packages\/desktop\/src\/main\/exportLogs\.ts$/u,
    reason: "相对段常量;收集根经 mae 三元(getZCodeDataRootDir)随数据根(#24)",
  },
  {
    id: "mae-remote-prompt-attachments",
    group: "remote-host-path",
    pattern: /^packages\/desktop\/src\/host\/remotePromptAttachments\.ts$/u,
    reason: "远程附件物化根,~/ 在远程主机 HOME 解析,不落本机 ~/.zcode",
  },
  {
    id: "mae-remote-server-base",
    group: "remote-host-path",
    pattern: /^packages\/server\/src\/remote\/deployShared\.ts$/u,
    reason: "远程部署基座 ~/.zcode/server,远程主机 HOME 轴",
  },
  {
    id: "mae-remote-source-server-read",
    group: "remote-host-path",
    pattern: /^packages\/server\/src\/source-server\/transportAdapter\.ts$/u,
    reason: "source-server 远程读路径 ~/.zcode/server,远程主机 HOME 轴",
  },
];

function toPosixPath(path) {
  return path.split(sep).join("/");
}

function isTestPath(relativePath) {
  return /(^|\/)(test|tests|__tests__)(\/|$)/u.test(relativePath) ||
    /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(relativePath);
}

function shouldSkipSegments(relativePath) {
  return relativePath.split("/").some((segment) => ALWAYS_SKIPPED_SEGMENTS.has(segment));
}

function isSourceFile(relativePath) {
  const extension = /\.[^.]+$/u.exec(relativePath)?.[0];
  return extension ? SOURCE_EXTENSIONS.has(extension) : false;
}

function* walkSources(absoluteDir, repoRoot) {
  if (!existsSync(absoluteDir)) {
    return;
  }
  for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
    const absolutePath = resolve(absoluteDir, entry.name);
    if (entry.isDirectory()) {
      yield* walkSources(absolutePath, repoRoot);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const relativePath = toPosixPath(relative(repoRoot, absolutePath));
    if (relativePath === selfPath || shouldSkipSegments(relativePath) || isTestPath(relativePath)) {
      continue;
    }
    if (!isSourceFile(relativePath)) {
      continue;
    }
    yield { absolutePath, relativePath };
  }
}

/** 每个扫描根只进 <pkg>/src 子树(扫描面定义见文件头)。 */
function* scanRoot(rootDir, repoRoot) {
  if (!existsSync(rootDir)) {
    return;
  }
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const srcDir = resolve(rootDir, entry.name, "src");
    if (!existsSync(srcDir) || !statSync(srcDir).isDirectory()) {
      continue;
    }
    yield* walkSources(srcDir, repoRoot);
  }
}

function isCommentOnlyLine(line) {
  const trimmed = line.trimStart();
  return trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
}

function detectCandidates(lines) {
  const candidates = [];
  const homedirEol = new RegExp(String.raw`homedir\(\)\s*,\s*$`, "u");
  const homeVarEol = new RegExp(String.raw`(?:${HOME_VAR_FIRST_ARG})\s*,\s*$`, "u");
  const zcodeFirstSegmentNext = /^\s*["']\.zcode["']\s*,/u;

  for (const [index, line] of lines.entries()) {
    let matched = false;
    for (const { kind, regex } of CANDIDATE_PATTERNS) {
      if (kind === "tilde-literal" && isCommentOnlyLine(line)) {
        continue;
      }
      const match = regex.exec(line);
      if (!match) {
        continue;
      }
      candidates.push({ line: index + 1, kind, column: match.index, multiline: false });
      matched = true;
      break;
    }
    if (matched) {
      continue;
    }
    // 多行 join 形态:homedir()/home 变量收尾,后 1-2 行是 ".zcode" 首段。
    if (homedirEol.test(line) || homeVarEol.test(line)) {
      const kind = homedirEol.test(line) ? "bare-homedir-join" : "home-var-join";
      const lookahead = lines.slice(index + 1, index + 1 + WINDOW_AFTER_MULTILINE);
      if (lookahead.some((nextLine) => zcodeFirstSegmentNext.test(nextLine))) {
        candidates.push({ line: index + 1, kind, column: 0, multiline: true });
      }
    }
  }
  return candidates;
}

function isSemanticallyHooked(lines, candidate) {
  const start = Math.max(0, candidate.line - 1 - WINDOW_BEFORE);
  const end = Math.min(
    lines.length,
    candidate.line + (candidate.multiline ? WINDOW_AFTER_MULTILINE : 0),
  );
  const windowLines = lines.slice(start, end);
  const windowText = windowLines.join("\n");
  if (ENV_AXIS_MARKER.test(windowText) || MAE_ROUTE_MARKER.test(windowText)) {
    return true;
  }
  // 兜底形态:候选之前的语句文本里出现 || / ?? / 三元 ?
  const currentLine = lines[candidate.line - 1] ?? "";
  const prefix = currentLine.slice(0, candidate.column);
  if (FALLBACK_SHAPE_BEFORE.test(prefix)) {
    return true;
  }
  const preceding = windowLines.slice(0, Math.max(0, windowLines.length - 1)).join("\n");
  return FALLBACK_SHAPE_BEFORE.test(preceding);
}

function matchWhitelist(relativePath, whitelist) {
  return whitelist.find((entry) => entry.pattern.test(relativePath));
}

function previewLine(line) {
  return line.trim().slice(0, 180);
}

/**
 * 扫描并产出报告。violations 非空即门禁失败。
 * roots 为绝对路径;relativePath 相对 repoRoot(posix)。
 */
export function runAudit({ repoRoot: root, roots, whitelist = DEFAULT_WHITELIST }) {
  const violations = [];
  const whitelistCoverage = new Map();
  let semanticAllowed = 0;
  let scannedFiles = 0;

  for (const rootDir of roots) {
    for (const file of scanRoot(resolve(rootDir), root)) {
      scannedFiles += 1;
      const content = readFileSync(file.absolutePath, "utf8");
      const lines = content.split(/\r?\n/u);
      for (const candidate of detectCandidates(lines)) {
        const entry = matchWhitelist(file.relativePath, whitelist);
        if (entry) {
          whitelistCoverage.set(entry.id, (whitelistCoverage.get(entry.id) ?? 0) + 1);
          continue;
        }
        if (isSemanticallyHooked(lines, candidate)) {
          semanticAllowed += 1;
          continue;
        }
        violations.push({
          path: file.relativePath,
          line: candidate.line,
          kind: candidate.kind,
          preview: previewLine(lines[candidate.line - 1] ?? ""),
        });
      }
    }
  }

  violations.sort((left, right) =>
    left.path.localeCompare(right.path) || left.line - right.line,
  );

  return {
    roots: roots.map((rootPath) => toPosixPath(relative(root, rootPath))),
    scannedFiles,
    semanticAllowed,
    whitelistCoverage: Object.fromEntries([...whitelistCoverage.entries()].sort()),
    violations,
  };
}

function printTextReport(report) {
  console.log("mae user-paths audit (HOME 直拼 ~/.zcode 散点扫描,#26)");
  console.log(`roots: ${report.roots.join(", ")}`);
  console.log(
    `files: ${report.scannedFiles}, semantic-allowed: ${report.semanticAllowed}, ` +
      `whitelist-covered: ${Object.values(report.whitelistCoverage).reduce((a, b) => a + b, 0)}`,
  );
  const coveredEntries = Object.entries(report.whitelistCoverage);
  if (coveredEntries.length > 0) {
    console.log("");
    console.log("whitelist coverage:");
    for (const [id, count] of coveredEntries) {
      console.log(`  ${id.padEnd(44)} ${count}`);
    }
  }
  if (report.violations.length > 0) {
    console.log("");
    console.error(`violations (${report.violations.length})——白名单外的 HOME 直拼散点:`);
    for (const violation of report.violations) {
      console.error(
        `  ${violation.path}:${violation.line} [${violation.kind}] ${violation.preview}`,
      );
    }
    console.error(
      "处理:挂接(ZCODE_* 环境轴/mae 身份路由)后语义放行,或确认属豁免清单并在本脚本 WHITELIST 登记。",
    );
  }
}

function invokedAsCli() {
  const entry = process.argv[1];
  return Boolean(entry) && import.meta.url === pathToFileURL(resolve(entry)).href;
}

if (invokedAsCli()) {
  const json = process.argv.includes("--json");
  const rootOverride = process.argv.find((arg) => arg.startsWith("--root="));
  const roots = rootOverride
    ? rootOverride.slice("--root=".length).split(",").filter(Boolean).map((root) => resolve(repoRoot, root))
    : DEFAULT_ROOTS.map((root) => resolve(repoRoot, root));
  const report = runAudit({ repoRoot, roots });
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printTextReport(report);
  }
  if (report.violations.length > 0) {
    process.exitCode = 1;
  }
}
