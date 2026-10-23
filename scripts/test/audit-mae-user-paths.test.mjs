import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";

import { DEFAULT_WHITELIST, WHITELIST_GROUPS, runAudit } from "../audit-mae-user-paths.mjs";

const repoRoot = await mkdtemp(join(tmpdir(), "zcode-audit-mae-user-paths-"));
after(() => rm(repoRoot, { recursive: true, force: true }));

async function writeSource(relativePath, lines) {
  const absolute = join(repoRoot, relativePath);
  await mkdir(join(absolute, ".."), { recursive: true });
  await writeFile(absolute, lines.join("\n") + "\n", "utf8");
  return relativePath.replaceAll("\\", "/");
}

function violationFor(report, relativePath) {
  return report.violations.find((violation) => violation.path === relativePath);
}

async function auditFixture() {
  return runAudit({
    repoRoot,
    roots: [join(repoRoot, "apps/zcode-cli/packages"), join(repoRoot, "packages")],
    whitelist: [
      {
        id: "fixture-share",
        group: "intentional-share",
        pattern: /^packages\/demo\/src\/shared-feature\.ts$/u,
        reason: "fixture intentional share",
      },
    ],
  });
}

before(async () => {
  // 白名单外裸 homedir() 直拼——最典型的上游散点形态,必须红。
  await writeSource("packages/demo/src/scatter.ts", [
    'import { homedir } from "node:os";',
    'import { join } from "node:path";',
    "",
    'export const scatterPath = join(homedir(), ".zcode", "cli", "x.json");',
  ]);

  // 多行 join 形态的裸 homedir() 直拼同样要红。
  await writeSource("packages/demo/src/multiline.ts", [
    'import { homedir } from "node:os";',
    'import { join } from "node:path";',
    "",
    "export const multilinePath = join(",
    "  homedir(),",
    '  ".zcode",',
    '  "v2",',
    ");",
  ]);

  // home 变量首参 + .zcode 首段(j(<home解析>, ".zcode" 类)要红。
  await writeSource("packages/demo/src/home-var.ts", [
    'import { join } from "node:path";',
    "",
    "export function settings(homePath: string) {",
    '  return join(homePath, ".zcode", "v2", "setting.json");',
    "}",
  ]);

  // ".zcode" 首段相对 join 要红(收集根另挂时才会安全,散点出现即需解释)。
  await writeSource("packages/demo/src/first-segment.ts", [
    'import { posix } from "node:path";',
    "",
    'export const segments = posix.join(".zcode", "cli", "log");',
  ]);

  // 整串 ~/.zcode 字面量默认值要红;注释与提示文案里的 ~/.zcode 不算。
  await writeSource("packages/demo/src/tilde.ts", [
    'export const storageDefaults = {',
    '  dir: "~/.zcode",',
    '  db: "~/.zcode/cli/db/db.sqlite",',
    "} export const prompt = 'read ~/.zcode docs for details';",
    '// legacy default was "~/.zcode/cli"',
  ]);

  // 语义放行:环境变量覆盖优先的兜底形态(已挂接)。
  await writeSource("packages/demo/src/hooked-env-fallback.ts", [
    'import { homedir } from "node:os";',
    'import { join } from "node:path";',
    "",
    "export function storageRoot(processEnv) {",
    '  return processEnv.ZCODE_STORAGE_DIR?.trim() || join(homedir(), ".zcode");',
    "}",
  ]);

  // 语义放行:mae 身份三元(官方分支保留上游语义)。
  await writeSource("packages/demo/src/hooked-mae-ternary.ts", [
    'import { homedir } from "node:os";',
    "",
    "export function exportRoot(getMaeRoot) {",
    '  return ZCODE_PRODUCT_FLAVOR === "mae" ? getMaeRoot() : join(homedir(), ".zcode");',
    "}",
  ]);

  // 语义放行:参数/配置优先的 ?? / 三元兜底。
  await writeSource("packages/demo/src/hooked-param-fallback.ts", [
    'import { homedir } from "node:os";',
    'import { join } from "node:path";',
    "",
    "export function trustPath(options, home) {",
    '  const configPath = options.userConfigPath ?? join(home, ".zcode", "cli", "config.json");',
    '  const root = options.configured ? options.configured : join(home, ".zcode");',
    "  return { configPath, root };",
    "}",
    "",
    "export function mailbox(options) {",
    '  return options.ZCODE_MAILBOX_ROOT ?? "~/.zcode/mailbox";',
    "}",
  ]);

  // 非候选:项目级(workspace 参数)join、resolver 调用首参、非产品命名空间。
  await writeSource("packages/demo/src/not-candidates.ts", [
    'import { homedir } from "node:os";',
    'import { join } from "node:path";',
    "",
    'export const project = join(workingDirectory, ".zcode", "workflows");',
    'export const resolved = join(resolveUserPath(baseDir), ".zcode", "v2", "x.json");',
    'export const beta = join(homedir(), ".zcode-beta");',
    'export const plugin = join(rootPath, ".zcode-plugin", "plugin.json");',
    'export const pluginManifest = join(".claude-plugin", "plugin.json");',
  ]);

  // 白名单内文件:裸直拼放行并计入覆盖统计。
  await writeSource("packages/demo/src/shared-feature.ts", [
    'import { homedir } from "node:os";',
    'import { join } from "node:path";',
    "",
    'export const sharedLog = join(homedir(), ".zcode", "cli", "log");',
  ]);

  // 测试文件与非 src 目录不扫。
  await writeSource("packages/demo/src/skip.test.ts", [
    'export const p = join(homedir(), ".zcode", "nope");',
  ]);
  await writeSource("packages/demo/lib/out-of-scope.ts", [
    'export const p = join(homedir(), ".zcode", "nope");',
  ]);

  // CLI 包形态(apps/zcode-cli/packages/<pkg>/src)同样在扫描面内。
  await writeSource("apps/zcode-cli/packages/demo/src/scatter.ts", [
    'export const cliScatter = join(homedir(), ".zcode", "cli", "y.json");',
  ]);
});

