import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { writeE2EJsonFileAtomically } from "./helpers/e2e-atomic-json-file.js";
import {
  startE2ENetworkCaptureProxy,
  type E2ENetworkCaptureProxy,
} from "./helpers/network-capture-proxy.js";
import {
  MAE_D3_INTENTIONAL_SHARED_RELATIVE_EXCLUSIONS,
  OFFICIAL_DATA_ROOT_SELF_CHURN_RELATIVE_EXCLUSIONS,
  OFFICIAL_USER_DATA_SELF_CHURN_RELATIVE_EXCLUSIONS,
  diffDirectorySnapshots,
  isDirectorySnapshotDiffEmpty,
  serializeDirectorySnapshotDiffForArtifact,
  snapshotDirectoryTree,
  type DirectorySnapshot,
} from "./helpers/mae-acceptance/official-directory-snapshot.js";
import {
  MAE_OFFICIAL_DOMAIN_DENYLIST,
  collectStartupRequestHostnames,
  findMaeOfficialDomainHits,
  summarizeStartupRequestsForArtifact,
  type MaeStartupRequestRecord,
} from "./helpers/mae-acceptance/official-domain-denylist.js";
import {
  MAE_PACKAGED_APP_IMAGE_NAME,
  ensureMaePackagedBuild,
} from "./helpers/mae-acceptance/mae-packaged-build.js";
import {
  assertNoRunningMaeAppInstances,
  buildMaeAcceptanceChildEnv,
  countWindowsImageProcesses,
  isWindowsProcessAlive,
  launchMaeAppInstance,
  resolveMaeAcceptanceRealHomePaths,
  terminateWindowsProcessTree,
  waitForMaeCondition,
  type MaeAppInstance,
} from "./helpers/mae-acceptance/mae-acceptance-runtime.js";

/**
 * mae 全局验收自动化(#34,specs/mae/README.md「全局验收」)。
 *
 * 与普通 e2e 的根本差异:验收对象不是 WDIO session 里的 "ZCode E2E" 实例,而是
 * 以真实用户身份启动的 mae 打包构建(win-unpacked)。因此本 spec 完全不驱动
 * `browser`,而是在 worker 内:
 *
 * 1. 零交集(AC1):对官方 `%APPDATA%\ZCode`、`~/.zcode`(排除 D3 定稿有意共享
 *    子树 commands/cli-log/cli-rollout/cli-debug)做启动前后快照 diff,断言零
 *    added/removed/changed(缺失保持缺失);同时断言 mae 侧 `%APPDATA%\ZCode Mae`
 *    与 `~/.zcode-mae/.zcode` 被创建/写入。
 * 2. 单实例自洽(AC2):Electron 实例锁派生自 userData(`%APPDATA%\ZCode Mae`
 *    下的 lockfile);第二实例必须快速退出、首实例存活、进程数不变(新窗口必然
 *    带动 renderer 进程上涨,进程数是"不新建窗口"的 locale 无关机械证据)。
 * 3. 启动网络审计(AC3):本地 MITM 抓包代理(Chromium `--proxy-server` + Node 侧
 *    proxy/CA env 双层)收集启动期全部外联,断言官方域名 denylist
 *    (zcode.z.ai/bigmodel.cn/z.ai/api.z.ai/cdn-zcode.z.ai)零命中,请求清单
 *    写入测试产物。OS 级全进程抓包(绕过 proxy 的原生流量)仍属 #4 人工步骤。
 *
 * 前提:本机不能有正在运行的 zcode-mae 实例(before 里 fail-closed)。官方 ZCode
 * 实例若同时运行,其对 `%APPDATA%\ZCode` 的自身写入(session/、rum-electron-store/)
 * 无法与被测对象归因区分——此时该两棵官方自噪声子树从零交集 diff 豁免并留痕
 * (lockfile/Preferences/任意新增条目仍严格);`~/.zcode` 不豁免,官方自身写入造成
 * 的偶发环境性失败重跑即可。系统级写入归因(Process Monitor 抓包)属 #4 人工步骤。
 */
const windowsDescribe = process.platform === "win32" ? describe : describe.skip;

