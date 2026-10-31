import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { defaultConfigPath, DtsFlowConfigError, loadConfig } from "../src/adapters/configLoader.js";

async function tempHome(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mae-dts-flow-config-"));
}

describe("loadConfig", () => {
  it("mock 模式全缺省可启动,工号兜底 dev,目录落在 ~/.zcode-mae 下", async () => {
    const home = await tempHome();
    const mockConfig = await loadConfig({ homeDir: home, configPath: await writeConfig(home, { mock: true }) });
    expect(mockConfig.mock).toBe(true);
    expect(mockConfig.employeeId).toBe("dev");
    expect(mockConfig.dataDir).toBe(path.join(home, ".zcode-mae", "dts-flow"));
    expect(mockConfig.binDir).toBe(path.join(home, ".zcode-mae", "bin"));
    expect(mockConfig.httpPort).toBe(8788);
  });

  it("非 mock 缺工号 fail-loud 并指名字段", async () => {
    const home = await tempHome();
    await expect(loadConfig({ homeDir: home })).rejects.toThrow(DtsFlowConfigError);
    await expect(loadConfig({ homeDir: home })).rejects.toThrow(/employeeId/);
  });

  it("配置文件字段生效;未知字段拒绝;直连时代退役键容忍忽略", async () => {
    const home = await tempHome();
    const configPath = await writeConfig(home, {
      employeeId: "ning",
      httpPort: 9999,
      cloudBaseUrl: "http://mae-flow.internal:8787/",
      unknownKey: true,
    });
    await expect(loadConfig({ homeDir: home, configPath })).rejects.toThrow(/unknownKey/);
    const config = await loadConfig({
      homeDir: home,
      configPath: await writeConfig(home, {
        employeeId: "ning",
        httpPort: 9999,
        cloudBaseUrl: "http://mae-flow.internal:8787/",
        dtsGatewayUrl: "http://old-gateway/rpc",
        dtsTokenPath: "C:/old/token",
      }),
    });
    expect(config.employeeId).toBe("ning");
    expect(config.httpPort).toBe(9999);
    expect(config.cloudBaseUrl).toBe("http://mae-flow.internal:8787");
    expect("dtsGatewayUrl" in config).toBe(false);
  });

  it("非法值 fail-loud:坏端口/坏 URL/给定的配置文件不存在", async () => {
    const home = await tempHome();
    await expect(
      loadConfig({ homeDir: home, configPath: await writeConfig(home, { employeeId: "ning", httpPort: 0 }) }),
    ).rejects.toThrow(/httpPort/);
    await expect(
      loadConfig({ homeDir: home, configPath: await writeConfig(home, { employeeId: "ning", cloudBaseUrl: "ftp://x" }) }),
    ).rejects.toThrow(/cloudBaseUrl/);
    await expect(loadConfig({ homeDir: home, configPath: path.join(home, "nope.json") })).rejects.toThrow(/配置文件读取失败/);
  });
});

async function writeConfig(home: string, values: Record<string, unknown>): Promise<string> {
  const file = path.join(home, `config-${Math.random().toString(36).slice(2, 8)}.json`);
  await writeFile(file, JSON.stringify(values), "utf8");
  return file;
}

describe("defaultConfigPath", () => {
  it("缺省配置路径 = <home>/.zcode-mae/dts-flow/config.json(设置分区落盘位置,#63)", () => {
    const windowsPath = defaultConfigPath("C:/Users/x");
    expect(windowsPath).toContain(".zcode-mae");
    expect(windowsPath).toContain("dts-flow");
    expect(windowsPath.endsWith(path.join("dts-flow", "config.json")) || windowsPath.endsWith("dts-flow\\config.json")).toBe(true);
  });
});