describe("runAudit:候选识别", () => {
  test("裸 homedir() 直拼 .zcode 命中并给出 文件:行:片段", async () => {
    const report = await auditFixture();
    const violation = violationFor(report, "packages/demo/src/scatter.ts");
    assert.ok(violation, "scatter.ts 应命中");
    assert.equal(violation.kind, "bare-homedir-join");
    assert.equal(violation.line, 4);
    assert.match(violation.preview, /join\(homedir\(\), "\.zcode"/u);
  });

  test("多行 join 的裸 homedir() 直拼同样命中", async () => {
    const report = await auditFixture();
    const violation = violationFor(report, "packages/demo/src/multiline.ts");
    assert.ok(violation, "multiline.ts 应命中");
    assert.equal(violation.kind, "bare-homedir-join");
  });

  test("home 变量首参 join(x, \".zcode\") 命中", async () => {
    const report = await auditFixture();
    const violation = violationFor(report, "packages/demo/src/home-var.ts");
    assert.ok(violation, "home-var.ts 应命中");
    assert.equal(violation.kind, "home-var-join");
  });

  test('".zcode" 首段相对 join 命中', async () => {
    const report = await auditFixture();
    const violation = violationFor(report, "packages/demo/src/first-segment.ts");
    assert.ok(violation, "first-segment.ts 应命中");
    assert.equal(violation.kind, "first-segment-join");
  });

  test("整串 ~/.zcode 字面量默认值命中,注释与提示文案不命中", async () => {
    const report = await auditFixture();
    const violation = violationFor(report, "packages/demo/src/tilde.ts");
    assert.ok(violation, "tilde.ts 代码字面量应命中");
    assert.equal(violation.kind, "tilde-literal");
    assert.equal(violation.line, 2);
    // 代码里的两个默认值逐行各报一处,注释与提示文案不计。
    const tildeViolations = report.violations.filter(
      (item) => item.path === "packages/demo/src/tilde.ts",
    );
    assert.equal(tildeViolations.length, 2);
  });

  test("apps/zcode-cli/packages/<pkg>/src 在扫描面内", async () => {
    const report = await auditFixture();
    assert.ok(violationFor(report, "apps/zcode-cli/packages/demo/src/scatter.ts"));
  });
});

describe("runAudit:语义放行(已挂接形态)", () => {
  test("环境变量覆盖优先的兜底 join 放行", async () => {
    const report = await auditFixture();
    assert.equal(violationFor(report, "packages/demo/src/hooked-env-fallback.ts"), undefined);
    assert.ok(report.semanticAllowed >= 1);
  });

  test("mae 身份三元(官方分支保留)放行", async () => {
    const report = await auditFixture();
    assert.equal(violationFor(report, "packages/demo/src/hooked-mae-ternary.ts"), undefined);
  });

  test("参数/配置优先的 ?? 与三元兜底放行", async () => {
    const report = await auditFixture();
    assert.equal(violationFor(report, "packages/demo/src/hooked-param-fallback.ts"), undefined);
  });
});

describe("runAudit:范围界定", () => {
  test("项目级 join、resolver 首参、.zcode-beta/.zcode-plugin/.claude-plugin 不算候选", async () => {
    const report = await auditFixture();
    assert.equal(violationFor(report, "packages/demo/src/not-candidates.ts"), undefined);
  });

  test("白名单文件放行并计入覆盖统计", async () => {
    const report = await auditFixture();
    assert.equal(violationFor(report, "packages/demo/src/shared-feature.ts"), undefined);
    assert.equal(report.whitelistCoverage["fixture-share"], 1);
  });

  test("测试文件与非 src 目录不扫描", async () => {
    const report = await auditFixture();
    assert.equal(violationFor(report, "packages/demo/src/skip.test.ts"), undefined);
    assert.equal(violationFor(report, "packages/demo/lib/out-of-scope.ts"), undefined);
  });
});

describe("DEFAULT_WHITELIST:与豁免清单同源", () => {
  test("分组枚举完整且每条白名单含 id/group/pattern/reason", () => {
    assert.deepEqual(WHITELIST_GROUPS, [
      "intentional-share",
      "hooked-elsewhere",
      "remote-host-path",
      "known-leftover",
    ]);
    assert.ok(
      DEFAULT_WHITELIST.length >= 13,
      "豁免清单条目应完整迁移(#31 删 8 条 known-leftover 后 13 条)",
    );
    for (const entry of DEFAULT_WHITELIST) {
      assert.match(entry.id, /^[\w-]+$/u);
      assert.ok(WHITELIST_GROUPS.includes(entry.group));
      assert.ok(entry.pattern instanceof RegExp);
      assert.ok(entry.reason.length >= 4);
    }
    const ids = DEFAULT_WHITELIST.map((entry) => entry.id);
    for (const required of [
      "mae-share-agent-log",
      "mae-share-model-rollout",
      "mae-share-commands-service",
      "mae-share-memory-service",
      "mae-hooked-session-db-default",
      "mae-hooked-contracts-storage-default",
      "mae-hooked-export-logs-segments",
    ]) {
      assert.ok(ids.includes(required), `白名单缺少 ${required}`);
    }
    assert.equal(new Set(ids).size, ids.length, "白名单 id 不得重复");
  });

  test("known-leftover 组保持清空(#31 收口后 ratchet:新漏网须显式改本断言登记)", () => {
    const leftovers = DEFAULT_WHITELIST.filter((entry) => entry.group === "known-leftover");
    assert.deepEqual(
      leftovers.map((entry) => entry.id),
      [],
      "known-leftover 应为空——出现新条目说明有新漏网,须先收口或在此有意识登记",
    );
  });

  test("known-leftover 条目必须带 issue 引用,防止无主豁免", () => {
    for (const entry of DEFAULT_WHITELIST) {
      if (entry.group === "known-leftover") {
        assert.match(entry.reason, /#\d+/u, `${entry.id} 需要指向收口 issue`);
      }
    }
  });
});