const DESKTOP_DIR = resolve(import.meta.dirname, "../..");
const REPO_ROOT = resolve(import.meta.dirname, "../../../..");
const ARTIFACT_DIR = process.env.ZCODE_E2E_ARTIFACT_DIR?.trim() || join(DESKTOP_DIR, ".e2e-artifacts", "mae-acceptance");
/** 启动期审计窗口:覆盖 main/host/agent 启动与首个渲染稳定段。 */
const STARTUP_AUDIT_SETTLE_MS = 45_000;
const SECOND_INSTANCE_EXIT_TIMEOUT_MS = 90_000;

interface AcceptanceDirectoryPlan {
  exclusions: readonly string[];
  label: string;
  root: string;
}

let realHomePaths = resolveMaeAcceptanceRealHomePaths();
let appPath = "";
let appImageName = MAE_PACKAGED_APP_IMAGE_NAME;
let proxy: E2ENetworkCaptureProxy | null = null;
let childEnv: NodeJS.ProcessEnv = {};
let launchArgs: string[] = [];
let instanceA: MaeAppInstance | null = null;
let maeUserDataDir = "";
let maeDataRootDir = "";
let officialDirectoryPlans: AcceptanceDirectoryPlan[] = [];
let maeDirectoryPlans: AcceptanceDirectoryPlan[] = [];
let officialAppSelfChurnExcluded = false;
let beforeSnapshots = new Map<string, DirectorySnapshot>();
let afterSnapshots = new Map<string, DirectorySnapshot>();

