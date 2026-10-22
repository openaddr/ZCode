import { describe, expect, it } from "vitest";

import { MAE_DEEP_LINK_SCHEME as MAE_DEEP_LINK_SCHEME_VIA_INDEX } from "../src/mae/index.js";
import { MAE_DEEP_LINK_SCHEME } from "../src/mae/deeplinkScheme.mjs";

// mae 深链接 scheme 唯一定义的防丢网(specs/mae/identity-isolation.md,工单 #10):
// 上游消费方若在 rebase 中被冲掉挂接、回落官方 "zcode",此处立即变红。
describe("mae deeplink scheme", () => {
  it("scheme 为 zcode-mae 且不是官方 zcode", () => {
    expect(MAE_DEEP_LINK_SCHEME).toBe("zcode-mae");
    expect(MAE_DEEP_LINK_SCHEME).not.toBe("zcode");
  });

  it("scheme 是合法 URI scheme(小写字母开头,仅字母数字+-.)", () => {
    expect(MAE_DEEP_LINK_SCHEME).toMatch(/^[a-z][a-z0-9+.-]*$/u);
  });

  it("经公共入口 index.ts 再导出(desktop/web 消费方走同一出口)", () => {
    expect(MAE_DEEP_LINK_SCHEME_VIA_INDEX).toBe(MAE_DEEP_LINK_SCHEME);
  });
});
