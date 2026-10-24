import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MAE_D3_INTENTIONAL_SHARED_RELATIVE_EXCLUSIONS,
  OFFICIAL_DATA_ROOT_SELF_CHURN_RELATIVE_EXCLUSIONS,
  OFFICIAL_USER_DATA_SELF_CHURN_RELATIVE_EXCLUSIONS,
  diffDirectorySnapshots,
  isDirectorySnapshotDiffEmpty,
  isRelativePathExcluded,
  normalizeRelativeSnapshotPath,
  serializeDirectorySnapshotDiffForArtifact,
  snapshotDirectoryTree,
} from "./e2e/helpers/mae-acceptance/official-directory-snapshot.js";
import {
  MAE_OFFICIAL_DOMAIN_DENYLIST,
  collectStartupRequestHostnames,
  findMaeOfficialDomainHits,
  isMaeOfficialDeniedHostname,
  summarizeStartupRequestsForArtifact,
} from "./e2e/helpers/mae-acceptance/official-domain-denylist.js";
import {
  buildMaeAcceptanceChildEnv,
  parseTasklistCsvOutput,
  resolveMaeAcceptanceRealHomePaths,
} from "./e2e/helpers/mae-acceptance/mae-acceptance-runtime.js";
import {
  ZCODE_E2E_MAE_PACKAGED_APP_ENV,
  buildMaePackagedBuildEnv,
  resolveMaePackagedAppPath,
} from "./e2e/helpers/mae-acceptance/mae-packaged-build.js";

