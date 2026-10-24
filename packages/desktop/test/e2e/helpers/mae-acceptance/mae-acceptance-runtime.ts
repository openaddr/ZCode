import { execFile, spawn } from "node:child_process";
import { openSync } from "node:fs";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { buildWindowsTaskkillArgs } from "../e2e-process-cleanup.js";

/**
 * mae 全局验收(#34):真实身份启动的运行时工具。
 *
 * 验收对象必须以"真实用户环境"启动——剥离 WDIO runnerEnv 注入的全部身份/数据
 * 重定向 env(否则 ZCODE_DATA_BASE_DIR 等保留覆盖轴会让 mae 数据根 bootstrap
 * 直接退位,验收就失去了对象),并把 HOME/USERPROFILE 恢复到真实用户目录。
 * 网络审计的代理 env 在清洗后最后叠加,保证它不被继承值覆盖。
 */
const execFileAsync = promisify(execFile);
const TASKLIST_MAX_BUFFER_BYTES = 20 * 1024 * 1024;

export interface MaeAcceptanceRealHomePaths {
  appDataRoaming: string;
  userHome: string;
}

/**
 * WDIO worker 的 HOME/USERPROFILE 已指向 .e2e-home;真实用户目录从原样透传的
 * APPDATA(%APPDATA% 本就是官方/mae userData 的物理落点)推导,并提供
 * ZCODE_E2E_MAE_REAL_HOME 显式覆盖轴兜底非标准布局。
 */
export function resolveMaeAcceptanceRealHomePaths(
  env: NodeJS.ProcessEnv = process.env,
): MaeAcceptanceRealHomePaths {
  const appDataRoaming = env.APPDATA?.trim();
  if (!appDataRoaming) {
    throw new Error(
      "[mae-acceptance] worker 环境缺少 APPDATA,无法定位 %APPDATA% 与真实用户目录;可设置 ZCODE_E2E_MAE_REAL_HOME 显式指定",
    );
  }
  const userHome = env.ZCODE_E2E_MAE_REAL_HOME?.trim() || resolve(appDataRoaming, "..", "..");
  return { appDataRoaming, userHome };
}

/**
 * 必须剥离的继承键:WDIO 身份/数据轴(ZCODE_DATA_BASE_DIR 是 mae 数据根 bootstrap
 * 的保留覆盖轴)、e2e 专用应用名、代理与 CA 键(审计代理 env 随后显式叠加)、
 * 以及一切 ZCODE_E2E_ 与 E2E_ 前缀的测试注入。
 */
const MAE_CHILD_ENV_REMOVAL_KEYS: readonly string[] = [
  "ZCODE_DATA_BASE_DIR",
  "ZCODE_DESKTOP_APPLICATION_NAME",
  "ZCODE_DESKTOP_HOME_DIR",
  "ZCODE_DESKTOP_SESSION_DATA_DIR",
  "ZCODE_DESKTOP_USER_DATA_DIR",
  "ZCODE_DESKTOP_USE_ELECTRON_DEFAULT_USER_DATA",
  "ZCODE_ENV",
  "ZCODE_BUILTIN_PROVIDER_CONFIG_FILE",
  "ZCODE_AGENT_SERVER_ARGS_JSON",
  "ZCODE_AGENT_SERVER_COMMAND",
  "ZCODE_AGENT_SERVER_CWD",
  "ZCODE_DISABLE_FIXED_REMOTE_DEBUGGING_PORT",
  "ZCODE_HTTP_PROXY",
  "ZCODE_NO_PROXY",
  "ZCODE_AGENT_CA_CERT",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "NO_PROXY",
  "no_proxy",
  "NODE_EXTRA_CA_CERTS",
  "SSL_CERT_FILE",
  "CURL_CA_BUNDLE",
  "REQUESTS_CA_BUNDLE",
  "GIT_SSL_CAINFO",
  "VITE_ZCODE_E2E_STORE_BRIDGE",
];
const MAE_CHILD_ENV_REMOVAL_PATTERNS: readonly RegExp[] = [/^ZCODE_E2E_/u, /^E2E_/u];

export interface BuildMaeAcceptanceChildEnvOptions {
  proxyEnv?: Record<string, string>;
  realUserHome: string;
}

export function buildMaeAcceptanceChildEnv(
  env: NodeJS.ProcessEnv,
  { proxyEnv = {}, realUserHome }: BuildMaeAcceptanceChildEnvOptions,
): NodeJS.ProcessEnv {
  const childEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value !== "string") {
      continue;
    }
    if (MAE_CHILD_ENV_REMOVAL_KEYS.includes(key)) {
      continue;
    }
    if (MAE_CHILD_ENV_REMOVAL_PATTERNS.some((pattern) => pattern.test(key))) {
      continue;
    }
    childEnv[key] = value;
  }
  childEnv.HOME = realUserHome;
  childEnv.USERPROFILE = realUserHome;
  return { ...childEnv, ...proxyEnv };
}

