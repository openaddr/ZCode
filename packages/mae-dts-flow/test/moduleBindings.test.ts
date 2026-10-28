import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  ModuleBindingsError,
  findVersionBranch,
  resolveModuleBindings,
} from "../src/domain/moduleBindings.js";
import { fetchCloudModuleBindings, loadLocalModuleBindings } from "../src/adapters/moduleBindingsStore.js";

const CLOUD = "http://mae-flow.internal:8787";
const VALID_MODULES = [
  {
    moduleName: "大数据平台",
    repos: ["https://codehub.internal/bigdata/core.git"],
    versionBranchMap: { V100R025C10SPC010: "master" },
  },
];

function fetchOk(): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ modules: VALID_MODULES }), { status: 200 })) as unknown as typeof fetch;
}

function fetchBroken(): typeof fetch {
  return (async () => {
    throw new Error("ECONNREFUSED");
  }) as unknown as typeof fetch;
}

async function tempDataDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mae-dts-flow-bind-"));
}

async function writeLocalBindings(dataDir: string, modules: unknown): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(path.join(dataDir, "module-bindings.local.json"), JSON.stringify({ modules }), "utf8");
}

function ports(
  dataDir: string,
  cloud: (() => Promise<unknown>) | null,
) {
  return {
    cloud,
    local: () => loadLocalModuleBindings(dataDir),
    localHintPath: path.join(dataDir, "module-bindings.local.json"),
  };
}

describe("resolveModuleBindings(两层解析)", () => {
  it("云端可达:以云端为准,不降级", async () => {
    const dataDir = await tempDataDir();
    const resolved = await resolveModuleBindings(ports(dataDir, () => fetchCloudModuleBindings(CLOUD, { fetch: fetchOk() })));
    expect(resolved.degraded).toBe(false);
    expect(resolved.bindings.source).toBe("cloud");
    expect(resolved.bindings.modules[0]?.moduleName).toBe("大数据平台");
  });

  it("云端不可达:降级本地兜底并如实标注原因", async () => {
    const dataDir = await tempDataDir();
    await writeLocalBindings(dataDir, VALID_MODULES);
    const resolved = await resolveModuleBindings(
      ports(dataDir, () => fetchCloudModuleBindings(CLOUD, { fetch: fetchBroken() })),
    );
    expect(resolved.degraded).toBe(true);
    expect(resolved.degradedReason).toContain("ECONNREFUSED");
    expect(resolved.bindings.source).toBe("local");
  });

  it("两层都不可得 fail-loud 并指路本地兜底文件", async () => {
    const dataDir = await tempDataDir();
    await expect(
      resolveModuleBindings(ports(dataDir, () => fetchCloudModuleBindings(CLOUD, { fetch: fetchBroken() }))),
    ).rejects.toThrow(/本地兜底/);
    await expect(resolveModuleBindings(ports(dataDir, null))).rejects.toThrow(/module-bindings\.local\.json/);
  });
});

describe("bindings stores(adapters IO)", () => {
  it("本地文件缺失返回 null;格式非法 fail-loud", async () => {
    const dataDir = await tempDataDir();
    expect(await loadLocalModuleBindings(dataDir)).toBeNull();
    await writeLocalBindings(dataDir, [{ moduleName: "x" }]);
    await expect(loadLocalModuleBindings(dataDir)).rejects.toThrow(ModuleBindingsError);
  });

  it("云端拉取:非 2xx 报 HTTP 状态;坏 JSON 报格式错误", async () => {
    const http500 = (async () => new Response("boom", { status: 500 })) as unknown as typeof fetch;
    await expect(fetchCloudModuleBindings(CLOUD, { fetch: http500 })).rejects.toThrow(/HTTP 500/);
    const badJson = (async () => new Response("not-json", { status: 200 })) as unknown as typeof fetch;
    await expect(fetchCloudModuleBindings(CLOUD, { fetch: badJson })).rejects.toThrow(/合法 JSON/);
  });
});

describe("findVersionBranch(版本组→分支映射)", () => {
  const bindings = { source: "cloud" as const, fetchedAt: "2026-10-26T00:00:00Z", modules: VALID_MODULES };
  it("命中/未命中/模块未匹配", () => {
    expect(findVersionBranch(bindings, "大数据平台", "V100R025C10SPC010")).toBe("master");
    expect(findVersionBranch(bindings, "大数据平台", "V100R025C09")).toBeNull();
    expect(findVersionBranch(bindings, "不存在的模块", "V100R025C10SPC010")).toBeNull();
  });
});
