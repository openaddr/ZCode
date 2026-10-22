import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";
import { DEV_HELPER_APP_NAME } from "@zcode/zcode-cua/broker/helperConstants";

// 编译期常量 ZCODE_PRODUCT_FLAVOR 决定运行身份;沿用 mae-runtime-identity.test.ts 的
// 可切换持有者模式,默认 mae(fork 默认身份)。
const productFlavorMock = { value: "mae" as string };
const setDataBaseDirMock = vi.fn();
const getDataBaseDirMock = vi.fn(() => "/mock/data-base");
const getZCodeDataRootDirMock = vi.fn(() => "/mock/data-base/.zcode");

const appMock = {
  isPackaged: false,
  getPath: vi.fn((name: string) => `/mock/${name}`),
};

vi.mock("electron", () => ({
  app: appMock,
}));

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
  setDataBaseDir: setDataBaseDirMock,
  getAppConfigDir: vi.fn(() => "/mock/config"),
  getDataBaseDir: getDataBaseDirMock,
  getZCodeDataRootDir: getZCodeDataRootDirMock,
  ZCODE_CUA_BUNDLED_HELPER_APP_PATH_ENV: "ZCODE_CUA_BUNDLED_HELPER_APP_PATH",
  ZCODE_WINDOWS_APP_INSTALL_DIR_ENV: "ZCODE_WINDOWS_APP_INSTALL_DIR",
}));

const originalEnv: Record<string, string | undefined> = {};
const MANAGED_ENV_KEYS = ["HOME", "USERPROFILE", "ZCODE_DATA_BASE_DIR", "ZCODE_DESKTOP_HOME_DIR"];

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

/**
 * mae 业务数据根隔离(#9,specs/mae/identity-isolation.md、specs/mae/README.md D10/D3)。
 *
 * 三层断言:
 * 1. 纯函数层:mae 数据根默认 ~/.zcode-mae(数据落 ~/.zcode-mae/.zcode,与官方 ~/.zcode 零交集);
 * 2. 启动挂接层:desktopDataBaseDirBootstrap 的 mae 挂接被 rebase 冲掉时本文件变红(防丢网);
 * 3. 透传层:Host/Agent 子进程经 buildHostProcessEnv 收到 mae 数据根。
 */
describe("mae 数据根解析(纯函数层)", () => {
  it("mae 数据基目录为 HOME 下的 .zcode-mae(D10)", async () => {
    const { resolveMaeDataBaseDir } = await import("../scripts/mae-identity.mjs");

    expect(resolveMaeDataBaseDir({ HOME: "/Users/tester" })).toBe(
      join("/Users/tester", ".zcode-mae"),
    );
    // Windows 风格 home 同样成立:目录名拼接不带平台语义。
    expect(resolveMaeDataBaseDir({ HOME: "C:\\Users\\tester" })).toBe(
      join("C:\\Users\\tester", ".zcode-mae"),
    );
  });

  it("HOME 缺失时回退 os.homedir(),与 paths.ts 的默认基目录兜底链同源", async () => {
    const { resolveMaeDataBaseDir } = await import("../scripts/mae-identity.mjs");

    expect(resolveMaeDataBaseDir({})).toBe(join(homedir(), ".zcode-mae"));
  });

  it("mae 身份的启动期数据根决策返回 ~/.zcode-mae(setDataBaseDir 载体,优先级高于 env)", async () => {
    const { resolveMaeDataRootBootstrap } = await import("../scripts/mae-identity.mjs");

    expect(resolveMaeDataRootBootstrap("mae", { HOME: "/Users/tester" })).toBe(
      join("/Users/tester", ".zcode-mae"),
    );
  });

  it("显式 ZCODE_DATA_BASE_DIR 是保留覆盖轴(上游 e2e/CLI 调试重定向),mae 不劫持", async () => {
    const { resolveMaeDataRootBootstrap } = await import("../scripts/mae-identity.mjs");

    expect(
      resolveMaeDataRootBootstrap("mae", {
        HOME: "/Users/tester",
        ZCODE_DATA_BASE_DIR: "/tmp/e2e-home",
      }),
    ).toBeNull();
    // 空白值视为未设置。
    expect(
      resolveMaeDataRootBootstrap("mae", { HOME: "/Users/tester", ZCODE_DATA_BASE_DIR: "   " }),
    ).toBe(join("/Users/tester", ".zcode-mae"));
  });

  it("官方身份(显式授权构建)返回 null,完全保留上游数据根语义", async () => {
    const { resolveMaeDataRootBootstrap } = await import("../scripts/mae-identity.mjs");

    expect(resolveMaeDataRootBootstrap("production", { HOME: "/Users/tester" })).toBeNull();
    expect(resolveMaeDataRootBootstrap("preview", { HOME: "/Users/tester" })).toBeNull();
  });
});