describe("mae 验收 helper: 官方目录快照 diff(#34)", () => {
  let tempRoot = "";

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "mae-acceptance-snapshot-"));
  });
  afterEach(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  it("D3 豁免子树清单只覆盖有意共享项,cli/db 不豁免", () => {
    expect(MAE_D3_INTENTIONAL_SHARED_RELATIVE_EXCLUSIONS).toEqual([
      "commands",
      "cli/log",
      "cli/rollout",
      "cli/debug",
    ]);
    expect(isRelativePathExcluded("commands/open.md", MAE_D3_INTENTIONAL_SHARED_RELATIVE_EXCLUSIONS)).toBe(
      true,
    );
    expect(
      isRelativePathExcluded("cli/log/main.log", MAE_D3_INTENTIONAL_SHARED_RELATIVE_EXCLUSIONS),
    ).toBe(true);
    expect(
      isRelativePathExcluded("cli/rollout/x.jsonl", MAE_D3_INTENTIONAL_SHARED_RELATIVE_EXCLUSIONS),
    ).toBe(true);
    expect(
      isRelativePathExcluded("cli/db/db.sqlite", MAE_D3_INTENTIONAL_SHARED_RELATIVE_EXCLUSIONS),
    ).toBe(false);
    expect(
      isRelativePathExcluded("cli/config.json", MAE_D3_INTENTIONAL_SHARED_RELATIVE_EXCLUSIONS),
    ).toBe(false);
    expect(isRelativePathExcluded("v2/setting.json", MAE_D3_INTENTIONAL_SHARED_RELATIVE_EXCLUSIONS)).toBe(
      false,
    );
    // 前缀匹配按路径段,commands-backup 不是 commands 子树。
    expect(
      isRelativePathExcluded("commands-backup/a.md", MAE_D3_INTENTIONAL_SHARED_RELATIVE_EXCLUSIONS),
    ).toBe(false);
    expect(normalizeRelativeSnapshotPath("\\cli\\log\\a.log")).toBe("cli/log/a.log");
  });

  it("未变化的目录树 diff 为空;新增/修改/删除逐项可见", async () => {
    const root = join(tempRoot, "official");
    await mkdir(join(root, "v2"), { recursive: true });
    await writeFile(join(root, "v2", "setting.json"), '{"windowWidth":800}');
    await writeFile(join(root, "cli-config.bin"), "stable");

    const before = await snapshotDirectoryTree(root);
    const unchanged = await snapshotDirectoryTree(root);
    expect(isDirectorySnapshotDiffEmpty(diffDirectorySnapshots(before, unchanged))).toBe(true);

    await writeFile(join(root, "v2", "credentials.json"), "{}");
    await writeFile(join(root, "cli-config.bin"), "stable-but-different-content");
    const afterModified = await snapshotDirectoryTree(root);
    const modifiedDiff = diffDirectorySnapshots(before, afterModified);
    expect(modifiedDiff.added).toEqual(["v2/credentials.json"]);
    // 父目录 v2 的 mtime 随新增子项变化,但目录条目按结构比较(mtime 噪声豁免),
    // changed 只含被改写的文件本身。
    expect(modifiedDiff.changed.map((entry) => entry.path)).toEqual(["cli-config.bin"]);

    await rm(join(root, "cli-config.bin"), { force: true });
    const afterRemoved = await snapshotDirectoryTree(root);
    const removedDiff = diffDirectorySnapshots(before, afterRemoved);
    expect(removedDiff.removed).toEqual(["cli-config.bin"]);
    expect(serializeDirectorySnapshotDiffForArtifact(removedDiff).removed).toEqual(["cli-config.bin"]);
  });

  it("D3 豁免子树内的写入不进入快照(有意共享不算零交集违规)", async () => {
    const root = join(tempRoot, "zcode");
    await mkdir(join(root, "cli", "log"), { recursive: true });
    await mkdir(join(root, "cli", "db"), { recursive: true });
    await writeFile(join(root, "cli", "log", "main.log"), "line");
    await writeFile(join(root, "cli", "db", "db.sqlite"), "db");

    const before = await snapshotDirectoryTree(root, {
      exclusions: MAE_D3_INTENTIONAL_SHARED_RELATIVE_EXCLUSIONS,
    });
    await writeFile(join(root, "cli", "log", "main.log"), "line2-appended");
    await writeFile(join(root, "cli", "log", "extra.log"), "extra");
    const after = await snapshotDirectoryTree(root, {
      exclusions: MAE_D3_INTENTIONAL_SHARED_RELATIVE_EXCLUSIONS,
    });
    expect(isDirectorySnapshotDiffEmpty(diffDirectorySnapshots(before, after))).toBe(true);

    // 豁免之外(cli/db)的写入必须可见。
    await writeFile(join(root, "cli", "db", "db.sqlite"), "db-mutated");
    const afterDbTouch = await snapshotDirectoryTree(root, {
      exclusions: MAE_D3_INTENTIONAL_SHARED_RELATIVE_EXCLUSIONS,
    });
    expect(
      diffDirectorySnapshots(before, afterDbTouch).changed.map((entry) => entry.path),
    ).toEqual(["cli/db/db.sqlite"]);
  });

  it("官方自噪声豁免与目录 mtime 噪声不构成 diff(实测失败模式回放)", async () => {
    expect(OFFICIAL_USER_DATA_SELF_CHURN_RELATIVE_EXCLUSIONS).toEqual(["session", "rum-electron-store"]);
    expect(OFFICIAL_DATA_ROOT_SELF_CHURN_RELATIVE_EXCLUSIONS).toEqual([
      "v2/logs",
      "v2/bots-runtime-locks",
      "v2/runtime",
    ]);
    const root = join(tempRoot, "churn");
    await mkdir(join(root, "v2"), { recursive: true });
    await writeFile(join(root, "v2", "setting.json"), '{"theme":"dark"}');
    const exclusions = OFFICIAL_DATA_ROOT_SELF_CHURN_RELATIVE_EXCLUSIONS;
    const before = await snapshotDirectoryTree(root, { exclusions });

    // 官方自噪声三连:v2/logs 追加、锁租约瞬时建删、v2 父目录 mtime 被瞬时子项推动。
    await mkdir(join(root, "v2", "logs"), { recursive: true });
    await writeFile(join(root, "v2", "logs", "2026-10-24.log"), "append-line");
    await mkdir(join(root, "v2", "bots-runtime-locks"), { recursive: true });
    await writeFile(join(root, "v2", "bots-runtime-locks", "lease-x"), "1");
    await rm(join(root, "v2", "bots-runtime-locks", "lease-x"), { force: true });
    const after = await snapshotDirectoryTree(root, { exclusions });
    expect(isDirectorySnapshotDiffEmpty(diffDirectorySnapshots(before, after))).toBe(true);

    // 豁免之外的身份/数据承载文件仍然严格:v2/setting.json 改写必须可见。
    await writeFile(join(root, "v2", "setting.json"), '{"theme":"light"}');
    const afterRealChange = await snapshotDirectoryTree(root, { exclusions });
    expect(
      diffDirectorySnapshots(before, afterRealChange).changed.map((entry) => entry.path),
    ).toEqual(["v2/setting.json"]);
  });

  it("根目录缺失保持缺失:rootAbsent 快照与 diff 语义", async () => {
    const missingRoot = join(tempRoot, "does-not-exist");
    const absent = await snapshotDirectoryTree(missingRoot);
    expect(absent.rootAbsent).toBe(true);

    const stillAbsent = await snapshotDirectoryTree(missingRoot);
    expect(isDirectorySnapshotDiffEmpty(diffDirectorySnapshots(absent, stillAbsent))).toBe(true);

    // 启动后被创建即零交集违规:added 必须可见。
    await mkdir(join(missingRoot, "SingletonLock"), { recursive: true });
    await writeFile(join(missingRoot, "SingletonLock", "lock"), "1");
    const created = await snapshotDirectoryTree(missingRoot);
    expect(created.rootAbsent).toBe(false);
    expect(diffDirectorySnapshots(absent, created).added).toEqual(["SingletonLock", "SingletonLock/lock"]);
  });
});

