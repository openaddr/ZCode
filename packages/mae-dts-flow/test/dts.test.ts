import { describe, expect, it } from "vitest";

import {
  DTS_ACTIONABLE_STATUS,
  dtsVersionGroup,
  isActionable,
} from "../src/domain/dts.js";

describe("dts domain", () => {
  it("可发起状态口径:常量与判定", () => {
    expect(DTS_ACTIONABLE_STATUS).toBe("开发人员实施修改");
    expect(isActionable("开发人员实施修改")).toBe(true);
    expect(isActionable("已解决")).toBe(false);
  });

  it("版本组剥尾部 B 段;SPC0101 不受影响;C 版串(无 B 段)原样返回", () => {
    expect(dtsVersionGroup("V100R025C10SPC010B009")).toBe("V100R025C10SPC010");
    expect(dtsVersionGroup("V100R025C10SPC0101")).toBe("V100R025C10SPC0101");
    expect(dtsVersionGroup("V100R025C10SPC010")).toBe("V100R025C10SPC010");
  });
});