windowsDescribe("mae 全局验收: 双装零交集与启动无官方外联(#34)", () => {
  /** 失败即抛带证据的 Error(diff JSON 全量进消息,报告里可直接定性)。 */
  function expectTrueWithEvidence(value: boolean, message: string): void {
    if (!value) {
      throw new Error(`[mae-acceptance] 断言失败: ${message}`);
    }
  }

  before(async function () {
    this.timeout(42 * 60_000);

    mkdirSync(ARTIFACT_DIR, { recursive: true });
    realHomePaths = resolveMaeAcceptanceRealHomePaths();
    const { appDataRoaming, userHome } = realHomePaths;
    maeUserDataDir = join(appDataRoaming, "ZCode Mae");
    maeDataRootDir = join(userHome, ".zcode-mae", ".zcode");
    maeDirectoryPlans = [
      {
        exclusions: [],
        label: "%APPDATA%\\ZCode Mae(mae Electron userData)",
        root: maeUserDataDir,
      },
      {
        exclusions: [],
        label: "~/.zcode-mae/.zcode(mae 业务数据根)",
        root: maeDataRootDir,
      },
    ];

    await assertNoRunningMaeAppInstances(appImageName);

    // 官方实例常驻时(本验收 runner 本身可能就跑在官方应用里),官方对自家目录的
    // 活写入(Chromium session/RUM 存储、Bots 锁租约、桌面日志、运行时组件)无法
    // 与被测对象归因区分——按 official-directory-snapshot 注释口径豁免这些官方自
    // 噪声子树并留痕;身份/数据承载文件与一切新增条目仍全文严格。独占机器上官方
    // 未运行 → 不豁免,全文严格。
    officialAppSelfChurnExcluded = (await countWindowsImageProcesses("ZCode.exe")) > 0;
    if (officialAppSelfChurnExcluded) {
      console.warn(
        "[mae-acceptance] 检测到官方 ZCode.exe 实例运行中:零交集 diff 豁免官方自噪声子树 " +
          [
            ...OFFICIAL_USER_DATA_SELF_CHURN_RELATIVE_EXCLUSIONS,
            ...OFFICIAL_DATA_ROOT_SELF_CHURN_RELATIVE_EXCLUSIONS,
          ].join("/") +
          "(lockfile/Preferences/v2 配置与新增条目仍严格;系统级归因抓包属 #4 人工步骤)",
      );
    }
    officialDirectoryPlans = [
      {
        exclusions: [
          ...(officialAppSelfChurnExcluded
            ? OFFICIAL_USER_DATA_SELF_CHURN_RELATIVE_EXCLUSIONS
            : []),
        ],
        label: "%APPDATA%\\ZCode(官方 Electron userData)",
        root: join(appDataRoaming, "ZCode"),
      },
      {
        exclusions: [
          ...MAE_D3_INTENTIONAL_SHARED_RELATIVE_EXCLUSIONS,
          ...(officialAppSelfChurnExcluded
            ? OFFICIAL_DATA_ROOT_SELF_CHURN_RELATIVE_EXCLUSIONS
            : []),
        ],
        label: "~/.zcode(官方用户级数据根,D3 有意共享子树豁免)",
        root: join(userHome, ".zcode"),
      },
    ];

    const buildResult = await ensureMaePackagedBuild({
      desktopDir: DESKTOP_DIR,
      env: process.env,
      realUserHome: userHome,
    });
    appPath = buildResult.appPath;
    console.log(
      `[mae-acceptance] 打包产物: ${appPath}${buildResult.builtThisRun ? "(本轮已构建)" : "(复用已有构建)"}`,
    );

    proxy = await startE2ENetworkCaptureProxy({
      artifactPath: join(ARTIFACT_DIR, "mae-acceptance-network-capture.json"),
      caDir: join(REPO_ROOT, ".cache", "mae-acceptance-network-ca"),
    });
    // 抓包代理默认 NO_PROXY 含官方域名(回放场景为直连豁免);审计语义必须全覆盖,
    // 只豁免本机回环,官方域名的任何尝试都要进清单。
    const auditProxyEnv: Record<string, string> = {
      ...proxy.env,
      NO_PROXY: "localhost,127.0.0.1,::1",
      no_proxy: "localhost,127.0.0.1,::1",
    };
    childEnv = buildMaeAcceptanceChildEnv(process.env, {
      proxyEnv: auditProxyEnv,
      realUserHome: userHome,
    });
    launchArgs = ["--proxy-server=" + proxy.proxyUrl, "--ignore-certificate-errors"];

    // 快照必须在构建完成后取:打包链路本身不应触碰用户目录,但把窗口收窄到
    // "启动前后"能让零交集断言的因果对象唯一。
    beforeSnapshots = await snapshotDirectoryPlans(officialDirectoryPlans.concat(maeDirectoryPlans));
    await writeE2EJsonFileAtomically(join(ARTIFACT_DIR, "mae-acceptance-directories-before.json"), {
      officialAppSelfChurnExcluded,
      plans: [...officialDirectoryPlans, ...maeDirectoryPlans].map((plan) => ({
        exclusions: plan.exclusions,
        label: plan.label,
        root: plan.root,
      })),
      snapshots: Object.fromEntries([...beforeSnapshots].map(([root, snapshot]) => [root, snapshot])),
    });
  });

  after(async function () {
    this.timeout(60_000);
    if (instanceA && !instanceA.exited && isWindowsProcessAlive(instanceA.pid)) {
      await terminateWindowsProcessTree(instanceA.pid).catch(() => undefined);
    }
    if (proxy) {
      await proxy.stop().catch(() => undefined);
      proxy = null;
    }
  });

  it("AC1: 启动 mae 构建前后,官方目录零变化,mae 专属目录被创建并写入", async function () {
    this.timeout(8 * 60_000);

    instanceA = launchMaeAppInstance(appPath, {
      args: launchArgs,
      env: childEnv,
      logFilePath: join(ARTIFACT_DIR, "mae-acceptance-instance-a.log"),
    });
    if (instanceA.pid <= 0) {
      throw new Error("[mae-acceptance] 首实例 spawn 失败(未取得 pid)");
    }

    // userData 就绪信号:Chromium singleton lockfile(单实例锁的物理落点,AC2 复用)。
    await waitForMaeCondition(
      `mae userData lockfile 出现(${maeUserDataDir})`,
      () => existsSync(join(maeUserDataDir, "lockfile")),
      { timeoutMs: 120_000 },
    );
    // 数据根就绪信号:mae bootstrap setting.json / v2 目录(specs/mae D3 轴)。
    await waitForMaeCondition(
      `mae 数据根出现写入(${maeDataRootDir})`,
      () => directoryHasVisibleContent(maeDataRootDir),
      { timeoutMs: 120_000 },
    );
    // UI 真正起来了:main+gpu+renderer 至少 3 个进程。
    await waitForMaeCondition(
      "mae 打包进程树达到可交互规模(main/gpu/renderer)",
      async () => (await countWindowsImageProcesses(appImageName)) >= 3,
      { timeoutMs: 120_000 },
    );

    await new Promise((resolveSleep) => setTimeout(resolveSleep, STARTUP_AUDIT_SETTLE_MS));

    afterSnapshots = await snapshotDirectoryPlans(officialDirectoryPlans.concat(maeDirectoryPlans));
    await writeE2EJsonFileAtomically(join(ARTIFACT_DIR, "mae-acceptance-directories-after.json"), {
      snapshots: Object.fromEntries([...afterSnapshots].map(([root, snapshot]) => [root, snapshot])),
    });

    const officialDiffs = officialDirectoryPlans.map((plan) => ({
      diff: diffDirectorySnapshots(
        beforeSnapshots.get(plan.root) ?? { entries: {}, rootAbsent: true },
        afterSnapshots.get(plan.root) ?? { entries: {}, rootAbsent: true },
      ),
      plan,
    }));
    for (const { diff, plan } of officialDiffs) {
      // 缺失保持缺失:diff 为空同时覆盖"本来不存在、启动后仍不存在/未创建新条目"。
      expectTrueWithEvidence(
        isDirectorySnapshotDiffEmpty(diff),
        `${plan.label}(${plan.root}) 在 mae 启动前后出现官方侧变化: ${JSON.stringify(serializeDirectorySnapshotDiffForArtifact(diff))}`,
      );
    }
    await writeE2EJsonFileAtomically(
      join(ARTIFACT_DIR, "mae-acceptance-official-dirs-diff.json"),
      Object.fromEntries(
        officialDiffs.map(({ diff, plan }) => [plan.root, serializeDirectorySnapshotDiffForArtifact(diff)]),
      ),
    );

    // mae 侧:此前缺失 → 必须被创建且有内容;预先存在 → 本轮必须有真实写入
    // (singleton lockfile 携带新 pid 重写、会话 DB 每次启动 open,至少其一可见)。
    const maeAssertions = maeDirectoryPlans.map((plan) => {
      const before = beforeSnapshots.get(plan.root) ?? { entries: {}, rootAbsent: true };
      const after = afterSnapshots.get(plan.root) ?? { entries: {}, rootAbsent: true };
      const diff = diffDirectorySnapshots(before, after);
      return { after, before, diff, plan };
    });
    for (const { after, before, diff, plan } of maeAssertions) {
      expectTrueWithEvidence(
        !after.rootAbsent,
        `${plan.label}(${plan.root}) 在 mae 启动后仍未创建`,
      );
      if (before.rootAbsent) {
        expectTrueWithEvidence(
          Object.keys(after.entries).length > 0,
          `${plan.label}(${plan.root}) 本轮创建后目录为空`,
        );
      } else {
        expectTrueWithEvidence(
          !isDirectorySnapshotDiffEmpty(diff),
          `${plan.label}(${plan.root}) 预先存在但本轮零写入(锁文件/会话 DB 至少应有更新): ${JSON.stringify(serializeDirectorySnapshotDiffForArtifact(diff))}`,
        );
      }
    }
    expect(existsSync(join(maeUserDataDir, "lockfile"))).toBe(true);
    await writeE2EJsonFileAtomically(
      join(ARTIFACT_DIR, "mae-acceptance-mae-dirs-diff.json"),
      Object.fromEntries(
        maeAssertions.map(({ diff, plan }) => [plan.root, serializeDirectorySnapshotDiffForArtifact(diff)]),
      ),
    );
  });

  it("AC2: 单实例锁派生自 mae userData——第二实例快速退出并激活首实例,不新建窗口", async function () {
    this.timeout(6 * 60_000);
    if (!instanceA) {
      throw new Error("[mae-acceptance] AC1 未启动首实例(前置用例失败)");
    }
    expect(isWindowsProcessAlive(instanceA.pid)).toBe(true);

    const processCountBefore = await countWindowsImageProcesses(appImageName);
    const instanceB = launchMaeAppInstance(appPath, {
      args: launchArgs,
      env: childEnv,
      logFilePath: join(ARTIFACT_DIR, "mae-acceptance-instance-b.log"),
    });

    const secondInstanceExitCode = await Promise.race([
      instanceB.exitCode,
      new Promise<never>((_resolve, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `[mae-acceptance] 第二实例 ${SECOND_INSTANCE_EXIT_TIMEOUT_MS / 1000}s 内未退出:单实例锁未按 mae userData 派生(可能落到了官方目录或未生效)`,
              ),
            ),
          SECOND_INSTANCE_EXIT_TIMEOUT_MS,
        ),
      ),
    ]);
    const secondInstanceLifetimeMs = Date.now() - instanceB.startedAtMs;

    // 激活链路收尾 + 渲染进程回落稳定窗口。
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 10_000));
    expect(isWindowsProcessAlive(instanceA.pid)).toBe(true);
    expect(isWindowsProcessAlive(instanceB.pid)).toBe(false);

    // "不新建窗口"的机械证据:新窗口必然带动 renderer 进程;进程数不变即窗口集不变。
    let processCountAfter = -1;
    await waitForMaeCondition(
      "第二实例退出后 mae 进程数回落稳定",
      async () => {
        processCountAfter = await countWindowsImageProcesses(appImageName);
        return processCountAfter === processCountBefore;
      },
      { timeoutMs: 30_000 },
    );
    expect(processCountAfter).toBe(processCountBefore);

    // 锁的物理落点在 mae userData(跨应用互斥的物理基础);官方 userData 的零变化已由 AC1 覆盖。
    expect(existsSync(join(maeUserDataDir, "lockfile"))).toBe(true);

    await writeE2EJsonFileAtomically(join(ARTIFACT_DIR, "mae-acceptance-single-instance.json"), {
      firstInstancePid: instanceA.pid,
      firstInstanceStillAlive: isWindowsProcessAlive(instanceA.pid),
      processCountAfterSecondInstance: processCountAfter,
      processCountBeforeSecondInstance: processCountBefore,
      secondInstanceExitCode,
      secondInstanceLifetimeMs,
      singleInstanceLockfilePath: join(maeUserDataDir, "lockfile"),
    });
  });

  it("AC3: 启动期网络审计——官方域名 denylist 零命中,请求清单留证", async function () {
    this.timeout(3 * 60_000);

    if (instanceA && !instanceA.exited && isWindowsProcessAlive(instanceA.pid)) {
      await terminateWindowsProcessTree(instanceA.pid);
    }
    if (!proxy) {
      throw new Error("[mae-acceptance] 抓包代理未启动(前置钩子失败)");
    }
    await proxy.stop();
    proxy = null;

    const captureArtifact = JSON.parse(
      readFileSync(join(ARTIFACT_DIR, "mae-acceptance-network-capture.json"), "utf-8"),
    ) as { records?: MaeStartupRequestRecord[] };
    const records = captureArtifact.records ?? [];
    const hostnames = collectStartupRequestHostnames(records);
    const officialHits = findMaeOfficialDomainHits(hostnames);

    await writeE2EJsonFileAtomically(join(ARTIFACT_DIR, "mae-acceptance-startup-requests.json"), {
      auditWindowMs: STARTUP_AUDIT_SETTLE_MS,
      denylist: MAE_OFFICIAL_DOMAIN_DENYLIST,
      officialDomainHits: officialHits,
      requestCount: records.length,
      requests: summarizeStartupRequestsForArtifact(records),
    });

    expectTrueWithEvidence(
      officialHits.length === 0,
      `启动期出现官方域名外联(违反 specs/mae 全局验收口径): ${JSON.stringify(officialHits)}`,
    );
  });
});

async function snapshotDirectoryPlans(
  plans: readonly AcceptanceDirectoryPlan[],
): Promise<Map<string, DirectorySnapshot>> {
  const snapshots = new Map<string, DirectorySnapshot>();
  for (const plan of plans) {
    snapshots.set(plan.root, await snapshotDirectoryTree(plan.root, { exclusions: plan.exclusions }));
  }
  return snapshots;
}

function directoryHasVisibleContent(root: string): boolean {
  if (!existsSync(root)) {
    return false;
  }
  try {
    return readdirSync(root).length > 0;
  } catch {
    return false;
  }
}