describe("mae 验收 helper: 官方域名 denylist(#34)", () => {
  it("denylist 覆盖票面五域,label 后缀匹配", () => {
    expect([...MAE_OFFICIAL_DOMAIN_DENYLIST]).toEqual(
      expect.arrayContaining(["zcode.z.ai", "bigmodel.cn", "z.ai", "api.z.ai", "cdn-zcode.z.ai"]),
    );
    expect(isMaeOfficialDeniedHostname("zcode.z.ai")).toBe(true);
    expect(isMaeOfficialDeniedHostname("api.z.ai")).toBe(true);
    expect(isMaeOfficialDeniedHostname("cdn-zcode.z.ai")).toBe(true);
    expect(isMaeOfficialDeniedHostname("open.bigmodel.cn")).toBe(true);
    expect(isMaeOfficialDeniedHostname("ZCODE.Z.AI.")).toBe(true);
    // z.ai 是 zcode.z.ai 的后缀域;非官方域名不误伤。
    expect(isMaeOfficialDeniedHostname("notz.ai")).toBe(false);
    expect(isMaeOfficialDeniedHostname("z.ai.example.com")).toBe(false);
    expect(isMaeOfficialDeniedHostname("bigmodel.cn.example.org")).toBe(false);
    expect(isMaeOfficialDeniedHostname("github.com")).toBe(false);
    expect(isMaeOfficialDeniedHostname("")).toBe(false);
  });

  it("请求清单 hostname 提取与命中定位", () => {
    const records = [
      { host: "127.0.0.1:0", method: "GET", protocol: "http", status: "complete", url: "http://127.0.0.1/x" },
      { host: "zcode.z.ai", method: "GET", protocol: "https", status: "error", url: "https://zcode.z.ai/api" },
      { host: "open.bigmodel.cn", method: "POST", protocol: "https", status: "pending", url: "https://open.bigmodel.cn/api/paas/v4" },
      { host: "zcode.z.ai", method: "GET", protocol: "https", status: "complete", url: "https://zcode.z.ai/other" },
    ];
    const hits = findMaeOfficialDomainHits(collectStartupRequestHostnames(records));
    // domain 报告 denylist 中最具体的匹配项(zcode.z.ai 优先于其父域 z.ai)。
    expect(hits).toEqual([
      { domain: "bigmodel.cn", hostname: "open.bigmodel.cn" },
      { domain: "zcode.z.ai", hostname: "zcode.z.ai" },
    ]);
    // 失败的 MITM 尝试(status=error)同样计为外联证据。
    expect(findMaeOfficialDomainHits(["zcode.z.ai"])).toHaveLength(1);
    expect(summarizeStartupRequestsForArtifact(records)).toHaveLength(4);
    expect(summarizeStartupRequestsForArtifact(records)[0].url).toBe("http://127.0.0.1/x");
  });
});

