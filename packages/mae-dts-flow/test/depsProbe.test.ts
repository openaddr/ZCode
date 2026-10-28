import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  DtsFlowDependencyError,
  executableCandidates,
  probeDependency,
  requireDependency,
} from "../src/domain/depsProbe.js";

const win32 = process.platform === "win32";

function fakeExists(paths: Set<string>) {
  return async (candidate: string) => paths.has(candidate);
}

function probeOpts(binDir: string, pathEnv: string, paths: Set<string>) {
  return { binDir, pathEnv, exists: fakeExists(paths), join: (dir: string, name: string) => path.join(dir, name) };
}

describe("probeDependency", () => {
  it("binDir 命中优先,Windows 下尝试可执行后缀", async () => {
    const binDir = await mkdtemp(path.join(tmpdir(), "mae-dts-flow-bin-"));
    const exeName = win32 ? "codehubcli.exe" : "codehubcli";
    const exePath = path.join(binDir, exeName);
    await writeFile(exePath, "");
    const probe = await probeDependency("codehubcli", probeOpts(binDir, "", new Set([exePath])));
    expect(probe.available).toBe(true);
    expect(probe.resolvedPath).toBe(exePath);
  });

  it("PATH 目录兜底命中", async () => {
    const pathDir = await mkdtemp(path.join(tmpdir(), "mae-dts-flow-path-"));
    const exeName = win32 ? "codehubcli.cmd" : "codehubcli";
    const exePath = path.join(pathDir, exeName);
    const probe = await probeDependency(
      "codehubcli",
      probeOpts(path.join(pathDir, "empty-bin"), pathDir, new Set([exePath])),
    );
    expect(probe.available).toBe(true);
    expect(probe.resolvedPath).toBe(exePath);
  });

  it("缺席如实报不可用", async () => {
    const probe = await probeDependency("codehubcli", probeOpts(path.join("nowhere", "bin"), "", new Set()));
    expect(probe.available).toBe(false);
    expect(probe.resolvedPath).toBeNull();
  });

  it("Windows 平台候选含 .exe/.cmd/.bat/裸名;非平台仅裸名", () => {
    expect(executableCandidates("codehubcli", "win32")).toEqual([
      "codehubcli.exe",
      "codehubcli.cmd",
      "codehubcli.bat",
      "codehubcli",
    ]);
    expect(executableCandidates("codehubcli", "linux")).toEqual(["codehubcli"]);
  });
});

describe("requireDependency", () => {
  it("缺席 fail-loud,报错指名组件与 binDir 安装路径", async () => {
    const binDir = path.join("nowhere", "bin");
    await expect(requireDependency("codehubcli", probeOpts(binDir, "", new Set()))).rejects.toThrow(
      DtsFlowDependencyError,
    );
    await expect(requireDependency("codehubcli", probeOpts(binDir, "", new Set()))).rejects.toThrow(/codehubcli/);
    await expect(requireDependency("codehubcli", probeOpts(binDir, "", new Set()))).rejects.toThrow(
      new RegExp(binDir.replace(/\\/g, "\\\\")),
    );
  });

  it("命中返回解析路径", async () => {
    const binDir = await mkdtemp(path.join(tmpdir(), "mae-dts-flow-bin-"));
    const exeName = win32 ? "codehubcli.exe" : "codehubcli";
    const exePath = path.join(binDir, exeName);
    const resolved = await requireDependency("codehubcli", probeOpts(binDir, "", new Set([exePath])));
    expect(resolved).toBe(exePath);
  });
});