describe("mae 数据根启动挂接(启动轴,desktopDataBaseDirBootstrap)", () => {
  beforeEach(() => {
    vi.resetModules();
    snapshotManagedEnv();
    productFlavorMock.value = "mae";
    setDataBaseDirMock.mockClear();
    delete process.env.ZCODE_DATA_BASE_DIR;
    delete process.env.ZCODE_DESKTOP_HOME_DIR;
    process.env.HOME = "/Users/mae-tester";
  });

  afterEach(() => {
    productFlavorMock.value = "mae";
    restoreManagedEnv();
  });

  it("mae 身份:启动早期 setDataBaseDir(~/.zcode-mae),bootstrap 设置文件同根解析", async () => {
    const bootstrap = await import("../src/main/desktopDataBaseDirBootstrap.js");

    expect(bootstrap.resolveBootstrapSettingsFile().replace(/\\/g, "/")).toBe(
      "/Users/mae-tester/.zcode-mae/.zcode/v2/setting.json",
    );
    expect(setDataBaseDirMock).not.toHaveBeenCalled();

    bootstrap.applyEarlyDataBaseDirBootstrap();
    expect(setDataBaseDirMock).toHaveBeenCalledWith(join("/Users/mae-tester", ".zcode-mae"));
  });

  it("mae 身份:注入 ZCODE_DESKTOP_HOME_DIR 让 settingService 的 setting.json 落 mae 根,不污染官方 ~/.zcode", async () => {
    const bootstrap = await import("../src/main/desktopDataBaseDirBootstrap.js");

    bootstrap.applyEarlyDataBaseDirBootstrap();

    expect(process.env.ZCODE_DESKTOP_HOME_DIR).toBe(join("/Users/mae-tester", ".zcode-mae"));
  });

  it("已有的显式 ZCODE_DESKTOP_HOME_DIR(e2e/开发者)优先,mae 不覆盖", async () => {
    process.env.ZCODE_DESKTOP_HOME_DIR = "/tmp/e2e-home";
    const bootstrap = await import("../src/main/desktopDataBaseDirBootstrap.js");

    bootstrap.applyEarlyDataBaseDirBootstrap();

    expect(process.env.ZCODE_DESKTOP_HOME_DIR).toBe("/tmp/e2e-home");
  });

  it("显式 ZCODE_DATA_BASE_DIR(e2e/CLI 调试)保留上游语义:不注入 mae 根,bootstrap 设置文件走真实 home", async () => {
    process.env.ZCODE_DATA_BASE_DIR = "/tmp/e2e-home";
    const bootstrap = await import("../src/main/desktopDataBaseDirBootstrap.js");

    expect(bootstrap.resolveBootstrapSettingsFile().replace(/\\/g, "/")).toBe(
      "/Users/mae-tester/.zcode/v2/setting.json",
    );
    bootstrap.applyEarlyDataBaseDirBootstrap();
    expect(setDataBaseDirMock).not.toHaveBeenCalled();
    expect(process.env.ZCODE_DESKTOP_HOME_DIR).toBeUndefined();
  });

  it("官方身份(授权构建)保留上游语义:设置文件走真实 home,不注入任何 mae 路径", async () => {
    productFlavorMock.value = "production";
    const bootstrap = await import("../src/main/desktopDataBaseDirBootstrap.js");

    expect(bootstrap.resolveBootstrapSettingsFile().replace(/\\/g, "/")).toBe(
      "/Users/mae-tester/.zcode/v2/setting.json",
    );
    bootstrap.applyEarlyDataBaseDirBootstrap();
    expect(setDataBaseDirMock).not.toHaveBeenCalled();
    expect(process.env.ZCODE_DESKTOP_HOME_DIR).toBeUndefined();
  });

  it("mae 用户的自定义数据目录(mae 根下 setting.json 的 dataBaseDir)仍优先生效", async () => {
    // readBootstrapDataBaseDirFromDisk 从 mae 根读 setting.json;此处直接验证
    // extractBootstrapDataBaseDir 与 mae 决策正交:自定义目录覆盖默认 mae 根。
    const bootstrap = await import("../src/main/desktopDataBaseDirBootstrap.js");

    expect(bootstrap.extractBootstrapDataBaseDir({ dataBaseDir: "/data/custom" })).toBe(
      "/data/custom",
    );
  });
});