describe("mae 验收 helper: 子进程 env 清洗(#34)", () => {
  it("剥离 WDIO 身份/数据重定向轴并恢复真实 HOME,代理 env 最后叠加", () => {
    const workerEnv: NodeJS.ProcessEnv = {
      APPDATA: "C:\\Users\\dev\\AppData\\Roaming",
      HOME: "C:\\repo\\packages\\desktop\\.e2e-home",
      USERPROFILE: "C:\\repo\\packages\\desktop\\.e2e-home",
      PATH: "C:\\Windows",
      ZCODE_DATA_BASE_DIR: "C:\\repo\\packages\\desktop\\.e2e-home",
      ZCODE_DESKTOP_APPLICATION_NAME: "ZCode E2E",
      ZCODE_DESKTOP_HOME_DIR: "C:\\repo\\packages\\desktop\\.e2e-home",
      ZCODE_DESKTOP_USE_ELECTRON_DEFAULT_USER_DATA: "1",
      ZCODE_ENV: "test",
      ZCODE_E2E_RUN_ID: "run-1",
      ZCODE_E2E_ARTIFACT_DIR: "C:\\artifacts",
      E2E_PROVIDER_PRESET: "env",
      ZCODE_BUILTIN_PROVIDER_CONFIG_FILE: "C:\\repo\\config\\provider\\zcode-builtin.json",
      ZCODE_HTTP_PROXY: "http://127.0.0.1:1",
      HTTP_PROXY: "http://127.0.0.1:1",
      NO_PROXY: "zcode.z.ai",
      VITE_ZCODE_E2E_STORE_BRIDGE: "1",
      KEEP_ME: "yes",
    };
    const childEnv = buildMaeAcceptanceChildEnv(workerEnv, {
      proxyEnv: {
        HTTP_PROXY: "http://127.0.0.1:2",
        ZCODE_HTTP_PROXY: "http://127.0.0.1:2",
        NO_PROXY: "localhost,127.0.0.1,::1",
      },
      realUserHome: "C:\\Users\\dev",
    });
    expect(childEnv.HOME).toBe("C:\\Users\\dev");
    expect(childEnv.USERPROFILE).toBe("C:\\Users\\dev");
    expect(childEnv.KEEP_ME).toBe("yes");
    expect(childEnv.PATH).toBe("C:\\Windows");
    // 身份/数据重定向轴必须消失——它们存在时 mae 数据根 bootstrap 会退位。
    expect(childEnv.ZCODE_DATA_BASE_DIR).toBeUndefined();
    expect(childEnv.ZCODE_DESKTOP_APPLICATION_NAME).toBeUndefined();
    expect(childEnv.ZCODE_DESKTOP_HOME_DIR).toBeUndefined();
    expect(childEnv.ZCODE_DESKTOP_USE_ELECTRON_DEFAULT_USER_DATA).toBeUndefined();
    expect(childEnv.ZCODE_ENV).toBeUndefined();
    expect(childEnv.ZCODE_BUILTIN_PROVIDER_CONFIG_FILE).toBeUndefined();
    expect(childEnv.VITE_ZCODE_E2E_STORE_BRIDGE).toBeUndefined();
    expect(childEnv.ZCODE_E2E_RUN_ID).toBeUndefined();
    expect(childEnv.E2E_PROVIDER_PRESET).toBeUndefined();
    // 代理轴以审计注入为准,不能残留继承值。
    expect(childEnv.HTTP_PROXY).toBe("http://127.0.0.1:2");
    expect(childEnv.ZCODE_HTTP_PROXY).toBe("http://127.0.0.1:2");
    expect(childEnv.NO_PROXY).toBe("localhost,127.0.0.1,::1");
  });

  it("真实用户目录解析:APPDATA 推导 + ZCODE_E2E_MAE_REAL_HOME 显式覆盖", () => {
    expect(resolveMaeAcceptanceRealHomePaths({
      APPDATA: "C:\\Users\\dev\\AppData\\Roaming",
    })).toEqual({
      appDataRoaming: "C:\\Users\\dev\\AppData\\Roaming",
      userHome: "C:\\Users\\dev",
    });
    expect(
      resolveMaeAcceptanceRealHomePaths({
        APPDATA: "D:\\Roaming",
        ZCODE_E2E_MAE_REAL_HOME: "C:\\Users\\elsewhere",
      }).userHome,
    ).toBe("C:\\Users\\elsewhere");
    expect(() => resolveMaeAcceptanceRealHomePaths({})).toThrow(/APPDATA/);
  });
});

