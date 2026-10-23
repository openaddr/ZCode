import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const toPosix = (path: string) => path.replaceAll("\\", "/");

/**
 * mae 运行态写入重定位——CLI 插件配置文件默认基目录(#31,specs/mae D3)。
 *
 * 防丢网:mae 桌面 host 经 buildHostProcessEnv 透传 ZCODE_DESKTOP_HOME_DIR(mae 数据根),
 * CLI 侧(adapters)插件配置文件的默认基目录与 services 侧 hooksService/mcpSyncService
 * (#25)同链——`ZCODE_DESKTOP_HOME_DIR → HOME → USERPROFILE → homedir()`,四端读写同一份
 * {home}/.zcode/cli/config.json;未注入(官方 CLI/官方桌面)保持上游 ~/.zcode/cli 语义。
 * 挂接被 rebase 冲掉即红。
 */
describe("插件配置文件默认基目录的 mae 用户级 home 挂接", () => {
  const MANAGED_ENV_KEYS = ["ZCODE_DESKTOP_HOME_DIR", "HOME", "USERPROFILE"] as const;
  const originalEnv: Record<string, (typeof MANAGED_ENV_KEYS)[number] | undefined> = {};

  beforeEach(() => {
    for (const key of MANAGED_ENV_KEYS) {
      originalEnv[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const key of MANAGED_ENV_KEYS) {
      if (originalEnv[key] == null) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  });

  it("ZCODE_DESKTOP_HOME_DIR 已注入(mae 桌面 host)时默认配置路径落 mae 数据根", async () => {
    process.env.ZCODE_DESKTOP_HOME_DIR = "/Users/mae-tester/.zcode-mae";
    const { getDefaultConfigPath } = await import("../src/config/file-config.adapter.js");

    expect(toPosix(getDefaultConfigPath())).toBe(
      "/Users/mae-tester/.zcode-mae/.zcode/cli/config.json",
    );
  });

  it("loadFileConfig 默认装载路径同轴:mae 根下无文件时 path 指向 mae 树且不落官方", async () => {
    process.env.ZCODE_DESKTOP_HOME_DIR = "/Users/mae-tester/.zcode-mae";
    const { loadFileConfig } = await import("../src/config/file-config.adapter.js");

    const result = loadFileConfig();
    expect(toPosix(result.path)).toBe(
      toPosix(join(resolve("/Users/mae-tester/.zcode-mae/.zcode/cli"), "config.json")),
    );
    expect(result.loaded).toBe(false);
    expect(result.config).toEqual({});
  });

  it("未注入覆盖(官方 CLI/官方桌面)时保持上游 ~/.zcode/cli 语义", async () => {
    delete process.env.ZCODE_DESKTOP_HOME_DIR;
    const { getDefaultConfigPath } = await import("../src/config/file-config.adapter.js");

    expect(toPosix(getDefaultConfigPath())).toBe(
      toPosix(join(homedir(), ".zcode", "cli", "config.json")),
    );
  });

  it("显式 baseDir/filePath 参数(调用方注入)优先于环境轴", async () => {
    process.env.ZCODE_DESKTOP_HOME_DIR = "/Users/mae-tester/.zcode-mae";
    const { loadFileConfig } = await import("../src/config/file-config.adapter.js");

    const byBaseDir = loadFileConfig(undefined, { baseDir: "/explicit/base" });
    expect(toPosix(byBaseDir.path)).toBe(toPosix(join(resolve("/explicit/base"), "config.json")));
    const byFilePath = loadFileConfig("/explicit/path/config.json");
    expect(toPosix(byFilePath.path)).toBe(toPosix(resolve("/explicit/path/config.json")));
  });
});
