import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { setDataBaseDir } from "../src/paths.js";
import { ensureTelemetryDeviceMid } from "../src/telemetry/telemetryCore.js";

/**
 * mae 设备态根(services telemetryCore)的数据基目录轴挂接(#31,specs/mae D3:
 * telemetry-state 归 mae,经数据基目录轴 setZCodeDataRootDir/ZCODE_DATA_BASE_DIR)。
 *
 * 防丢网:telemetry-state.json 的收集根 = 显式 homeDir(测试/远端注入,override-first)
 * 或数据基目录轴——mae 桌面 main 启动早期 setDataBaseDir(~/.zcode-mae)后,
 * 设备态落 ~/.zcode-mae/.zcode/v2/telemetry-state.json,不写官方 ~/.zcode。
 * 挂接被 rebase 冲掉即红。
 */
describe("services telemetryCore 设备态根的数据基目录轴", () => {
  const tempDirs: string[] = [];
  const originalDataBaseDir: string | null = null;

  async function makeTempDir(prefix: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    setDataBaseDir(originalDataBaseDir);
    for (const dir of tempDirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("未显式传 homeDir 时随数据基目录轴:mae setDataBaseDir 下落 mae 根", async () => {
    const maeBase = await makeTempDir("mae-telemetry-core-");
    setDataBaseDir(maeBase);

    const deviceMid = await ensureTelemetryDeviceMid();

    expect(deviceMid).toMatch(/^[0-9a-f-]{36}$/u);
    const state = JSON.parse(
      await readFile(join(maeBase, ".zcode", "v2", "telemetry-state.json"), "utf8"),
    ) as { deviceMid?: string };
    expect(state.deviceMid).toBe(deviceMid);
  });

  it("显式 homeDir(测试/远端注入)优先,设备态落该 home 的 .zcode/v2", async () => {
    const maeBase = await makeTempDir("mae-telemetry-core-base-");
    const explicitHome = await makeTempDir("mae-telemetry-core-home-");
    setDataBaseDir(maeBase);

    const deviceMid = await ensureTelemetryDeviceMid({ homeDir: explicitHome });

    expect(deviceMid).toMatch(/^[0-9a-f-]{36}$/u);
    const state = JSON.parse(
      await readFile(join(explicitHome, ".zcode", "v2", "telemetry-state.json"), "utf8"),
    ) as { deviceMid?: string };
    expect(state.deviceMid).toBe(deviceMid);
  });
});
