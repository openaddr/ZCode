/**
 * DTS 数据客户端:mock 与云平台同源实现同接口。
 * 真实后端=mae-flow-cloud(规格 D15 修订 2026-10-30):拉单/详情响应由平台服务端
 * 单点补齐 branch+module,本地零映射逻辑;免登录依据 yunine9/mae-flow-cloud#566。
 */
import {
  type DtsBindingMap,
  type DtsModuleOption,
  type DtsPerson,
  type DtsTicketDetail,
  type DtsTicketSummary,
  DtsFlowGatewayError,
} from "../domain/dts.js";
import { MOCK_BINDINGS, MOCK_MODULES, MOCK_PEOPLE, MOCK_TICKETS } from "./dtsMockData.js";

export interface DtsGateway {
  /** mock 标记:UI 据此亮 DEV 横幅。 */
  readonly mock: boolean;
  /** 名下单列表(按账号过滤;返回含全部状态,可发起过滤在领域层)。 */
  listByOwner(account: string): Promise<DtsTicketSummary[]>;
  /** 查单;查无此单 fail-loud(不静默)。 */
  getTicket(ticket: string): Promise<DtsTicketDetail>;
  /** 业务模块目录(所属模块列候选)。 */
  listModules(): Promise<DtsModuleOption[]>;
  /** 单号→模块人工改选映射(团队共享,优先于带出值)。 */
  getBindings(): Promise<DtsBindingMap>;
  /** 人工改选落账(受平台 #566 放行门控;未放行 401 → not_authorized)。 */
  putBinding(ticket: string, moduleId: string | null, updatedBy: string): Promise<void>;
  /** 人员名单(责任人选择器候选;未放行 → not_authorized,UI 退化手输工号)。 */
  listPeople(): Promise<DtsPerson[]>;
}

export interface DtsGatewayDeps {
  fetch: typeof fetch;
}

const REQUEST_TIMEOUT_MS = 30_000;

/** 云平台网关:匿名 HTTP(免登录允许清单 #566 放行前 401 显形为 not_authorized)。 */
export class CloudPlatformGateway implements DtsGateway {
  readonly mock = false;

  constructor(
    private readonly baseUrl: string,
    private readonly deps: DtsGatewayDeps,
  ) {}

  async listByOwner(account: string): Promise<DtsTicketSummary[]> {
    const body = await this.getJson<{ tickets?: unknown }>(`/issues/dts?owner=${encodeURIComponent(account)}`);
    if (!Array.isArray(body.tickets)) {
      throw new DtsFlowGatewayError(`云平台拉单响应缺 tickets 数组`, "unparsable");
    }
    return (body.tickets as Array<Record<string, unknown>>).map(mapCloudBrief).filter((row) => row.ticket.trim().length > 0);
  }

  async getTicket(ticket: string): Promise<DtsTicketDetail> {
    const body = await this.getJson<Record<string, unknown>>(`/issues/dts/${encodeURIComponent(ticket)}`);
    const summary = mapCloudBrief(body);
    if (summary.ticket.trim().length === 0) {
      throw new DtsFlowGatewayError(`查无此单: ${ticket}`, "not_found");
    }
    const description = String(body["description"] ?? "");
    return { ...summary, title: summary.title || `DTS ${ticket}`, description: description || summary.title };
  }

  async listModules(): Promise<DtsModuleOption[]> {
    const body = await this.getJson<{ modules?: unknown }>(`/business-modules`);
    if (!Array.isArray(body.modules)) {
      throw new DtsFlowGatewayError(`云平台模块目录响应缺 modules 数组`, "unparsable");
    }
    return (body.modules as Array<Record<string, unknown>>)
      .filter((module) => String(module["status"] ?? "active") === "active")
      .map((module) => ({
        id: String(module["id"] ?? ""),
        name: String(module["name"] ?? ""),
        repositories: Array.isArray(module["repositories"]) ? module["repositories"].map(String) : [],
      }))
      .filter((module) => module.id.trim().length > 0);
  }

  async getBindings(): Promise<DtsBindingMap> {
    const body = await this.getJson<{ bindings?: unknown }>(`/issues/dts-bindings`);
    const bindings = body.bindings;
    if (bindings === undefined || bindings === null || typeof bindings !== "object") {
      return {};
    }
    const map: DtsBindingMap = {};
    for (const [ticket, entry] of Object.entries(bindings as Record<string, unknown>)) {
      const record = entry as Record<string, unknown> | null;
      if (record === null || typeof record !== "object") continue;
      const moduleId = String(record["module_id"] ?? "");
      if (!moduleId.trim()) continue;
      map[ticket] = {
        moduleId,
        updatedBy: String(record["updated_by"] ?? ""),
        updatedAt: String(record["updated_at"] ?? ""),
      };
    }
    return map;
  }

  async putBinding(ticket: string, moduleId: string | null, updatedBy: string): Promise<void> {
    const response = await this.request("PUT", `/issues/dts-bindings/${encodeURIComponent(ticket)}`, {
      module_id: moduleId,
      updated_by: updatedBy,
    });
    if (!response.ok) {
      throw await this.errorFor(response, "绑定落账失败");
    }
  }

