import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";

const appMock = {
  isPackaged: false,
  getPath: vi.fn((name: string) => `/mock/${name}`),
};

// 编译期常量 ZCODE_PRODUCT_FLAVOR 决定运行身份;沿用 desktopRuntimeEnv.test.ts 的
// 可切换持有者模式,默认 mae(fork 默认身份)。
const productFlavorMock = { value: "mae" as string };

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
  getAppConfigDir: vi.fn(() => "/mock/config"),
  getDataBaseDir: vi.fn(() => "/mock/db"),
  // mae: buildHostProcessEnv 的存储根注入(#24)读取该导出,补进 mock 保持本文件聚焦运行名链
  getZCodeDataRootDir: vi.fn(() => "/mock/db/.zcode"),
  ZCODE_CUA_BUNDLED_HELPER_APP_PATH_ENV: "ZCODE_CUA_BUNDLED_HELPER_APP_PATH",
  ZCODE_WINDOWS_APP_INSTALL_DIR_ENV: "ZCODE_WINDOWS_APP_INSTALL_DIR",
}));

const originalDesktopApplicationName = process.env["ZCODE_DESKTOP_APPLICATION_NAME"];
const originalDesktopUserDataDir = process.env["ZCODE_DESKTOP_USER_DATA_DIR"];
const originalResourcesPathDescriptor = Object.getOwnPropertyDescriptor(process, "resourcesPath");

/**
 * mae 运行名链与运行身份(specs/mae/identity-isolation.md「安装身份与运行身份同一 patch 联动」)。
 * 断言打在 desktopRuntimeEnv 的公开导出上:desktopRuntimeEnv.ts 的 mae 挂接被 rebase 冲掉时,
 * mae 场景回落官方名,本文件变红。
 */
describe("mae 运行身份(运行轴)", () => {
  beforeEach(() => {
    vi.resetModules();
    appMock.isPackaged = false;
    productFlavorMock.value = "mae";
    delete process.env["ZCODE_DESKTOP_APPLICATION_NAME"];
    delete process.env["ZCODE_DESKTOP_USER_DATA_DIR"];
  });

  afterAll(() => {
    appMock.isPackaged = false;
    productFlavorMock.value = "mae";
    if (originalDesktopApplicationName == null) {
      delete process.env["ZCODE_DESKTOP_APPLICATION_NAME"];
    } else {
      process.env["ZCODE_DESKTOP_APPLICATION_NAME"] = originalDesktopApplicationName;
    }
    if (originalDesktopUserDataDir == null) {
      delete process.env["ZCODE_DESKTOP_USER_DATA_DIR"];
    } else {
      process.env["ZCODE_DESKTOP_USER_DATA_DIR"] = originalDesktopUserDataDir;
    }
    if (originalResourcesPathDescriptor) {
      Object.defineProperty(process, "resourcesPath", originalResourcesPathDescriptor);
    }
  });

  it("开发态运行名为 ZCode Mae Dev,与官方开发态互不混淆", async () => {
    const { runtimeApplicationName, runtimeUserDataPath } = await import(
      "../src/main/desktopRuntimeEnv.js"
    );

    expect(runtimeApplicationName).toBe("ZCode Mae Dev");
    expect(runtimeUserDataPath).toBe(join("/mock/appData", "ZCode Mae Dev"));
  });

  it("打包 mae 运行名为 ZCode Mae,Electron userData 与官方目录互不相交", async () => {
    appMock.isPackaged = true;

    const { isMaePackagedRuntime, runtimeApplicationName, runtimeSessionDataPath, runtimeUserDataPath } =
      await import("../src/main/desktopRuntimeEnv.js");

    expect(isMaePackagedRuntime).toBe(true);
    expect(runtimeApplicationName).toBe("ZCode Mae");
    expect(runtimeUserDataPath).toBe(join("/mock/appData", "ZCode Mae"));
    expect(runtimeSessionDataPath).toBe(join("/mock/appData", "ZCode Mae", "session"));
  });

  it("打包 mae 的 Computer Use Helper 安装变体为 mae(与 production/preview 隔离)", async () => {
    appMock.isPackaged = true;
    Object.defineProperty(process, "resourcesPath", {
      value: "/mock/resources",
      configurable: true,
    });

    const { buildHostProcessEnv } = await import("../src/main/desktopRuntimeEnv.js");
    const env = buildHostProcessEnv({});

    expect(env.ZCODE_CUA_HELPER_INSTALL_VARIANT).toBe("mae");
  });

  it("官方身份(授权构建)的运行名链保持上游语义", async () => {
    appMock.isPackaged = true;

    productFlavorMock.value = "preview";
    const previewModule = await import("../src/main/desktopRuntimeEnv.js");
    expect(previewModule.runtimeApplicationName).toBe("ZCode Preview");
    expect(previewModule.buildHostProcessEnv({}).ZCODE_CUA_HELPER_INSTALL_VARIANT).toBe("preview");

    vi.resetModules();
    productFlavorMock.value = "production";
    const productionModule = await import("../src/main/desktopRuntimeEnv.js");
    expect(productionModule.runtimeApplicationName).toBe("ZCode");
    expect(
      productionModule.buildHostProcessEnv({}).ZCODE_CUA_HELPER_INSTALL_VARIANT,
    ).toBeUndefined();

    vi.resetModules();
    appMock.isPackaged = false;
    const officialDevModule = await import("../src/main/desktopRuntimeEnv.js");
    expect(officialDevModule.runtimeApplicationName).toBe("ZCode Dev");
  });

  it("e2e 显式覆盖仍优先于身份默认值", async () => {
    process.env["ZCODE_DESKTOP_APPLICATION_NAME"] = "ZCode E2E";

    const { runtimeApplicationName } = await import("../src/main/desktopRuntimeEnv.js");

    expect(runtimeApplicationName).toBe("ZCode E2E");
  });
});

describe("mae 运行名链纯函数", () => {
  it("mae 身份:开发态 ZCode Mae Dev,打包态 ZCode Mae", async () => {
    const { resolveMaeRuntimeApplicationName } = await import("../scripts/mae-identity.mjs");

    expect(resolveMaeRuntimeApplicationName({ isLocalDevelopmentRuntime: true, productFlavor: "mae" })).toBe(
      "ZCode Mae Dev",
    );
    expect(
      resolveMaeRuntimeApplicationName({ isLocalDevelopmentRuntime: false, productFlavor: "mae" }),
    ).toBe("ZCode Mae");
  });

  it("官方身份保留上游命名,与 mae 开发态三方互不混淆", async () => {
    const { resolveMaeRuntimeApplicationName } = await import("../scripts/mae-identity.mjs");

    expect(
      resolveMaeRuntimeApplicationName({ isLocalDevelopmentRuntime: true, productFlavor: "production" }),
    ).toBe("ZCode Dev");
    expect(
      resolveMaeRuntimeApplicationName({ isLocalDevelopmentRuntime: true, productFlavor: "preview" }),
    ).toBe("ZCode Dev");
    expect(
      resolveMaeRuntimeApplicationName({ isLocalDevelopmentRuntime: false, productFlavor: "preview" }),
    ).toBe("ZCode Preview");
    expect(
      resolveMaeRuntimeApplicationName({ isLocalDevelopmentRuntime: false, productFlavor: "production" }),
    ).toBe("ZCode");
  });
});