export interface MaeAppInstance {
  exited: boolean;
  exitCode: Promise<number | null>;
  pid: number;
  startedAtMs: number;
  kill(): Promise<void>;
}

export interface LaunchMaeAppInstanceOptions {
  args?: string[];
  env: NodeJS.ProcessEnv;
  /** stdout/stderr 落盘路径(验收证据与排障)。 */
  logFilePath: string;
}

export function launchMaeAppInstance(
  appPath: string,
  { args = [], env, logFilePath }: LaunchMaeAppInstanceOptions,
): MaeAppInstance {
  const logFileDescriptor = openSync(logFilePath, "a");
  const child = spawn(appPath, args, {
    cwd: dirname(appPath),
    env,
    stdio: ["ignore", logFileDescriptor, logFileDescriptor],
  });
  let exited = false;
  const instance: MaeAppInstance = {
    get exited() {
      return exited;
    },
    exitCode: new Promise<number | null>((resolveExit) => {
      child.once("exit", (code) => {
        exited = true;
        resolveExit(code);
      });
    }),
    pid: child.pid ?? -1,
    startedAtMs: Date.now(),
    async kill() {
      if (child.exitCode !== null || child.signalCode !== null || exited) {
        return;
      }
      if (process.platform === "win32") {
        await terminateWindowsProcessTree(child.pid ?? -1);
      } else {
        child.kill("SIGKILL");
      }
    },
  };
  return instance;
}

export function isWindowsProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | null)?.code;
    // EPERM:进程存在但权限不足;ESRCH 才是真的不存在。
    return code === "EPERM";
  }
}

export async function terminateWindowsProcessTree(pid: number): Promise<void> {
  if (!Number.isInteger(pid) || pid <= 0) {
    return;
  }
  try {
    await execFileAsync("taskkill", buildWindowsTaskkillArgs([pid]));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // 进程已自行退出时 taskkill 报"找不到进程",不是清理失败。
    if (!/找不到|not found|no such/iu.test(message)) {
      throw error;
    }
  }
}

export interface WaitForConditionOptions {
  intervalMs?: number;
  timeoutMs: number;
}

export async function waitForMaeCondition(
  label: string,
  predicate: () => boolean | Promise<boolean>,
  { intervalMs = 250, timeoutMs }: WaitForConditionOptions,
): Promise<void> {
  const deadlineMs = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) {
      return;
    }
    if (Date.now() >= deadlineMs) {
      throw new Error(`[mae-acceptance] 等待超时(${timeoutMs}ms): ${label}`);
    }
    await new Promise((resolveSleep) => setTimeout(resolveSleep, intervalMs));
  }
}

export async function waitForPathToExist(
  path: string,
  { timeoutMs }: WaitForConditionOptions,
): Promise<void> {
  await waitForMaeCondition(`路径出现 ${path}`, () => existsSync(path), { timeoutMs });
}

/** 统计指定 image(如 ZCode Mae.exe)的进程数;新开窗口会带动 renderer 进程数上涨。 */
export async function countWindowsImageProcesses(imageName: string): Promise<number> {
  const { stdout } = await execFileAsync(
    "tasklist",
    ["/fo", "csv", "/fi", `IMAGENAME eq ${imageName}`],
    { maxBuffer: TASKLIST_MAX_BUFFER_BYTES },
  );
  return parseTasklistCsvOutput(stdout).length;
}

/** 断言验收对象未被并行实例占用:真实 mae 实例在跑会让第二实例语义失真。 */
export async function assertNoRunningMaeAppInstances(imageName: string): Promise<void> {
  const count = await countWindowsImageProcesses(imageName);
  if (count > 0) {
    throw new Error(
      `[mae-acceptance] 检测到 ${count} 个已在运行的 ${imageName}:请先退出本机 zcode-mae 实例再跑验收(否则单实例/零交集断言对象失真)`,
    );
  }
}

/**
 * 解析 tasklist /fo csv 输出为行数组。标题行一并剔除;无匹配进程时 tasklist
 * 输出信息行(如 "INFO: no tasks...")而非 CSV,此时按 0 行处理。
 */
export function parseTasklistCsvOutput(output: string): string[][] {
  const rows: string[][] = [];
  for (const line of output.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('"')) {
      continue;
    }
    rows.push(parseTasklistCsvLine(trimmed));
  }
  // 首行是列名("映像名称","PID",...)。
  return rows.slice(1);
}

function parseTasklistCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (character === "," && !inQuotes) {
      fields.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  fields.push(current);
  return fields;
}
