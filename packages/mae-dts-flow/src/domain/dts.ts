/** DTS 单据领域类型与纯逻辑;字段口径对拍自华为网关(事实包 openaddr/ZCode#38)。 */

export interface DtsTicketSummary {
  /** 单号(dtsBizNo),唯一键。 */
  ticket: string;
  /** 简要描述(briefDesc)。 */
  title: string;
  /** 状态名(dtsStatusName;fields 显式请求才返回)。 */
  status: string;
  /** B 版本串(sProdBNoName,如 V100R025C10SPC010B009)。 */
  version: string;
  /** 级别(serverityNoName——原始拼写就是 serverity)。 */
  severity: string;
  /** 提单人(creator)。 */
  submitter: string;
  /** DTS 门户外链(outerLinkUrl)。 */
  url: string;
  /** 特性名(sFeatureNoName;模块识别关键)。 */
  featureName: string;
}

export interface DtsTicketDetail extends DtsTicketSummary {
  /** 完整描述(详情接口 detailDesc 优先,退回 briefDesc)。 */
  description: string;
}

/** 可发起状态口径:拉单列表只展示该状态(云端 dtsText.ts 同名常量)。 */
export const DTS_ACTIONABLE_STATUS = "开发人员实施修改";

export function isActionable(status: string): boolean {
  return status === DTS_ACTIONABLE_STATUS;
}

/** 版本组:剥尾部 B 段(锚定串尾,SPC0101 不受影响);解析不出返回原串。 */
export function dtsVersionGroup(version: string): string {
  return version.replace(/B\d+$/, "");
}

/** 网关原始返回行(datas[] 条目)→ 领域摘要;空单号行过滤由调用方处理。 */
export function mapDtsRow(row: Record<string, unknown>): DtsTicketSummary {
  return {
    ticket: String(row["dtsBizNo"] ?? ""),
    title: String(row["briefDesc"] ?? ""),
    status: String(row["dtsStatusName"] ?? ""),
    version: String(row["sProdBNoName"] ?? ""),
    severity: String(row["serverityNoName"] ?? ""),
    submitter: String(row["creator"] ?? ""),
    url: String(row["outerLinkUrl"] ?? ""),
    featureName: String(row["sFeatureNoName"] ?? ""),
  };
}

export class DtsFlowGatewayError extends Error {
  constructor(
    message: string,
    readonly reason: "not_configured" | "unreachable" | "unparsable" | "not_found" = "unreachable",
  ) {
    super(message);
    this.name = "DtsFlowGatewayError";
  }
}

/**
 * MCP 工具结果两层形状的外层:content[].text 拼出 JSON 文本。
 * 解不动 fail-loud 带原文,不静默给空列表。
 */
export function parseToolResultText(content: unknown): unknown {
  if (!Array.isArray(content)) {
    throw new DtsFlowGatewayError(`网关工具结果形状非法(无 content 数组)`, "unparsable");
  }
  const text = content
    .map((item) => (item !== null && typeof item === "object" ? String((item as Record<string, unknown>)["text"] ?? "") : ""))
    .join("");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new DtsFlowGatewayError(`网关工具结果不是合法 JSON: ${text.slice(0, 200)}`, "unparsable");
  }
}

/** 内层信封 {status,result:{datas}} → datas 数组;非 success/缺 result fail-loud 带原文。 */
export function extractDatas(envelope: unknown): Array<Record<string, unknown>> {
  const record = envelope as Record<string, unknown> | null;
  if (record === null || typeof record !== "object" || record["status"] !== "success") {
    throw new DtsFlowGatewayError(`网关返回非 success: ${JSON.stringify(envelope)?.slice(0, 200)}`, "unparsable");
  }
  const result = record["result"] as Record<string, unknown> | undefined;
  const datas = result?.["datas"];
  if (!Array.isArray(datas)) {
    throw new DtsFlowGatewayError(`网关返回缺 result.datas: ${JSON.stringify(envelope)?.slice(0, 200)}`, "unparsable");
  }
  return datas as Array<Record<string, unknown>>;
}

/**
 * 拉单 listByVersionAndHead 的 14 个位置参数(arg0-arg13,顺序敏感——华为网关丢弃参数名)。
 * 查本人名下走 otherConditions.currentHandler=EqualName,不是 filterId。
 */
export function buildListArgs(account: string): unknown[] {
  return [
    1, // arg0 pageIndex
    200, // arg1 pageSize(最大 200)
    "", // arg2 pbiId
    "PBI", // arg3 productType
    "", // arg4 filterId(未用;名下过滤走 arg12)
    "", // arg5 workBenchViewId
    "", // arg6 brief
    [], // arg7 dtsNos
    [], // arg8 dtsStatus
    [], // arg9 severity
    false, // arg10 convertAttachment
    ["sFeatureNoName"], // arg11 fields(不显式请求则字段不返回)
    [{ fieldName: "currentHandler", operator: "EqualName", value: [account] }], // arg12 otherConditions
    [], // arg13 orderBy
  ];
}

/** 查单 batchQueryTicket 的位置参数;状态名/特性名必须显式请求。 */
export function buildDetailArgs(ticket: string): unknown[] {
  return [[ticket], ["sFeatureNoName", "dtsStatusName"], false];
}
