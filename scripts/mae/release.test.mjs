// 发版脚本纯函数单测:参数解析/产物定位/版本对账——闸序列(glue)靠主树 --dry-run 实跑。
import { describe, expect, it } from "vitest";

import { findInstallerArtifact, originSlug, parseReleaseArgs, readInstallerVersion } from "./release.mjs";

describe("parseReleaseArgs", () => {
  it("三个开关各认各的,组合也认", () => {
    expect(parseReleaseArgs([])).toEqual({ draft: false, dryRun: false, skipBuild: false });
    expect(parseReleaseArgs(["--draft"])).toEqual({ draft: true, dryRun: false, skipBuild: false });
    expect(parseReleaseArgs(["--dry-run", "--skip-build"])).toEqual({
      draft: false,
      dryRun: true,
      skipBuild: true,
    });
  });

  it("未知参数红出(防手滑把别的脚本的旗标带进来)", () => {
    expect(() => parseReleaseArgs(["--verbose"])).toThrow(/未知参数/);
    expect(() => parseReleaseArgs(["--draft", "-n"])).toThrow(/-n/);
  });
});

describe("findInstallerArtifact(恰有一个语义)", () => {
  const DIST = [
    "win-unpacked", // 目录,readdirSync 会混进来
    "ZCode Mae-2026.1107.0-win-x64.exe",
    "ZCode Mae-2026.1107.0-win-x64.exe.blockmap", // blockmap 不是资产
    "builder-debug.yml",
    "latest.yml",
  ];

  it("按版本串定位安装包,排除 blockmap 与杂项", () => {
    expect(findInstallerArtifact(DIST, "2026.1107.0")).toEqual(["ZCode Mae-2026.1107.0-win-x64.exe"]);
  });

  it("旧版本产物不碍事;零个与多个都是发版闸要红出的形状", () => {
    expect(findInstallerArtifact(DIST, "2026.1023.0")).toEqual([]);
    expect(
      findInstallerArtifact(
        [...DIST, "ZCode Mae-2026.1107.0-win-x64 (1).exe"],
        "2026.1107.0",
      ),
    ).toHaveLength(2);
  });
});

describe("originSlug(--repo 实参解析,#89)", () => {
  it("https 与 ssh 两形态都解析出 owner/repo", () => {
    expect(originSlug("https://github.com/openaddr/ZCode.git")).toBe("openaddr/ZCode");
    expect(originSlug("git@github.com:openaddr/ZCode.git")).toBe("openaddr/ZCode");
  });

  it("解析不动返回 null(探针段红出,不猜)", () => {
    expect(originSlug("https://gitlab.com/o/r.git")).toBeNull();
    expect(originSlug("")).toBeNull();
    expect(originSlug(undefined)).toBeNull();
  });
});

describe("readInstallerVersion(latest.yml 对账)", () => {
  it("抽 version 行;多行 yml 里也能抽到", () => {
    expect(readInstallerVersion("version: 2026.1107.0\npath: ZCode Mae-2026.1107.0-win-x64.exe\n")).toBe(
      "2026.1107.0",
    );
    expect(
      readInstallerVersion("files:\n  - url: x\nversion:  2026.1108.1 \nreleaseDate: '2026-11-08'\n"),
    ).toBe("2026.1108.1");
  });

  it("解析不动返回 null(对账闸拿它红出,不猜)", () => {
    expect(readInstallerVersion("")).toBeNull();
    expect(readInstallerVersion("path: only-path.yml")).toBeNull();
  });
});
