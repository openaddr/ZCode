import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const toPosix = (path: string) => path.replaceAll("\\", "/");

/**
 * mae 用户级 MCP 目录隔离(#31 边界核实收口,specs/mae D3)。
 *
 * 核实结论:desktop mcpUserDirectory 的 resolveUserHomeDir 只看 HOME/USERPROFILE,
 * 未挂 ZCODE_DESKTOP_HOME_DIR——mae 身份下设置页用户级 MCP(`.zcode/cli/config.json`
 * 与 `.agents/mcp.json`)仍读写官方 ~/.zcode,与 services 侧 mcpSyncService(#25)错位。
 * 收口:与 settingService/hooksService/mcpSyncService 同链(ZCODE_DESKTOP_HOME_DIR 优先),
 * 用户级 MCP 两源落 mae 数据根;未注入(官方身份)保持真实 HOME 上游语义。
 * 挂接被 rebase 冲掉即红。
 */
describe("desktop mcpUserDirectory 的 mae 用户级 home 挂接", () => {
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

  it("ZCODE_DESKTOP_HOME_DIR 已注入(mae)时用户级 zcode 源从 mae 根读取", async () => {
    const maeHome = await makeTempDir("mae-mcp-home-");
    const officialHome = await makeTempDir("mae-mcp-official-");
    process.env.ZCODE_DESKTOP_HOME_DIR = maeHome;
    // 官方 home 同树放置同名配置:若解析仍指官方,会读到 official-server 而非 mae-server。
    process.env.HOME = officialHome;
    process.env.USERPROFILE = officialHome;
    const maeConfigDir = join(maeHome, ".zcode", "cli");
    const officialConfigDir = join(officialHome, ".zcode", "cli");
    await mkdir(maeConfigDir, { recursive: true });
    await mkdir(officialConfigDir, { recursive: true });
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      join(maeConfigDir, "config.json"),
      JSON.stringify({ mcp: { servers: { "mae-server": { command: "echo" } } } }),
      "utf-8",
    );
    await writeFile(
      join(officialConfigDir, "config.json"),
      JSON.stringify({ mcp: { servers: { "official-server": { command: "echo" } } } }),
      "utf-8",
    );

    const { loadCliMcpFromUserDirectory } = await import("../src/main/mcpUserDirectory/index.js");
    const result = await loadCliMcpFromUserDirectory();

    const userNames = result.servers.filter((server) => server.scope === "user").map((s) => s.name);
    expect(userNames).toContain("mae-server");
    expect(userNames).not.toContain("official-server");
  });

  it("ZCODE_DESKTOP_HOME_DIR 已注入(mae)时用户级 upsert 写 mae 根,官方 home 零写入", async () => {
    const maeHome = await makeTempDir("mae-mcp-home-");
    const officialHome = await makeTempDir("mae-mcp-official-");
    process.env.ZCODE_DESKTOP_HOME_DIR = maeHome;
    process.env.HOME = officialHome;
    process.env.USERPROFILE = officialHome;

    const { saveCliMcpToUserDirectory } = await import("../src/main/mcpUserDirectory/index.js");
    await saveCliMcpToUserDirectory({
      action: "upsert",
      config: { command: "echo", args: ["hi"] },
      name: "mae-upserted",
    });

    const maeConfig = JSON.parse(
      await readFile(join(maeHome, ".zcode", "cli", "config.json"), "utf-8"),
    ) as { mcp?: { servers?: Record<string, unknown> } };
    expect(maeConfig.mcp?.servers?.["mae-upserted"]).toBeDefined();
    // 官方 home 下不得出现任何 .zcode 写入。
    const { readdir } = await import("node:fs/promises");
    await expect(readdir(join(officialHome, ".zcode"))).rejects.toThrow();
  });

  it("未注入覆盖(官方身份)时用户级 MCP 保持真实 HOME 上游语义", async () => {
    delete process.env.ZCODE_DESKTOP_HOME_DIR;
    const officialHome = await makeTempDir("mae-mcp-official-");
    process.env.HOME = officialHome;
    process.env.USERPROFILE = officialHome;
    const officialConfigDir = join(officialHome, ".zcode", "cli");
    await mkdir(officialConfigDir, { recursive: true });
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      join(officialConfigDir, "config.json"),
      JSON.stringify({ mcp: { servers: { "official-server": { command: "echo" } } } }),
      "utf-8",
    );

    const { loadCliMcpFromUserDirectory } = await import("../src/main/mcpUserDirectory/index.js");
    const result = await loadCliMcpFromUserDirectory();

    const userNames = result.servers.filter((server) => server.scope === "user").map((s) => s.name);
    expect(userNames).toContain("official-server");
  });
});
