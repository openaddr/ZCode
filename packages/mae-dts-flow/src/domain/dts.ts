/**
 * DTS 单据领域类型;数据面同源自云平台(mae-flow-cloud /issues/dts*,规格 D15 修订 2026-10-30)。
 * branch(版本→分支映射)与 moduleId(特性→模块带出)由云平台服务端单点计算下发,
 * 本地不再自建映射解析(同源口径,yunine9/mae-flow-cloud#566)。
 */

export interface DtsTicketSummary {
  /** 单号,唯一键。 */
  ticket: string;
  /** 简要描述。 */
  title: string;
  /** 状态名。 */
  status: string;
  /** C 版版本串(sProdCNoName 口径,mae-flow-cloud#564);缺席为空串。 */
  version: string;
  /** 级别。 */
  severity: string;
  /** 提单人。 */
  submitter: string;
  /** DTS 门户外链。 */
  url: string;
  /** 分支映射结果(云平台按配置中心逐单补齐);未命中为 null=「未配置分支」禁发起。 */
  branch: string | null;
  /** 模块带出(云平台特性名强匹配);未命中为 null=「未匹配」发起前必选。 */
  moduleId: string | null;
}

export interface DtsTicketDetail extends DtsTicketSummary {
  /** 完整描述(详情接口 description 优先,退回 title)。 */
  description: string;
}

/** 可发起状态口径:拉单列表只展示该状态(云端 dtsText.ts 同名常量)。 */
export const DTS_ACTIONABLE_STATUS = "开发人员实施修改";

export function isActionable(status: string): boolean {
  return status === DTS_ACTIONABLE_STATUS;
}

/** 版本组:剥尾部 B 段(锚定串尾,SPC0101 不受影响);解析不出返回原串。C 版串无 B 段时原样返回。 */
export function dtsVersionGroup(version: string): string {
  return version.replace(/B\d+$/, "");
}

/** 业务模块目录项(云平台 GET /business-modules 的消费子集)。 */
export interface DtsModuleOption {
  id: string;
  name: string;
  /** 模块绑定的仓库列表(prep_repo 的仓库集合来源)。 */
  repositories: string[];
}

/** 单号→模块的人工改选映射条目(云平台 ADR-0056 口径)。 */
export interface DtsBindingEntry {
  moduleId: string;
  updatedBy: string;
  updatedAt: string;
}

export type DtsBindingMap = Record<string, DtsBindingEntry>;

/** 人员名单项(责任人选择器候选;GET /auth/people 消费子集)。 */
export interface DtsPerson {
  username: string;
  displayName: string | null;
}

export class DtsFlowGatewayError extends Error {
  constructor(
    message: string,
    readonly reason: "not_configured" | "unreachable" | "unparsable" | "not_found" | "not_authorized" = "unreachable",
  ) {
    super(message);
    this.name = "DtsFlowGatewayError";
  }
}
