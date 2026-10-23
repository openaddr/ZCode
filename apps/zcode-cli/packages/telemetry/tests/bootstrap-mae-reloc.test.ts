import { readFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareModelTelemetryEnv } from "../src/bootstrap.js";

/**
 * mae 运行态写入重定位——CLI standalone 设备态(telemetry-state.json)存储根(#31,specs/mae D3)。
 *
 * 防丢网:mae 桌面 host 经 buildHostProcessEnv 注入 ZCODE_STORAGE_DIR(mae 数据根),CLI 侧
 * standalone 设备态的默认根随 CLI 存储轴落 mae 树({storage}/v2/telemetry-state.json);
 * 未注入(官方 CLI/官方桌面)保持上游 ~/.zcode/v2 语义;ZCODE_HOME 为上游显式覆盖轴,优先级最高。
 * 挂接被 rebase 冲掉即红。
 */
describe("standalone 设备态存储根的 mae 挂接", () => {
  const tempDirs: string[] = [];

  async function makeTempDir(prefix: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("ZCODE_STORAGE_DIR 已注入(mae 桌面 host)时设备态落 <storage>/v2/telemetry-state.json", async () => {
    const storageRoot = await makeTempDir("mae-telemetry-state-");
    const env = {
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://127.0.0.1:1/v1/traces",
      ZCODE_STORAGE_DIR: storageRoot,
    };

    const prepared = await prepareModelTelemetryEnv(env, {
      cliVersion: "0.17.0",
      productVersion: "2026.1022.0",
    });

    expect(prepared.ZCODE_TELEMETRY_DEVICE_MID).toMatch(/^[0-9a-f-]{36}$/u);
    const state = JSON.parse(
      await readFile(join(storageRoot, "v2", "telemetry-state.json"), "utf8"),
    ) as { deviceMid?: string };
    expect(state.deviceMid).toBe(prepared.ZCODE_TELEMETRY_DEVICE_MID);
  });

  it("ZCODE_HOME(上游显式覆盖轴)仍优先于 ZCODE_STORAGE_DIR", async () => {
    const explicitHome = await makeTempDir("mae-telemetry-explicit-");
    const storageRoot = await makeTempDir("mae-telemetry-storage-ignored-");
    const env = {
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://127.0.0.1:1/v1/traces",
      ZCODE_HOME: explicitHome,
      ZCODE_STORAGE_DIR: storageRoot,
    };

    const prepared = await prepareModelTelemetryEnv(env, {
      cliVersion: "0.17.0",
      productVersion: "2026.1022.0",
    });

    const state = JSON.parse(
      await readFile(join(explicitHome, "v2", "telemetry-state.json"), "utf8"),
    ) as { deviceMid?: string };
    expect(state.deviceMid).toBe(prepared.ZCODE_TELEMETRY_DEVICE_MID);
  });
});
