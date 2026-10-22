import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveZCodeBuiltinProviderConfigFilePath } from "../src/main/desktopProviderConfig.js";

// 实现用 node:path join 产出本机分隔符（运行时语义正确），Windows 单测下需按
// POSIX 口径归一后再比较，期望值才能跨平台成立。
function toPosixPath(value: string) {
  return value.replaceAll("\\", "/");
}

describe("resolveZCodeBuiltinProviderConfigFilePath", () => {
  it("正式包读取 resources，开发态读取仓库 config", () => {
    expect(
      toPosixPath(
        resolveZCodeBuiltinProviderConfigFilePath({
          isPackaged: true,
          resourcesPath: "/Applications/ZCode.app/Contents/Resources",
          appPath: "/Applications/ZCode.app/Contents/Resources/app.asar",
          // 隔离宿主环境变量：ZCode 开发运行时会注入 ZCODE_BUILTIN_PROVIDER_CONFIG_FILE，
          // 不显式清空会让本机跑单测时短路进 explicitPath 分支（CI 无此变量所以一直是绿的）。
          // mae: 默认外联静默会切换到 mae 目录；官方布局断言需显式授权官方身份(#7)
          env: { ZCODE_ALLOW_OFFICIAL_IDENTITY: "1" },
        }),
      ),
    ).toBe("/Applications/ZCode.app/Contents/Resources/config/provider/zcode-builtin.json");

    expect(
      toPosixPath(
        resolveZCodeBuiltinProviderConfigFilePath({
          isPackaged: false,
          appPath: "/repo/packages/desktop",
          env: { ZCODE_ALLOW_OFFICIAL_IDENTITY: "1" },
        }),
      ),
    ).toBe("/repo/config/provider/zcode-builtin.test.json");
  });

  it("显式 ZCode Built-in Config Source 优先于安装布局", () => {
    expect(
      resolveZCodeBuiltinProviderConfigFilePath({
        env: { ZCODE_BUILTIN_PROVIDER_CONFIG_FILE: "/fixtures/zcode-builtin.json" },
        isPackaged: true,
        resourcesPath: "/Applications/ZCode.app/Contents/Resources",
      }),
    ).toBe("/fixtures/zcode-builtin.json");
  });
});

describe("开发态按编译环境选取配置", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });
  it.each(["test", "production"])("%s 不受启动时的环境变量反向覆盖", async (environment) => {
    vi.resetModules();
    vi.stubGlobal("__ZCODE_ENV__", environment);
    const { resolveZCodeBuiltinProviderConfigFilePath: resolvePath } =
      await import("../src/main/desktopProviderConfig.js");
    expect(
      toPosixPath(
        resolvePath({
          isPackaged: false,
          appPath: "/repo/packages/desktop",
          env: { ZCODE_ENV: environment === "test" ? "production" : "test" },
        }),
      ),
    ).toBe(
      // mae: 默认外联静默下开发态同样落到 mae 裁剪目录,编译期环境只决定 prod/test 孪生文件(#7)
      `/repo/config/provider/${environment === "production" ? "mae-builtin.json" : "mae-builtin.test.json"}`,
    );
  });
});

// mae: 外联静默默认启用——目录解析默认指向 mae 裁剪目录;显式 ZCODE_ALLOW_OFFICIAL_IDENTITY=1 时恢复官方目录(#7)
describe("mae 外联静默:内置 provider 目录本地化", () => {
  it("默认解析 mae 目录(打包态与开发态)", () => {
    expect(
      toPosixPath(
        resolveZCodeBuiltinProviderConfigFilePath({
          isPackaged: true,
          resourcesPath: "/Applications/ZCodeMae.app/Contents/Resources",
          env: {},
        }),
      ),
    ).toBe("/Applications/ZCodeMae.app/Contents/Resources/config/provider/mae-builtin.json");

    expect(
      toPosixPath(
        resolveZCodeBuiltinProviderConfigFilePath({
          isPackaged: false,
          appPath: "/repo/packages/desktop",
          env: {},
        }),
      ),
    ).toBe("/repo/config/provider/mae-builtin.test.json");
  });

  it("显式 ZCODE_BUILTIN_PROVIDER_CONFIG_FILE 仍优先于 mae 默认", () => {
    expect(
      resolveZCodeBuiltinProviderConfigFilePath({
        env: { ZCODE_BUILTIN_PROVIDER_CONFIG_FILE: "/fixtures/custom.json" },
        isPackaged: true,
        resourcesPath: "/Applications/ZCodeMae.app/Contents/Resources",
      }),
    ).toBe("/fixtures/custom.json");
  });

  it("ZCODE_ALLOW_OFFICIAL_IDENTITY=1 恢复官方目录解析", () => {
    expect(
      toPosixPath(
        resolveZCodeBuiltinProviderConfigFilePath({
          isPackaged: true,
          resourcesPath: "/Applications/ZCode.app/Contents/Resources",
          env: { ZCODE_ALLOW_OFFICIAL_IDENTITY: "1" },
        }),
      ),
    ).toBe("/Applications/ZCode.app/Contents/Resources/config/provider/zcode-builtin.json");
  });
});
