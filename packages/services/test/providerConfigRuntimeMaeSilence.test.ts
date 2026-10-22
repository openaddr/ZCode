import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProviderConfigRuntime } from "../src/model-provider/providerConfigRuntime.js";

// mae: 外联静默切断官方提供商目录后台刷新/下载(#7)——经 createProviderConfigRuntime 装配层验证
describe("mae 外联静默:provider 目录远端刷新切断", () => {
  let configRoot: string;
  let builtinFilePath: string;

  beforeEach(async () => {
    configRoot = await mkdtemp(join(tmpdir(), "mae-provider-runtime-"));
    const catalog = await readFile(
      new URL("../../../config/provider/mae-builtin.json", import.meta.url),
      "utf8",
    );
    builtinFilePath = join(configRoot, "mae-builtin.json");
    await writeFile(builtinFilePath, catalog, "utf8");
  });

  afterEach(async () => {
    delete process.env.ZCODE_ALLOW_OFFICIAL_IDENTITY;
    await rm(configRoot, { recursive: true, force: true });
  });

  function createRuntime(fetchRelease: ReturnType<typeof vi.fn>) {
    return createProviderConfigRuntime({
      zcodeBuiltinFilePath: builtinFilePath,
      zcodeBuiltinEnvironment: {
        environmentConfigRoot: configRoot,
        platform: "test-platform",
        appVersion: "0.0.0-test",
        resolveEndpointOrigin: () => "https://zcode.z.ai",
        fetchRelease,
      },
    });
  }

  it("默认静默:不触发官方目录远端刷新,Active 路径即打包目录", async () => {
    const fetchRelease = vi.fn();
    const runtime = createRuntime(fetchRelease);
    try {
      await runtime.start();
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(fetchRelease).not.toHaveBeenCalled();
      expect(await runtime.resolveZCodeBuiltinActiveFilePath()).toBe(builtinFilePath);
    } finally {
      runtime.dispose();
    }
  });

  it("ZCODE_ALLOW_OFFICIAL_IDENTITY=1 恢复官方远端刷新链路", async () => {
    process.env.ZCODE_ALLOW_OFFICIAL_IDENTITY = "1";
    const fetchRelease = vi.fn().mockResolvedValue(null);
    const runtime = createRuntime(fetchRelease);
    try {
      await runtime.start();
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(fetchRelease).toHaveBeenCalled();
    } finally {
      runtime.dispose();
    }
  });
});
