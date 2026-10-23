import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 编译期常量 ZCODE_PRODUCT_FLAVOR 决定运行身份;沿用 mae-data-root.test.ts 的
// 可切换持有者模式,默认 mae(fork 默认身份),官方身份用例内显式切换。
const productFlavorMock = { value: "mae" as string };

const electronMock = {
  app: {
    getVersion: vi.fn(() => "1.0.0-test"),
    isPackaged: false,
    getPath: vi.fn((name: string) => `/mock/${name}`),
  },
  dialog: { showMessageBox: vi.fn() },
  nativeImage: { createFromPath: vi.fn(() => ({ isEmpty: () => false })) },
  shell: { showItemInFolder: vi.fn() },
};

const loggerMock = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

vi.mock("electron", () => ({ ...electronMock }));

vi.mock("../src/main/logger.js", () => ({ logger: loggerMock }));

vi.mock("@zcode/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@zcode/shared")>();
  return {
    ...actual,
    get ZCODE_PRODUCT_FLAVOR() {
      return productFlavorMock.value;
    },
  };
});

// getZCodeDataRootDir/getAppConfigDir 由各用例按身份指向 fake home 下的数据树;
// 其余导出(如 createFeedbackDiagnosticArchive)透传原实现。
vi.mock("@zcode/services/node", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@zcode/services/node")>();
  return {
    ...actual,
    getZCodeDataRootDir: vi.fn(() => servicesPathMock.zCodeDataRootDir()),
    getAppConfigDir: vi.fn(() => servicesPathMock.appConfigDir()),
  };
});

const servicesPathMock = {
  zCodeDataRootDir: () => "/mock/data-base/.zcode",
  appConfigDir: () => "/mock/data-base/.zcode/v2",
};

const originalEnv: Record<string, string | undefined> = {};
const MANAGED_ENV_KEYS = ["HOME", "USERPROFILE", "ZCODE_STORAGE_DIR", "ZCODE_SESSION_DB_PATH"];

function snapshotManagedEnv() {
  for (const key of MANAGED_ENV_KEYS) {
    originalEnv[key] = process.env[key];
  }
}

function restoreManagedEnv() {
  for (const key of MANAGED_ENV_KEYS) {
    if (originalEnv[key] == null) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }
}

/** 同态官方/mae 双树:fakeHome 下 .zcode(官方)与 .zcode-mae/.zcode(mae)并存,互为对照。 */
async function createDualTreeHome(tempDir: string) {
  const fakeHome = join(tempDir, "home");
  const officialRoot = join(fakeHome, ".zcode");
  const maeRoot = join(fakeHome, ".zcode-mae", ".zcode");
  for (const root of [officialRoot, maeRoot]) {
    await mkdir(join(root, "cli", "log"), { recursive: true });
    await mkdir(join(root, "cli", "rollout"), { recursive: true });
    await mkdir(join(root, "computer-use", "run"), { recursive: true });
    await writeFile(join(root, "cli", "config.json"), `{"root":"${root}"}`, "utf-8");
    await writeFile(join(root, "cli", "log", "agent.log"), `log:${root}`, "utf-8");
    await writeFile(
      join(root, "cli", "rollout", "model-io.jsonl"),
      `rollout:${root}`,
      "utf-8",
    );
    await writeFile(
      join(root, "computer-use", "run", "standalone-abc.sock.exit.log"),
      `exit-log:${root}`,
      "utf-8",
    );
  }
  return { fakeHome, officialRoot, maeRoot };
}

/**
 * mae 运行态写入重定位(#24,specs/mae/README.md D3)。
 *
 * 防丢网:每处挂接一条断言——挂接被 rebase 冲掉即红。
 * 1. host 存储根注入:buildHostProcessEnv 为 mae 身份下发 ZCODE_STORAGE_DIR(= mae 数据根),
 *    Agent 侧 exec 输出/剪贴板/SEA 运行时已读该变量,白拿三处重定位;
 * 2. 诊断导出:exportLogs 的 cli 目录与 computer-use run 目录随 mae 数据根收集,不打包官方副本;
 * 3. 启动设置:index.ts 的 settingsFile 走 bootstrap 重定向 home(mae 记住自己的窗口状态)。
 */
describe("host 存储根注入(buildHostProcessEnv)", () => {
  beforeEach(() => {
    vi.resetModules();
    productFlavorMock.value = "mae";
    servicesPathMock.zCodeDataRootDir = () => "/Users/mae-tester/.zcode-mae/.zcode";
  });

  afterEach(() => {
    productFlavorMock.value = "mae";
  });

  it("mae 身份:注入 ZCODE_STORAGE_DIR=mae 数据根,exec/剪贴板/SEA 三处随轴重定位", async () => {
    const { buildHostProcessEnv } = await import("../src/main/desktopRuntimeEnv.js");

    const env = buildHostProcessEnv({});

    expect(env.ZCODE_STORAGE_DIR).toBe("/Users/mae-tester/.zcode-mae/.zcode");
    expect(env.ZCODE_SESSION_DB_PATH?.replaceAll("\\", "/")).toBe(
      "/Users/mae-tester/.zcode-mae/.zcode/cli/db/db.sqlite",
    );
  });

  it("mae 身份:注入 ZCODE_MAILBOX_ROOT=mae 数据根下 mailbox,会话邮箱不落官方 ~/.zcode(#31)", async () => {
    const { buildHostProcessEnv } = await import("../src/main/desktopRuntimeEnv.js");

    const env = buildHostProcessEnv({});

    expect(env.ZCODE_MAILBOX_ROOT?.replaceAll("\\", "/")).toBe(
      "/Users/mae-tester/.zcode-mae/.zcode/mailbox",
    );
  });

  it("mae 身份:注入值优先于继承环境里的用户自定义 ZCODE_STORAGE_DIR(mae 数据根是权威)", async () => {
    const { buildHostProcessEnv } = await import("../src/main/desktopRuntimeEnv.js");

    const env = buildHostProcessEnv({ ZCODE_STORAGE_DIR: "/tmp/user-storage-override" });

    expect(env.ZCODE_STORAGE_DIR).toBe("/Users/mae-tester/.zcode-mae/.zcode");
  });

  it("官方身份(授权构建)不注入 ZCODE_STORAGE_DIR,保留上游存储根语义", async () => {
    productFlavorMock.value = "production";
    const { buildHostProcessEnv } = await import("../src/main/desktopRuntimeEnv.js");

    const env = buildHostProcessEnv({});

    expect(env.ZCODE_STORAGE_DIR).toBeUndefined();
    expect(env.ZCODE_MAILBOX_ROOT).toBeUndefined();
  });
});

