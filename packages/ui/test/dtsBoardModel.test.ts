import { describe, expect, it } from "vitest";

import {
  type BoardIssueRef,
  type BoardTicket,
  columnFilter,
  defaultSelectedGroups,
  dtsNoCandidates,
  dtsVersionGroup,
  dtsVersionKey,
  fuzzyFilter,
  launchFilter,
  listVersionGroups,
  liveIssueMap,
  mergeRemoteTickets,
  resolvedModuleOf,
  sanitizeColumnPrefs,
  selectableTickets,
  sortVersionGroupsDesc,
  unmappedVersionGroups,
  versionFilter,
} from "../src/mae/dts/dtsBoardModel.js";

function ticket(partial: Partial<BoardTicket>): BoardTicket {
  return {
    ticket: "DTS-2026-1001", title: "t", status: "开发人员实施修改", version: "V100R025C10SPC010",
    severity: "一般", submitter: "张三", url: "", branch: "master", moduleId: "module-web", actionable: true,
    ...partial,
  };
}

function issue(partial: Partial<BoardIssueRef>): BoardIssueRef {
  return { ticket: "DTS-2026-1001", workspacePath: "C:/ws/1001", closedAt: null, archived: false, ...partial };
}

describe("dts board model", () => {
  it("发起状态:进行中=未收口且未归档;liveIssueMap 只收进行中", () => {
    const map = liveIssueMap([
      issue({ ticket: "A" }),
      issue({ ticket: "B", closedAt: "2026-10-30T00:00:00Z" }),
      issue({ ticket: "C", archived: true, closedAt: "2026-10-30T00:00:00Z" }),
    ]);
    expect(map.has("A")).toBe(true);
    expect(map.has("B")).toBe(false);
    expect(map.has("C")).toBe(false);
  });

  it("模块两层口径:改选优先于带出;两者皆无为 null", () => {
    expect(resolvedModuleOf("T", { T: { moduleId: "m2", updatedBy: "x", updatedAt: "t" } }, "m1")).toBe("m2");
    expect(resolvedModuleOf("T", {}, "m1")).toBe("m1");
    expect(resolvedModuleOf("T", {}, null)).toBeNull();
  });

  it("搜索链:工具栏(单号/标题/版本)与列头(单号/标题)AND 叠加", () => {
    const tickets = [
      ticket({ ticket: "DTS-2026-1001", title: "登录掉线", version: "V100R026C10" }),
      ticket({ ticket: "DTS-2026-1002", title: "报表错位", version: "V100R025C10" }),
    ];
    expect(fuzzyFilter(tickets, "1001")).toHaveLength(1);
    expect(fuzzyFilter(tickets, "v100r026")).toHaveLength(1);
    expect(fuzzyFilter(tickets, "")).toHaveLength(2);
    expect(columnFilter(fuzzyFilter(tickets, ""), "1002", "")).toHaveLength(1);
    expect(columnFilter(fuzzyFilter(tickets, ""), "", "错位")).toHaveLength(1);
    expect(columnFilter(fuzzyFilter(tickets, "1002"), "", "登录")).toHaveLength(0);
  });

  it("版本组:剥 B 段;R/C 降序;默认勾选 R/C 并列最高组", () => {
    expect(dtsVersionGroup("V100R025C10SPC010B009")).toBe("V100R025C10SPC010");
    expect(dtsVersionKey("V100R026C11")).toEqual([26, 11]);
    expect(dtsVersionKey("weird")).toEqual([-1, -1]);
    const groups = sortVersionGroupsDesc(["V100R025C10", "V100R026C10", "V100R026C11", "weird"]);
    expect(groups).toEqual(["V100R026C11", "V100R026C10", "V100R025C10", "weird"]);
    const tickets = [
      ticket({ ticket: "T1", version: "V100R026C10B001" }),
      ticket({ ticket: "T2", version: "V100R026C10B002" }),
      ticket({ ticket: "T3", version: "V100R025C10" }),
      ticket({ ticket: "T4", version: "", actionable: true }),
    ];
    expect(listVersionGroups(tickets)).toEqual(["V100R026C10", "V100R025C10"]);
    expect(defaultSelectedGroups(["V100R026C11", "V100R026C10", "V100R025C10"])).toEqual(["V100R026C11"]);
    expect(defaultSelectedGroups(["V100R026C11", "V100R026C11B002"])).toEqual(["V100R026C11", "V100R026C11B002"]);
    expect(defaultSelectedGroups([])).toEqual([]);
  });

  it("版本过滤:命中剥 B 段后的组;空勾选不过滤;无版本单只在空勾选下出现", () => {
    const tickets = [
      ticket({ ticket: "T1", version: "V100R026C10B001" }),
      ticket({ ticket: "T2", version: "V100R025C10" }),
      ticket({ ticket: "T3", version: "" }),
    ];
    expect(versionFilter(tickets, ["V100R026C10"]).map((t) => t.ticket)).toEqual(["T1"]);
    expect(versionFilter(tickets, [])).toHaveLength(3);
  });

  it("发起状态过滤:默认只看未发起;双开=全量", () => {
    const tickets = [ticket({ ticket: "A" }), ticket({ ticket: "B" })];
    const live = liveIssueMap([issue({ ticket: "A" })]);
    expect(launchFilter(tickets, live, true, false).map((t) => t.ticket)).toEqual(["B"]);
    expect(launchFilter(tickets, live, true, true)).toHaveLength(2);
    expect(launchFilter(tickets, live, false, true).map((t) => t.ticket)).toEqual(["A"]);
  });

  it("远程补查:候选=字母开头+数字≥5 可逗号分隔;入列去重只收 actionable", () => {
    expect(dtsNoCandidates("DTS-2026-1001")).toEqual(["DTS-2026-1001"]);
    expect(dtsNoCandidates("ABC123, DEF456")).toEqual(["ABC123", "DEF456"]);
    expect(dtsNoCandidates("登录掉线")).toEqual([]);
    expect(dtsNoCandidates("AB12")).toEqual([]);
    const local = [ticket({ ticket: "DTS-2026-1001" })];
    const remote = [
      ticket({ ticket: "DTS-2026-1001" }),
      ticket({ ticket: "DTS-2026-7777" }),
      ticket({ ticket: "DTS-2026-8888", status: "已解决", actionable: false }),
    ];
    expect(mergeRemoteTickets(local, remote).map((t) => t.ticket)).toEqual(["DTS-2026-1001", "DTS-2026-7777"]);
  });

  it("勾选规则:三证齐全(非进行中/有分支/有模块)才可勾;改选映射可补齐模块条件", () => {
    const tickets = [
      ticket({ ticket: "A" }),
      ticket({ ticket: "B", branch: null }),
      ticket({ ticket: "C", moduleId: null }),
      ticket({ ticket: "D", moduleId: null }),
    ];
    const live = liveIssueMap([issue({ ticket: "A" })]);
    const withModule = tickets.map((t) => (t.ticket === "D" ? { ...t, moduleId: "module-web" } : t));
    expect(selectableTickets(tickets, live, {})).toEqual([]);
    expect(selectableTickets(withModule, live, { D: { moduleId: "module-report", updatedBy: "x", updatedAt: "t" } })).toEqual(["D"]);
  });

  it("未映射红条:展示单涉及的无分支版本组;缺版本单单独提示", () => {
    const tickets = [
      ticket({ ticket: "A", branch: null, version: "V100R026C10B001" }),
      ticket({ ticket: "B", branch: null, version: "V100R026C10B002" }),
      ticket({ ticket: "C", branch: "master" }),
      ticket({ ticket: "D", branch: null, version: "" }),
    ];
    const unmapped = unmappedVersionGroups(tickets);
    expect(unmapped.groups).toEqual(["V100R026C10"]);
    expect(unmapped.versionless).toBe(true);
    expect(unmappedVersionGroups([ticket({ ticket: "A" })]).groups).toEqual([]);
  });

  it("列偏好:未知/越界值回退缺省,合法值保留", () => {
    const prefs = sanitizeColumnPrefs({ widths: { ticket: 999999, title: 10, bogus: 1 }, shown: { title: false, tier: "yes" } });
    expect(prefs.widths.ticket).toBe(800);
    expect(prefs.widths.title).toBe(160);
    expect(prefs.widths.bogus).toBeUndefined();
    expect(prefs.shown.title).toBe(false);
    expect(prefs.shown.tier).toBe(true);
    expect(sanitizeColumnPrefs(null).shown.title).toBe(true);
  });
});
