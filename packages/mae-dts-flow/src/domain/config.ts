/** 服务配置的领域装配:纯逻辑,不碰文件系统;文件读取在 adapters/configLoader。 */

export interface DtsFlowConfig {
  /** 服务数据根(台账、事件流、本地兜底配置都住这里,在问题工作区之外)。 */
  dataDir: string;
  /** 依赖组件目录(codehubcli 等;缺席不阻启动,调用时 fail-loud)。 */
  binDir: string;
  /** 工号:分支名 master_<工号>_<单号> 的因子;mock 模式缺省 dev。 */
  employeeId: string;
  /** mae-flow-cloud 地址(模块绑定云端层);null=只用本地兜底。 */
  cloudBaseUrl: string | null;
  /** DTS MCP 网关地址(#38 对拍口径);null=未配置,拉单 fail-loud。 */
  dtsGatewayUrl: string | null;
  /** x-auth-token 文件路径;只存路径,内容永不进配置摘要。 */
  dtsTokenPath: string;
  /** HTTP 面端口。 */
  httpPort: number;
  /** mock 模式:罐头单据,外网开发/演示用。 */
  mock: boolean;
}

export class DtsFlowConfigError extends Error {}

export const KNOWN_CONFIG_KEYS: readonly string[] = [
  "dataDir",
  "binDir",
  "employeeId",
  "cloudBaseUrl",
  "dtsGatewayUrl",
  "dtsTokenPath",
  "httpPort",
  "mock",
];

export interface AssembleConfigInput {
  /** 配置文件解析出的键值;null=无配置文件。 */
  fileValues: Record<string, unknown> | null;
  /** mae 业务数据根(如 <home>/.zcode-mae);路径拼接在装配层完成。 */
  maeRoot: string;
}

/**
 * 纯装配:缺省值 ← 配置文件 ← mock 兜底。
 * 未知键拒绝(防拼写错静默失效);employeeId 非 mock 缺失即抛;非法值 fail-loud。
 */
export function assembleConfig(input: AssembleConfigInput): DtsFlowConfig {
  const fileValues = input.fileValues ?? {};
  for (const key of Object.keys(fileValues)) {
    if (!KNOWN_CONFIG_KEYS.includes(key)) {
      throw new DtsFlowConfigError(
        `配置文件含未知字段「${key}」(已知: ${KNOWN_CONFIG_KEYS.join(", ")})`,
      );
    }
  }

  const dataDir = pickString(fileValues, "dataDir") ?? joinPath(input.maeRoot, "dts-flow");
  const mock = fileValues["mock"] === true;
  const employeeId = pickString(fileValues, "employeeId") ?? (mock ? "dev" : "");
  if (!employeeId) {
    throw new DtsFlowConfigError("配置缺少 employeeId(工号,分支名因子);写入配置文件或改用 mock 模式");
  }

  return {
    dataDir,
    binDir: pickString(fileValues, "binDir") ?? joinPath(input.maeRoot, "bin"),
    employeeId,
    cloudBaseUrl: assertHttpUrlIfPresent(pickString(fileValues, "cloudBaseUrl"), "cloudBaseUrl"),
    dtsGatewayUrl: assertHttpUrlIfPresent(pickString(fileValues, "dtsGatewayUrl"), "dtsGatewayUrl"),
    dtsTokenPath: pickString(fileValues, "dtsTokenPath") ?? joinPath(dataDir, "mcp-token"),
    httpPort: pickPort(fileValues),
    mock,
  };
}

function pickString(fileValues: Record<string, unknown>, field: string): string | null {
  const value = fileValues[field];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new DtsFlowConfigError(`配置字段 ${field} 必须是字符串`);
  return value;
}

function assertHttpUrlIfPresent(value: string | null, field: string): string | null {
  if (value === null) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new DtsFlowConfigError(`${field} 不是合法 URL: ${value}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new DtsFlowConfigError(`${field} 只允许 http/https: ${value}`);
  }
  return value.replace(/\/+$/, "");
}

function pickPort(fileValues: Record<string, unknown>): number {
  const value = fileValues["httpPort"];
  if (value === undefined || value === null) return 8788;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 65535) {
    throw new DtsFlowConfigError(`配置字段 httpPort 必须是 1-65535 的整数,得到 ${String(value)}`);
  }
  return value;
}

/** 领域层只做路径拼接语义,不直接依赖 node:path(由装配方注入分隔符实现)。 */
function joinPath(root: string, segment: string): string {
  const separator = root.includes("\\") || /^[A-Za-z]:/.test(root) ? "\\" : "/";
  return `${root.replace(/[\\/]+$/, "")}${separator}${segment}`;
}
