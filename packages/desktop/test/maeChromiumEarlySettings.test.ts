import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 编译期常量 ZCODE_PRODUCT_FLAVOR 决定运行身份;沿用 mae-data-root.test.ts 的
// 可切换持有者模式,默认 mae(fork 默认身份),官方身份用例内显式切换。
const productFlavorMock = { value: "mae" as string };

vi.mock("electron", () => ({ app: { isPackaged: false } }));

vi.mock("@zcode/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@zcode/shared")>();
  return {
    ...actual,
    get ZCODE_PRODUCT_FLAVOR() {
      return productFlavorMock.value;
    },
  };
});

vi.mock("@zcode/services/node", () => ({
  setDataBaseDir: vi.fn(),
  getAppConfigDir: vi.fn(() => "/mock/config"),
  getDataBaseDir: vi.fn(() => "/mock/data-base"),
  getZCodeDataRootDir: vi.fn(() => "/mock/data-base/.zcode"),
}));

const MANAGED_ENV_KEYS = ["HOME", "USERPROFILE", "ZCODE_DATA_BASE_DIR", "ZCODE_DESKTOP_HOME_DIR"];
const originalEnv: Record<string, string | undefined> = {};
const tempDirs: string[] = [];

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

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/**
 * mae 早期 Chromium 硬件加速 setting 读取收口(#31,specs/mae D3)。
 *
 * 防丢网:早期启动读 setting.json 的 HW accel 布尔,默认路径须复用启动 bootstrap 的
 * mae 感知解析(desktopDataBaseDirBootstrap)——mae 身份读 ~/.zcode-mae/.zcode/v2/setting.json,
 * 官方身份等价 homedir();挂接被 rebase 冲掉即红。
 */
describe("早期 Chromium 硬件加速 setting 读取的 mae 数据根挂接", () => {
  beforeEach(() => {
    vi.resetModules();
    productFlavorMock.value = "mae";
    snapshotManagedEnv();
    delete process.env.ZCODE_DATA_BASE_DIR;
    delete process.env.ZCODE_DESKTOP_HOME_DIR;
  });

  afterEach(() => {
    productFlavorMock.value = "mae";
    restoreManagedEnv();
    for (const dir of tempDirs.splice(0)) {
      void rm(dir, { recursive: true, force: true });
    }
  });

  it("mae 身份:默认 setting.json 解析到 mae 数据根,不读官方 ~/.zcode 副本", async () => {
    const fakeHome = await makeTempDir("mae-chromium-home-");
    process.env.HOME = fakeHome;
    process.env.USERPROFILE = fakeHome;
    const {
      resolveChromiumHardwareAccelerationSettingsFile,
    } = await import("../src/main/desktopChromiumHardwareAccelerationBootstrap.js");

    expect(resolveChromiumHardwareAccelerationSettingsFile()).toBe(
      join(fakeHome, ".zcode-mae", ".zcode", "v2", "setting.json"),
    );
  });

  it("官方身份(显式授权构建):默认路径保持 ~/.zcode/v2/setting.json 上游语义", async () => {
    productFlavorMock.value = "production";
    const fakeHome = await makeTempDir("mae-chromium-home-");
    process.env.HOME = fakeHome;
    process.env.USERPROFILE = fakeHome;
    const {
      resolveChromiumHardwareAccelerationSettingsFile,
    } = await import("../src/main/desktopChromiumHardwareAccelerationBootstrap.js");

    expect(resolveChromiumHardwareAccelerationSettingsFile()).toBe(
      join(fakeHome, ".zcode", "v2", "setting.json"),
    );
  });

  it("显式 homePath(测试注入)仍按该 home 解析", async () => {
    const {
      resolveChromiumHardwareAccelerationSettingsFile,
    } = await import("../src/main/desktopChromiumHardwareAccelerationBootstrap.js");

    expect(resolveChromiumHardwareAccelerationSettingsFile("/explicit/home")).toBe(
      join("/explicit/home", ".zcode", "v2", "setting.json"),
    );
  });

  it("mae 身份:磁盘读取(applyEarly 无 rawSettings)落在 mae 根的 setting.json", async () => {
    const fakeHome = await makeTempDir("mae-chromium-home-");
    process.env.HOME = fakeHome;
    process.env.USERPROFILE = fakeHome;
    const maeSettingsDir = join(fakeHome, ".zcode-mae", ".zcode", "v2");
    await mkdir(maeSettingsDir, { recursive: true });
    await writeFile(
      join(maeSettingsDir, "setting.json"),
      JSON.stringify({ desktopChromiumHardwareAccelerationEnabled: false }),
      "utf-8",
    );
    const {
      applyEarlyChromiumHardwareAccelerationBootstrap,
    } = await import("../src/main/desktopChromiumHardwareAccelerationBootstrap.js");

    const disableHardwareAcceleration = vi.fn();
    const enabled = applyEarlyChromiumHardwareAccelerationBootstrap({
      disableHardwareAcceleration,
    });

    expect(enabled).toBe(false);
    expect(disableHardwareAcceleration).toHaveBeenCalledTimes(1);
  });
});
