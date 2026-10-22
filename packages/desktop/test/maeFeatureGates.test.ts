import { describe, expect, it } from "vitest";
import {
  DESKTOP_DISABLED_FEATURES,
  isDesktopFeatureDisabled,
} from "../src/main/mae/featureGates.js";

/** 期望清单独立于实现:specs/mae/feature-gates.md D7 纯本地模式(main 侧子集)。 */
const EXPECTED_DISABLED = ["session-share", "feedback"] as const;

describe("mae desktop main feature gates", () => {
  it("main 侧禁用清单包含规格要求的最小集合", () => {
    for (const feature of EXPECTED_DISABLED) {
      expect(DESKTOP_DISABLED_FEATURES.has(feature)).toBe(true);
      expect(isDesktopFeatureDisabled(feature)).toBe(true);
    }
  });

  it("main 侧清单与渲染侧十类清单保持一致", () => {
    expect([...DESKTOP_DISABLED_FEATURES].sort()).toEqual(
      [
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
      ].sort(),
    );
  });
});
