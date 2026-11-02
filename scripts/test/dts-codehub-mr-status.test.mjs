// dts-codehub mr-status 映射单测(#580):CodeHub 流水线状态 → 三态契约。
// 诚实纪律:空=running(流水线未触发是真实等待态),认不出的状态词=抛错
// (服务侧记 pipeline_probe_failed),多 run 缺 id=抛错(历史绿灯不准放行)。
import { strictEqual, throws } from "node:assert";
import { describe, it } from "node:test";

import { mapPipelineStatus, parseMrUrl, pickLatestRun } from "../mae/dts-codehub/mr-status-codehub.mjs";

describe("dts-codehub mr-status MR URL 解析", () => {
  it("标准 URL → project+iid", () => {
    const got = parseMrUrl("https://codehub-y.huawei.com/org/repo/merge_requests/42");
    strictEqual(got.project, "org/repo");
    strictEqual(got.iid, "42");
  });

  it("兼容 /-/merge_requests/ 与查询串/编码路径", () => {
    const got = parseMrUrl("https://codehub-y.huawei.com/a%20b/repo/-/merge_requests/7?tab=diff");
    strictEqual(got.project, "a b/repo");
    strictEqual(got.iid, "7");
  });

  it("解析不动 = null(不猜)", () => {
    strictEqual(parseMrUrl("https://mr.test/pull/1"), null);
    strictEqual(parseMrUrl(""), null);
    strictEqual(parseMrUrl(undefined), null);
  });
});

describe("dts-codehub mr-status 状态映射(与平台 status_map 一字对应)", () => {
  it("success = green", () => {
    strictEqual(mapPipelineStatus("success"), "green");
    strictEqual(mapPipelineStatus("SUCCESS"), "green");
  });

  it("failed = red", () => {
    strictEqual(mapPipelineStatus("failed"), "red");
  });

  it("running/created/pending/manual = running", () => {
    strictEqual(mapPipelineStatus("running"), "running");
    strictEqual(mapPipelineStatus("created"), "running");
    strictEqual(mapPipelineStatus("pending"), "running");
    strictEqual(mapPipelineStatus("manual"), "running");
  });

  it("canceled/skipped = red(平台同款,不挡重试也不假绿)", () => {
    strictEqual(mapPipelineStatus("canceled"), "red");
    strictEqual(mapPipelineStatus("skipped"), "red");
  });

  it("认不出的状态词 = 抛错(拒绝猜测)", () => {
    throws(() => mapPipelineStatus("unknown"), /拒绝猜测/);
    throws(() => mapPipelineStatus(""), /拒绝猜测/);
  });
});

describe("dts-codehub mr-status 多 run 取最新", () => {
  it("空数组 = null(main 翻成 running)", () => {
    strictEqual(pickLatestRun([]), null);
  });

  it("数值 id 最大者赢(平台 orderStatusRuns 同纪律)", () => {
    const latest = pickLatestRun([
      { id: "9", status: "failed" },
      { id: "12", status: "success" },
      { id: "10", status: "running" },
    ]);
    strictEqual(latest.status, "success");
  });

  it("多条 run 缺数值 id = 抛错(不拿历史绿灯放行)", () => {
    throws(
      () => pickLatestRun([{ status: "success" }, { id: "3", status: "failed" }]),
      /无法判最新/,
    );
  });

  it("单条 run 缺 id 也接受(无可比对象)", () => {
    strictEqual(pickLatestRun([{ status: "success" }]).status, "success");
  });
});