describe("mae 验收 helper: 打包构建 env 清洗与产物解析(#34)", () => {
  it("构建 env 锁定 production 后端轴,剥离 WDIO 注入与 tsx loader", () => {
    const buildEnv = buildMaePackagedBuildEnv(
      {
        HOME: "C:\\repo\\.e2e-home",
        ZCODE_ENV: "test",
        VITE_ZCODE_E2E_STORE_BRIDGE: "1",
        ZCODE_E2E_RUN_ID: "run-1",
        E2E_PROVIDER_PRESET: "env",
        NODE_OPTIONS: "--import tsx",
        PATH: "C:\\Windows",
      },
      "C:\\Users\\dev",
    );
    expect(buildEnv.ZCODE_ENV).toBe("production");
    expect(buildEnv.HOME).toBe("C:\\Users\\dev");
    expect(buildEnv.VITE_ZCODE_E2E_STORE_BRIDGE).toBeUndefined();
    expect(buildEnv.ZCODE_E2E_RUN_ID).toBeUndefined();
    expect(buildEnv.E2E_PROVIDER_PRESET).toBeUndefined();
    expect(buildEnv.NODE_OPTIONS).toBeUndefined();
    expect(buildEnv.PATH).toBe("C:\\Windows");
    expect(buildEnv.PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN).toBe("false");
  });

  it("打包产物解析:env 覆盖轴优先,缺失返回 null", () => {
    expect(resolveMaePackagedAppPath({ desktopDir: "Z:\\missing-desktop" })).toBeNull();
    expect(
      resolveMaePackagedAppPath({
        desktopDir: "Z:\\missing-desktop",
        env: { [ZCODE_E2E_MAE_PACKAGED_APP_ENV]: "C:\\Data\\Pro\\ZCode\\package.json" },
      }),
    ).toBe("C:\\Data\\Pro\\ZCode\\package.json");
  });
});

describe("mae 验收 helper: tasklist CSV 解析(#34)", () => {  it("解析带引号/逗号的标题列并剔除表头", () => {
    const csv = [
      '"映像名称","PID","会话名","会话#","内存使用","状态","用户名","CPU 时间","窗口标题"',
      '"ZCode Mae.exe","101","Console","1","123,456 K","运行","dev\\\\user","0:01","ZCode Mae - 会话, 附件"',
      '"ZCode Mae.exe","102","Console","1","88 K","运行","dev\\\\user","0:00","N/A"',
      "INFO: 没有运行的任务匹配指定标准。",
    ].join("\r\n");
    const rows = parseTasklistCsvOutput(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0][1]).toBe("101");
    expect(rows[0][8]).toBe("ZCode Mae - 会话, 附件");
    expect(rows[1][8]).toBe("N/A");
    expect(parseTasklistCsvOutput("INFO: no tasks")).toHaveLength(0);
  });
});
