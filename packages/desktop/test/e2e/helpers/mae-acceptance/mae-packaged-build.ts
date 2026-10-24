import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * mae 全局验收(#34):win-unpacked mae 打包构建的解析与按需产出。
 *
 * 构建入口固定走 mae 默认身份链(desktop `bundle` 脚本 `--os win --arch x64`,
 * 无任何身份 env——D14 默认翻转守卫保证产物即 mae 身份)。bundle 产出的
 * `dist/win-unpacked/ZCode Mae.exe`(productName=D10)即为验收启动对象:
 * 打包态运行名链给出 userData=%APPDATA%\ZCode Mae 与单实例锁的物理基础。
 */
export const ZCODE_E2E_MAE_PACKAGED_APP_ENV = "ZCODE_E2E_MAE_PACKAGED_APP";
export const ZCODE_E2E_MAE_REBUILD_ENV = "ZCODE_E2E_MAE_REBUILD";
export const MAE_WIN_UNPACKED_EXE_RELATIVE_PATH = join("dist", "win-unpacked", "ZCode Mae.exe");
export const MAE_PACKAGED_APP_IMAGE_NAME = "ZCode Mae.exe";
export const DEFAULT_MAE_PACKAGED_BUILD_TIMEOUT_MS = 30 * 60_000;

export interface ResolveMaePackagedAppPathOptions {
  desktopDir: string;
  env?: NodeJS.ProcessEnv;
}

/** 解析可用的 mae 打包 exe;不存在返回 null(调用方决定是否触发构建)。 */
export function resolveMaePackagedAppPath({
  desktopDir,
  env = process.env,
}: ResolveMaePackagedAppPathOptions): string | null {
  const overridePath = env[ZCODE_E2E_MAE_PACKAGED_APP_ENV]?.trim();
  const candidate = overridePath
    ? resolve(overridePath)
    : resolve(desktopDir, MAE_WIN_UNPACKED_EXE_RELATIVE_PATH);
  return existsSync(candidate) ? candidate : null;
}

/**
 * WDIO worker 环境不能直接喂给打包构建:HOME/USERPROFILE 已被 runnerEnv 指到
 * .e2e-home(corepack/pnpm 缓存会失联),NODE_OPTIONS 携带 tsx loader(pnpm 11
 * 会误读 .pnpmfile),ZCODE_ENV=test 会把验收产物烤成测试后端,VITE_ZCODE_E2E_
 * STORE_BRIDGE=1 会向正式 renderer 泄漏可变全局 store。这里复刻 wdio.conf
 * createPnpmChildEnv 的清洗口径,并按 specs/mae(identity-isolation.md「mae 构建
 * 固定 ZCODE_ENV=production」)锁定验收构建的后端轴。
 */
export function buildMaePackagedBuildEnv(
  env: NodeJS.ProcessEnv,
  realUserHome: string,
): NodeJS.ProcessEnv {
  const cleanedEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value !== "string") {
      continue;
    }
    if (key === "NODE_OPTIONS") {
      continue;
    }
    if (key === "ZCODE_ENV" || key === "VITE_ZCODE_E2E_STORE_BRIDGE") {
      continue;
    }
    if (key.startsWith("ZCODE_E2E_") || key.startsWith("E2E_")) {
      continue;
    }
    cleanedEnv[key] = value;
  }
  return {
    ...cleanedEnv,
    HOME: realUserHome,
    USERPROFILE: realUserHome,
    ZCODE_ENV: "production",
    // Bugfix 同源:agent 构建脚本会进入 apps/zcode-cli 子 workspace,verify-deps
    // 自动 install 在该 workspace 解析不了根仓库 @zcode/shared,必须关闭。
    PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN: "false",
  };
}

export interface EnsureMaePackagedBuildOptions {
  desktopDir: string;
  env?: NodeJS.ProcessEnv;
  /** 构建子进程超时;挂死的下载/构建不能拖垮整个 WDIO run。 */
  execTimeoutMs?: number;
  realUserHome: string;
}

export interface MaePackagedBuildResult {
  appPath: string;
  builtThisRun: boolean;
}

export async function ensureMaePackagedBuild({
  desktopDir,
  env = process.env,
  execTimeoutMs = DEFAULT_MAE_PACKAGED_BUILD_TIMEOUT_MS,
  realUserHome,
}: EnsureMaePackagedBuildOptions): Promise<MaePackagedBuildResult> {
  const forceRebuild = env[ZCODE_E2E_MAE_REBUILD_ENV]?.trim() === "1";
  const existing = resolveMaePackagedAppPath({ desktopDir, env });
  if (existing && !forceRebuild) {
    return { appPath: existing, builtThisRun: false };
  }

  console.warn(
    `[mae-acceptance] win-unpacked mae 构建缺失或强制重建(${forceRebuild ? "ZCODE_E2E_MAE_REBUILD=1" : "dist 未命中"}),` +
      `开始打包: node scripts/bundle.mjs --os win --arch x64 (timeout=${Math.round(execTimeoutMs / 60_000)}min)`,
  );
  await runMaePackagedBuild({ desktopDir, env, execTimeoutMs, realUserHome });

  const built = resolveMaePackagedAppPath({ desktopDir, env });
  if (!built) {
    throw new Error(
      `[mae-acceptance] bundle 已结束但仍未找到 ${resolve(desktopDir, MAE_WIN_UNPACKED_EXE_RELATIVE_PATH)};` +
        `可用 ${ZCODE_E2E_MAE_PACKAGED_APP_ENV} 显式指定已构建产物`,
    );
  }
  return { appPath: built, builtThisRun: true };
}

function runMaePackagedBuild({
  desktopDir,
  env,
  execTimeoutMs,
  realUserHome,
}: {
  desktopDir: string;
  env: NodeJS.ProcessEnv;
  execTimeoutMs: number;
  realUserHome: string;
}): Promise<void> {
  return new Promise((resolveRun, rejectRun) => {
    // 直接驱动 bundle.mjs(其内部子命令自带 desktopRoot cwd),绕开 pnpm 参数
    // 转发对 `--`/`--win` 形态的差异;构建入口与 `pnpm bundle:desktop` 等价。
    const child = spawn(
      process.execPath,
      [join(desktopDir, "scripts", "bundle.mjs"), "--os", "win", "--arch", "x64"],
      {
        cwd: desktopDir,
        env: buildMaePackagedBuildEnv(env, realUserHome),
        stdio: "inherit",
      },
    );
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      rejectRun(
        new Error(`[mae-acceptance] mae 打包构建超时(${Math.round(execTimeoutMs / 60_000)}min)被终止`),
      );
    }, execTimeoutMs);
    child.once("error", (error) => {
      clearTimeout(timeout);
      rejectRun(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolveRun();
        return;
      }
      rejectRun(new Error(`[mae-acceptance] mae 打包构建失败,exit code=${code}`));
    });
  });
}