describe("诊断导出目录(exportLogs 收集路径)", () => {
  beforeEach(() => {
    vi.resetModules();
    snapshotManagedEnv();
    delete process.env.ZCODE_STORAGE_DIR;
    productFlavorMock.value = "mae";
  });

  afterEach(() => {
    productFlavorMock.value = "mae";
    restoreManagedEnv();
  });

  it("mae 身份:cli 目录(log/config/rollout)与 computer-use run 目录从 mae 数据根收集,官方树零打包", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "mae-runtime-reloc-"));
    try {
      const { fakeHome, officialRoot, maeRoot } = await createDualTreeHome(tempDir);
      // os.homedir():win32 读 USERPROFILE,POSIX 读 HOME——双写保证两平台同指 fakeHome。
      process.env.HOME = fakeHome;
      process.env.USERPROFILE = fakeHome;
      servicesPathMock.zCodeDataRootDir = () => maeRoot;
      servicesPathMock.appConfigDir = () => join(maeRoot, "v2");

      const sourceDir = join(tempDir, "source");
      await mkdir(join(sourceDir, "logs"), { recursive: true });
      await writeFile(join(sourceDir, "logs", "main.log"), "main-log", "utf-8");

      const { createLogArchiveArtifacts } = await import("../src/main/exportLogs.js");
      const artifacts = await createLogArchiveArtifacts(sourceDir);
      const absolutePaths = artifacts.files.map((file) => file.absolutePath.replace(/\\/g, "/"));
      const archivePaths = artifacts.files.map((file) => file.archivePath);
      const posix = (path: string) => path.replace(/\\/g, "/");

      // mae 树四处全部收集(cli log / config.json / rollout / helper exit.log)。
      expect(absolutePaths).toContain(posix(join(maeRoot, "cli", "config.json")));
      expect(archivePaths).toContain(".zcode/cli/config.json");
      expect(absolutePaths).toContain(posix(join(maeRoot, "cli", "log", "agent.log")));
      expect(absolutePaths).toContain(posix(join(maeRoot, "cli", "rollout", "model-io.jsonl")));
      expect(absolutePaths).toContain(
        posix(join(maeRoot, "computer-use", "run", "standalone-abc.sock.exit.log")),
      );
      // 官方树的同名文件一条都不进包(隐私:导出包只含 mae 自己的数据)。
      for (const path of absolutePaths) {
        expect(path.startsWith(`${posix(officialRoot)}/`)).toBe(false);
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("官方身份(授权构建)保留上游语义:两目录仍从真实 home 的 ~/.zcode 收集", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "mae-runtime-reloc-"));
    try {
      const { fakeHome, officialRoot } = await createDualTreeHome(tempDir);
      process.env.HOME = fakeHome;
      process.env.USERPROFILE = fakeHome;
      productFlavorMock.value = "production";
      servicesPathMock.appConfigDir = () => join(officialRoot, "v2");

      const sourceDir = join(tempDir, "source");
      await mkdir(join(sourceDir, "logs"), { recursive: true });
      await writeFile(join(sourceDir, "logs", "main.log"), "main-log", "utf-8");

      const { createLogArchiveArtifacts } = await import("../src/main/exportLogs.js");
      const artifacts = await createLogArchiveArtifacts(sourceDir);
      const absolutePaths = artifacts.files.map((file) => file.absolutePath.replace(/\\/g, "/"));
      const posix = (path: string) => path.replace(/\\/g, "/");

      expect(absolutePaths).toContain(posix(join(officialRoot, "cli", "config.json")));
      expect(absolutePaths).toContain(
        posix(join(officialRoot, "computer-use", "run", "standalone-abc.sock.exit.log")),
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe("主进程启动设置读取(index.ts settingsFile)", () => {
  it("settingsFile 走 bootstrap 重定向 home:mae 身份解析 ~/.zcode-mae,官方身份等价 homedir()", async () => {
    const indexSource = readFileSync(
      fileURLToPath(new URL("../src/main/index.ts", import.meta.url)),
      "utf-8",
    );

    // 防丢网:rebase 冲掉挂接(回退 homedir 直拼)即红。
    expect(indexSource).toContain("const settingsFile = resolveBootstrapSettingsFile();");
    expect(indexSource).not.toContain(
      'join(homedir(), ".zcode", "v2", "setting.json")',
    );
  });
});
