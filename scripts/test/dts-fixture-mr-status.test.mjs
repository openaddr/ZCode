// dts-fixture mr-status 映射单测(#73):GitHub checks → pipeline 三态;
// 保守原则:未知/空=running(等下一拍),任一失败=red,全绿且非空=green。
import { strictEqual } from "node:assert";
import { describe, it } from "node:test";

import { mapChecks, mapPrState } from "../mae/dts-fixture/mr-status.mjs";

describe("dts-fixture mr-status 映射", () => {
  it("空/缺席 rollup = running", () => {
    strictEqual(mapChecks([]), "running");
    strictEqual(mapChecks(undefined), "running");
  });

  it("全 SUCCESS = green", () => {
    strictEqual(
      mapChecks([{ conclusion: "SUCCESS" }, { conclusion: "SUCCESS" }]),
      "green",
    );
  });

  it("NEUTRAL/SKIPPED 不挡绿", () => {
    strictEqual(
      mapChecks([{ conclusion: "SUCCESS" }, { state: "NEUTRAL" }, { conclusion: "SKIPPED" }]),
      "green",
    );
  });

  it("任一 FAILURE/TIMED_OUT/CANCELLED = red(压过绿)", () => {
    strictEqual(
      mapChecks([{ conclusion: "SUCCESS" }, { conclusion: "FAILURE" }]),
      "red",
    );
    strictEqual(mapChecks([{ state: "TIMED_OUT" }]), "red");
    strictEqual(mapChecks([{ state: "CANCELLED" }]), "red");
  });

  it("IN_PROGRESS/QUEUED/PENDING = running", () => {
    strictEqual(mapChecks([{ state: "IN_PROGRESS" }]), "running");
    strictEqual(mapChecks([{ conclusion: "SUCCESS" }, { state: "QUEUED" }]), "running");
  });

  it("未知条目类型 = running(保守不给绿)", () => {
    strictEqual(mapChecks(["garbage", null, {}]), "running");
  });

  it("PR 终态映射:merged=green, closed=red, open=running", () => {
    strictEqual(mapPrState("MERGED"), "green");
    strictEqual(mapPrState("CLOSED"), "red");
    strictEqual(mapPrState("OPEN"), "running");
    strictEqual(mapPrState(null), "running");
  });
});
