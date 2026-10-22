import { describe, expect, it } from "vitest";
import {
  isFeatureDisabled,
  isFeatureVisible,
  MAE_FEATURE_KEYS,
} from "@/mae/featureGates.js";

/**
 * 期望清单独立于实现:来自 specs/mae/feature-gates.md 产品规则(D7 纯本地模式),
 * 十类云端功能全部禁用且入口隐藏。
 */
const EXPECTED_DISABLED_FEATURES = [
  "account-login",
  "coding-plan",
  "session-share",
  "off-peak-tasks",
  "feedback",
  "marketing-banner",
  "rewards",
  "web-remote-control",
  "bots",
  "remote-workspace",
] as const;

describe("mae feature gates", () => {
  it("禁用清单恰好覆盖规格定义的十类云端功能", () => {
    expect([...MAE_FEATURE_KEYS].sort()).toEqual([...EXPECTED_DISABLED_FEATURES].sort());
  });

  it("十类功能 isFeatureDisabled 均为 true、isFeatureVisible 均为 false", () => {
    for (const feature of EXPECTED_DISABLED_FEATURES) {
      expect(isFeatureDisabled(feature)).toBe(true);
      expect(isFeatureVisible(feature)).toBe(false);
    }
  });
});
