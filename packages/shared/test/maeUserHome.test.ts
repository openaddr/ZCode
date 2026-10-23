import { describe, expect, it } from "vitest";

import { resolveMaeAwareUserHomeDir as resolveViaIndex } from "../src/mae/index.js";
import { resolveMaeAwareUserHomeDir } from "../src/mae/userHome.js";

// mae 用户级 home 统一 resolver 的防丢网(工单 #25):
// hooksService/mcpSyncService 的用户级 .zcode/.agents 配置轴经同一解析链
// (ZCODE_DESKTOP_HOME_DIR → HOME → USERPROFILE)——与 settingService 既有链
// 同源;env 全缺失返回 undefined,由调用方 os.homedir() 兜底(domain 层禁
// node:*)。resolver 或公共入口再导出被 rebase 冲掉时此处变红。
describe("mae 用户级 home 统一 resolver", () => {
  it("桌面实例/mae 数据根覆盖(ZCODE_DESKTOP_HOME_DIR)优先于真实 HOME", () => {
    expect(
      resolveMaeAwareUserHomeDir({
        ZCODE_DESKTOP_HOME_DIR: "/Users/tester/.zcode-mae",
        HOME: "/Users/tester",
        USERPROFILE: "C:\\Users\\tester",
      }),
    ).toBe("/Users/tester/.zcode-mae");
  });

  it("无覆盖时回落上游链:HOME → USERPROFILE(空白值跳过)", () => {
    expect(resolveMaeAwareUserHomeDir({ HOME: "/Users/tester" })).toBe("/Users/tester");
    expect(resolveMaeAwareUserHomeDir({ USERPROFILE: "C:\\Users\\tester" })).toBe(
      "C:\\Users\\tester",
    );
    expect(
      resolveMaeAwareUserHomeDir({
        ZCODE_DESKTOP_HOME_DIR: "   ",
        HOME: "  ",
        USERPROFILE: "C:\\Users\\tester",
      }),
    ).toBe("C:\\Users\\tester");
  });

  it("全部缺失时返回 undefined,由调用方 os.homedir() 兜底", () => {
    expect(resolveMaeAwareUserHomeDir({})).toBeUndefined();
  });

  it("经公共入口 index.ts 再导出(services 消费方走同一出口)", () => {
    expect(resolveViaIndex).toBe(resolveMaeAwareUserHomeDir);
  });
});