  async listPeople(): Promise<DtsPerson[]> {
    const body = await this.getJson<unknown>(`/auth/people`);
    if (!Array.isArray(body)) {
      throw new DtsFlowGatewayError(`云平台人员名单响应不是数组`, "unparsable");
    }
    return (body as Array<Record<string, unknown>>)
      .map((row) => ({
        username: String(row["username"] ?? ""),
        displayName: row["display_name"] === undefined || row["display_name"] === null ? null : String(row["display_name"]),
      }))
      .filter((person) => person.username.trim().length > 0);
  }

  private async getJson<T>(path: string): Promise<T> {
    const response = await this.request("GET", path);
    if (!response.ok) {
      throw await this.errorFor(response, "云平台请求失败");
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw new DtsFlowGatewayError("云平台响应不是合法 JSON", "unparsable");
    }
  }

  private async request(method: string, path: string, body?: unknown): Promise<Response> {
    let response: Response;
    try {
      response = await this.deps.fetch(`${this.baseUrl}${path}`, {
        method,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new DtsFlowGatewayError(`云平台不可达(${String(error)})`, "unreachable");
    }
    return response;
  }

  private async errorFor(response: Response, prefix: string): Promise<DtsFlowGatewayError> {
    const text = await response.text().catch(() => "");
    let detail = text.slice(0, 200);
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (typeof parsed["error"] === "string") detail = parsed["error"];
    } catch {
      /* 非 JSON 响应,保留原文截断 */
    }
    if (response.status === 401 || response.status === 403) {
      return new DtsFlowGatewayError(
        `${prefix}:云平台返回 ${String(response.status)}——免登录允许清单未放行,等待 yunine9/mae-flow-cloud#566;期间请用 mock 模式`,
        "not_authorized",
      );
    }
    if (response.status === 404) {
      return new DtsFlowGatewayError(`${prefix}:资源不存在(404)`, "not_found");
    }
    return new DtsFlowGatewayError(`${prefix}:HTTP ${String(response.status)} ${detail}`, "unreachable");
  }
}

/** 平台 DtsTicketBrief(蛇形)→ 领域摘要;version 缺席归空串(C 版口径,缺席不造值)。 */
function mapCloudBrief(row: Record<string, unknown>): DtsTicketSummary {
  return {
    ticket: String(row["ticket"] ?? ""),
    title: String(row["title"] ?? ""),
    status: String(row["status"] ?? ""),
    version: String(row["version"] ?? ""),
    severity: String(row["severity"] ?? ""),
    submitter: String(row["submitter"] ?? ""),
    url: String(row["url"] ?? ""),
    branch: row["branch"] === undefined || row["branch"] === null ? null : String(row["branch"]),
    moduleId: row["module_id"] === undefined || row["module_id"] === null ? null : String(row["module_id"]),
  };
}

/** mock 网关:罐头数据,单据按账号哈希轮转(人人有单);查无此单 fail-loud。 */
export class MockDtsGateway implements DtsGateway {
  readonly mock = true;

  async listByOwner(account: string): Promise<DtsTicketSummary[]> {
    const offset = [...account].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % MOCK_TICKETS.length;
    return MOCK_TICKETS.map((_, index) => MOCK_TICKETS[(index + offset) % MOCK_TICKETS.length] as DtsTicketDetail);
  }

  async getTicket(ticket: string): Promise<DtsTicketDetail> {
    const found = MOCK_TICKETS.find((item) => item.ticket === ticket);
    if (!found) {
      throw new DtsFlowGatewayError(`查无此单: ${ticket}`, "not_found");
    }
    return found;
  }

  async listModules(): Promise<DtsModuleOption[]> {
    return MOCK_MODULES;
  }

  async getBindings(): Promise<DtsBindingMap> {
    return MOCK_BINDINGS;
  }

  async putBinding(ticket: string, moduleId: string | null, updatedBy: string): Promise<void> {
    const entry = MOCK_BINDINGS[ticket];
    if (entry === undefined && moduleId !== null) {
      MOCK_BINDINGS[ticket] = { moduleId, updatedBy, updatedAt: new Date().toISOString() };
    }
  }

  async listPeople(): Promise<DtsPerson[]> {
    return MOCK_PEOPLE;
  }
}

export interface CreateGatewayInput {
  /** mae-flow-cloud 地址;null=未配置(非 mock 下 fail-loud,如实报不静默降级)。 */
  cloudBaseUrl: string | null;
  mock: boolean;
}

/** 网关工厂:mock 开关优先;云平台地址未配置 fail-loud。 */
export function createDtsGateway(input: CreateGatewayInput, deps: DtsGatewayDeps): DtsGateway {
  if (input.mock) return new MockDtsGateway();
  if (input.cloudBaseUrl === null) {
    throw new DtsFlowGatewayError(
      "云平台未配置:写入配置 cloudBaseUrl(mae-flow-cloud 地址 http://ip:端口),或改用 mock 模式",
      "not_configured",
    );
  }
  return new CloudPlatformGateway(input.cloudBaseUrl, deps);
}
