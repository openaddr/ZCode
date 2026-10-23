import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const toPosix = (path: string) => path.replaceAll("\\", "/");

/**
 * mae 运行态写入重定位——CLI 执行侧 workspace hook trust store(#31,specs/mae D3)。
 *
 * 防丢网:mae 桌面 host 经 buildHostProcessEnv 透传 ZCODE_DESKTOP_HOME_DIR(mae 数据根
 * ~/.zcode-mae),CLI 执行侧(adapters)的 trust store 解析与 services 侧(#25)同链——
 * `ZCODE_DESKTOP_HOME_DIR → HOME → USERPROFILE → homedir()`;未注入(官方 CLI/官方桌面)
 * 保持上游 ~/.zcode/security 语义。挂接被 rebase 冲掉即红。
 */
describe("workspace hook trust store 的 mae 用户级 home 挂接", () => {
  const MANAGED_ENV_KEYS = ["ZCODE_DESKTOP_HOME_DIR", "HOME", "USERPROFILE"] as const;
  const originalEnv: Record<string, (typeof MANAGED_ENV_KEYS)[number] | undefined> = {};
  const tempDirs: string[] = [];

  async function makeTempDir(prefix: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  }

  beforeEach(() => {
    for (const key of MANAGED_ENV_KEYS) {
      originalEnv[key] = process.env[key];
    }
  });

  afterEach(async () => {
    for (const key of MANAGED_ENV_KEYS) {
      if (originalEnv[key] == null) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
    for (const dir of tempDirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("ZCODE_DESKTOP_HOME_DIR 已注入(mae 桌面 host)时 trust store 落 mae 数据根", async () => {
    const maeHome = await makeTempDir("mae-trust-home-");
    process.env.ZCODE_DESKTOP_HOME_DIR = maeHome;
    const { resolveWorkspaceHookTrustStorePath } = await import(
      "../src/storage/workspace-hook-trust-store.js"
    );

    const resolved = await resolveWorkspaceHookTrustStorePath();
    expect(toPosix(resolved)).toBe(
      toPosix(join(maeHome, ".zcode", "security", "workspace-hook-trust-v1.json")),
    );
  });

  it("mae 根下 user config 无 storage.dir 配置时落 mae home 兜底树(配置轴仍优先)", async () => {
    const maeHome = await makeTempDir("mae-trust-home-");
    process.env.ZCODE_DESKTOP_HOME_DIR = maeHome;
    const { resolveWorkspaceHookTrustStorePath } = await import(
      "../src/storage/workspace-hook-trust-store.js"
    );

    const resolved = await resolveWorkspaceHookTrustStorePath({
      userConfigPath: join(maeHome, ".zcode", "cli", "config.json"),
    });
    expect(toPosix(resolved)).toBe(
      toPosix(join(maeHome, ".zcode", "security", "workspace-hook-trust-v1.json")),
    );
  });

  it("显式 homeDir 参数(测试/调用方注入)优先于环境轴", async () => {
    const explicitHome = await makeTempDir("mae-trust-explicit-");
    process.env.ZCODE_DESKTOP_HOME_DIR = "/env/mae-home-ignored";
    const { resolveWorkspaceHookTrustStorePath } = await import(
      "../src/storage/workspace-hook-trust-store.js"
    );

    const resolved = await resolveWorkspaceHookTrustStorePath({ homeDir: explicitHome });
    expect(toPosix(resolved)).toBe(
      toPosix(join(explicitHome, ".zcode", "security", "workspace-hook-trust-v1.json")),
    );
  });

  it("未注入覆盖(官方 CLI/官方桌面)时保持上游 ~/.zcode/security 语义", async () => {
    delete process.env.ZCODE_DESKTOP_HOME_DIR;
    const { resolveWorkspaceHookTrustStorePath } = await import(
      "../src/storage/workspace-hook-trust-store.js"
    );

    const resolved = await resolveWorkspaceHookTrustStorePath();
    expect(toPosix(resolved)).toBe(
      toPosix(join(homedir(), ".zcode", "security", "workspace-hook-trust-v1.json")),
    );
  });
});