describe("mae 数据根透传与 helper 兜底(运行轴,desktopRuntimeEnv)", () => {
  const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");

  beforeEach(() => {
    vi.resetModules();
    appMock.isPackaged = false;
    productFlavorMock.value = "mae";
    getDataBaseDirMock.mockReturnValue("/Users/mae-tester/.zcode-mae");
    getZCodeDataRootDirMock.mockReturnValue("/Users/mae-tester/.zcode-mae/.zcode");
  });

  afterEach(() => {
    productFlavorMock.value = "mae";
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, "platform", originalPlatformDescriptor);
    }
  });

  it("Host/Agent 透传:mae 数据根 ≠ homedir 时经 ZCODE_DATA_BASE_DIR 下发 host 子进程", async () => {
    const { buildHostProcessEnv } = await import("../src/main/desktopRuntimeEnv.js");

    const env = buildHostProcessEnv({});

    expect(env.ZCODE_DATA_BASE_DIR).toBe("/Users/mae-tester/.zcode-mae");
  });

  it("Host/Agent 透传:注入的 ZCODE_DESKTOP_HOME_DIR(settingService 的 mae home)不被 sanitize 剔除", async () => {
    process.env.ZCODE_DESKTOP_HOME_DIR = "/Users/mae-tester/.zcode-mae";
    try {
      const { buildHostProcessEnv } = await import("../src/main/desktopRuntimeEnv.js");

      const env = buildHostProcessEnv({});

      expect(env.ZCODE_DESKTOP_HOME_DIR).toBe("/Users/mae-tester/.zcode-mae");
    } finally {
      delete process.env.ZCODE_DESKTOP_HOME_DIR;
    }
  });

  it("开发态 computer-use helper 兜底路径 mae 化:未显式 ZCODE_HOME 时落 mae 数据根", async () => {
    // 免签 dev Helper bundle 解析只在 darwin 生效;测试内临时切换平台语义(结束即恢复)。
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    const { buildHostProcessEnv } = await import("../src/main/desktopRuntimeEnv.js");

    const env = buildHostProcessEnv({ ZCODE_CUA_HELPER_ALLOW_UNSIGNED_LOCAL: "1" });

    expect(env.ZCODE_CUA_BUNDLED_HELPER_APP_PATH).toBe(
      join("/Users/mae-tester/.zcode-mae/.zcode", "computer-use", "dev", DEV_HELPER_APP_NAME),
    );
  });

  it("显式 ZCODE_HOME 仍优先于 mae 兜底(开发者手工指定)", async () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    const { buildHostProcessEnv } = await import("../src/main/desktopRuntimeEnv.js");

    const env = buildHostProcessEnv({
      ZCODE_HOME: "/tmp/zcode-cua-dev-home",
      ZCODE_CUA_HELPER_ALLOW_UNSIGNED_LOCAL: "1",
    });

    expect(env.ZCODE_CUA_BUNDLED_HELPER_APP_PATH).toBe(
      join("/tmp/zcode-cua-dev-home", "computer-use", "dev", DEV_HELPER_APP_NAME),
    );
  });

  it("官方身份(授权构建)的 helper 兜底保持上游 ~/.zcode 语义", async () => {
    productFlavorMock.value = "production";
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    const { buildHostProcessEnv } = await import("../src/main/desktopRuntimeEnv.js");

    const env = buildHostProcessEnv({ ZCODE_CUA_HELPER_ALLOW_UNSIGNED_LOCAL: "1" });

    expect(env.ZCODE_CUA_BUNDLED_HELPER_APP_PATH).toBe(
      join(homedir(), ".zcode", "computer-use", "dev", DEV_HELPER_APP_NAME),
    );
  });
});
