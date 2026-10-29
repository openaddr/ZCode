import { describe, expect, it } from "vitest";
import {
  compareCalVer,
  formatCalVerDate,
  isCalVer,
  nextCalVer,
  resolveBuildCalVer,
  resolveReleaseVersion,
} from "./calver.mjs";

describe("compareCalVer", () => {
  it("时间序 = 版本序:跨日/跨年单调递增", () => {
    // 验收场景(specs/mae/versioning-branding.md):2026.1021.0 < 2026.1022.0 < 2027.0101.0
    expect(compareCalVer("2026.1021.0", "2026.1022.0")).toBe(-1);
    expect(compareCalVer("2026.1022.0", "2027.0101.0")).toBe(-1);
    expect(compareCalVer("2027.0101.0", "2026.1022.0")).toBe(1);
    expect(compareCalVer("2026.1021.0", "2027.0101.0")).toBe(-1);
  });

  it("同日多发按 PATCH 递增,且按数值而非字典序比较", () => {
    expect(compareCalVer("2026.1022.0", "2026.1022.1")).toBe(-1);
    expect(compareCalVer("2026.1022.9", "2026.1022.10")).toBe(-1);
    expect(compareCalVer("2026.1022.10", "2026.1022.9")).toBe(1);
    expect(compareCalVer("2026.1022.3", "2026.1022.3")).toBe(0);
  });

  it("年内月日单调:月末→次月、年末→次年", () => {
    expect(compareCalVer("2026.1031.5", "2026.1101.0")).toBe(-1);
    expect(compareCalVer("2026.1231.2", "2027.0101.0")).toBe(-1);
  });
});

describe("formatCalVerDate / nextCalVer", () => {
  it("MMDD 补零:个位月/日拼成 4 位", () => {
    expect(formatCalVerDate(new Date("2026-10-02T00:00:00Z"))).toBe("2026.1002");
    expect(formatCalVerDate(new Date("2027-01-01T00:00:00Z"))).toBe("2027.0101");
    expect(formatCalVerDate(new Date("2026-11-30T00:00:00Z"))).toBe("2026.1130");
  });

  it("同日多发 PATCH 递增", () => {
    expect(nextCalVer("2026.1022.0", new Date("2026-10-22T09:00:00Z"))).toBe("2026.1022.1");
    expect(nextCalVer("2026.1022.3", new Date("2026-10-22T23:59:59Z"))).toBe("2026.1022.4");
  });

  it("跨日/跨年回落 PATCH=0", () => {
    expect(nextCalVer("2026.1022.3", new Date("2026-10-23T00:00:00Z"))).toBe("2026.1023.0");
    expect(nextCalVer("2026.1231.2", new Date("2027-01-01T00:00:00Z"))).toBe("2027.0101.0");
  });

  it("当前版本落后于当日时直接对齐当日 0 号版本", () => {
    expect(nextCalVer("2026.1020.5", new Date("2026-10-22T00:00:00Z"))).toBe("2026.1022.0");
  });

  it("当前版本不是 CalVer 时从当日 0 号起步", () => {
    expect(nextCalVer("3.16.2", new Date("2026-10-22T00:00:00Z"))).toBe("2026.1022.0");
  });
});

describe("isCalVer", () => {
  it("接受合法形态,拒绝月/日越界与非 CalVer", () => {
    expect(isCalVer("2026.1022.0")).toBe(true);
    expect(isCalVer("2026.1022.11")).toBe(true);
    expect(isCalVer("2026.1322.0")).toBe(false); // 13 月
    expect(isCalVer("2026.1032.0")).toBe(false); // 32 日
    expect(isCalVer("2026.1000.0")).toBe(false); // 0 日
    expect(isCalVer("3.16.2")).toBe(false);
    expect(isCalVer("2026.1022")).toBe(false);
    expect(isCalVer("v2026.1022.0")).toBe(false);
  });
});

describe("resolveReleaseVersion", () => {
  it("无显式版本时按当前版本+当日计算:非 CalVer 现值从当日 0 号起步", () => {
    expect(
      resolveReleaseVersion([], {
        currentVersion: "3.16.2",
        now: new Date("2026-10-22T08:00:00Z"),
      }),
    ).toEqual({ version: "2026.1022.0", source: "computed" });
    expect(
      resolveReleaseVersion([], {
        currentVersion: "2026.1022.0",
        now: new Date("2026-10-22T20:00:00Z"),
      }),
    ).toEqual({ version: "2026.1022.1", source: "computed" });
  });

  it("首个非 flag 参数视为显式版本并放行,其余参数原样透传", () => {
    expect(
      resolveReleaseVersion(["2026.1023.0", "--dry-run"], {
        currentVersion: "2026.1022.1",
        now: new Date("2026-10-22T08:00:00Z"),
      }),
    ).toEqual({ version: "2026.1023.0", source: "explicit" });
  });

  it("显式版本非 CalVer 时拒绝(防退回语义化 bump)", () => {
    expect(() =>
      resolveReleaseVersion(["3.17.0"], {
        currentVersion: "2026.1022.0",
        now: new Date("2026-10-22T08:00:00Z"),
      }),
    ).toThrow(/CalVer/);
    expect(() =>
      resolveReleaseVersion(["--dry-run"], {
        currentVersion: "2026.1022.0",
        now: new Date("2026-10-22T08:00:00Z"),
      }),
    ).not.toThrow();
  });
});

describe("resolveBuildCalVer(构建期版本,D13)", () => {
  it("跨日构建:PATCH 归 0,日期段取构建当日(UTC)", () => {
    expect(resolveBuildCalVer("2026.1023.2", new Date("2026-10-29T08:00:00Z"))).toBe("2026.1029.0");
  });

  it("同日构建:保留当前 PATCH(产物覆盖语义)", () => {
    expect(resolveBuildCalVer("2026.1029.2", new Date("2026-10-29T23:00:00Z"))).toBe("2026.1029.2");
  });

  it("当前版本非 CalVer(如上游语义化版本):当日 0 起步", () => {
    expect(resolveBuildCalVer("3.16.2", new Date("2026-10-29T08:00:00Z"))).toBe("2026.1029.0");
  });

  it("月末跨月边界:日期段按真实日历", () => {
    expect(resolveBuildCalVer("2026.1031.5", new Date("2026-11-01T00:30:00Z"))).toBe("2026.1101.0");
  });
});
