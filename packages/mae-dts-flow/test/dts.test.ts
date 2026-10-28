import { describe, expect, it } from "vitest";

import {
  DTS_ACTIONABLE_STATUS,
  DtsFlowGatewayError,
  buildDetailArgs,
  buildListArgs,
  dtsVersionGroup,
  extractDatas,
  isActionable,
  mapDtsRow,
  parseToolResultText,
} from "../src/domain/dts.js";

describe("dts domain", () => {
  it("可发起状态口径:常量与判定", () => {
    expect(DTS_ACTIONABLE_STATUS).toBe("开发人员实施修改");
    expect(isActionable("开发人员实施修改")).toBe(true);
    expect(isActionable("已解决")).toBe(false);
  });

  it("版本组剥尾部 B 段;SPC0101 不受影响;无 B 段原样", () => {
    expect(dtsVersionGroup("V100R025C10SPC010B009")).toBe("V100R025C10SPC010");
    expect(dtsVersionGroup("V100R025C10SPC0101")).toBe("V100R025C10SPC0101");
    expect(dtsVersionGroup("V100R025C10SPC010")).toBe("V100R025C10SPC010");
  });

  it("原始行映射:字段口径按对拍表(serverity 原始拼写)", () => {
    const summary = mapDtsRow({
      dtsBizNo: "DTS-2026-1008",
      briefDesc: "集群 OOM",
      dtsStatusName: "开发人员实施修改",
      sProdBNoName: "V100R025C10SPC010B008",
      serverityNoName: "致命",
      creator: "张三",
      outerLinkUrl: "https://dts/t/1008",
      sFeatureNoName: "大数据平台",
    });
    expect(summary).toMatchObject({ ticket: "DTS-2026-1008", severity: "致命", featureName: "大数据平台" });
  });

  it("工具结果两层信封:content[].text 拼接解析;解不动 fail-loud 带原文", () => {
    const envelope = { status: "success", result: { datas: [{ dtsBizNo: "DTS-1" }] } };
    const content = [{ type: "text", text: JSON.stringify(envelope) }];
    expect(extractDatas(parseToolResultText(content))).toHaveLength(1);

    expect(() => parseToolResultText([{ type: "text", text: "not-json" }])).toThrow(DtsFlowGatewayError);
    expect(() => parseToolResultText([{ type: "text", text: "not-json" }])).toThrow(/not-json/);
    expect(() => extractDatas({ status: "fail" })).toThrow(DtsFlowGatewayError);
    expect(() => extractDatas({ status: "success" })).toThrow(/datas/);
  });

  it("拉单 14 参顺序敏感:arg0-arg13 全表对拍,名下过滤走 otherConditions", () => {
    const args = buildListArgs("ning") as Array<unknown>;
    expect(args).toHaveLength(14);
    expect(args[0]).toBe(1);
    expect(args[1]).toBe(200);
    expect(args[3]).toBe("PBI");
    expect(args[11]).toEqual(["sFeatureNoName"]);
    expect(args[12]).toEqual([{ fieldName: "currentHandler", operator: "EqualName", value: ["ning"] }]);
    expect(args[13]).toEqual([]);
  });

  it("查单参数:单号/显式状态特性字段/附件不转换", () => {
    expect(buildDetailArgs("DTS-2026-1002")).toEqual([
      ["DTS-2026-1002"],
      ["sFeatureNoName", "dtsStatusName"],
      false,
    ]);
  });
});
