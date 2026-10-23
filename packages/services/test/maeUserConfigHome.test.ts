import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SaveCliMcpToUserDirectoryRequest } from "@zcode/shared";
import { createHooksService } from "../src/hooks/hooksService.js";
import { createMcpSyncService } from "../src/mcp-sync/mcpSyncService.js";

/**
 * mae hooks 与 MCP 用户配置隔离(#25,specs/mae/identity-isolation.md、specs/mae/README.md D3/D10)。
 *
 * 防丢网:hooksService 与 mcpSyncService 的用户级 home 解析必须尊重
 * ZCODE_DESKTOP_HOME_DIR(与 settingService 同链)。mae 启动时
 * desktopDataBaseDirBootstrap 注入该变量为 ~/.zcode-mae,两个服务的用户级
 * .zcode/.agents 配置随之落 mae 数据树;官方身份(未注入覆盖)保持上游真实
 * HOME 语义。挂接被 rebase 冲掉时本文件变红。
 *
 * mae 用例同时保留 HOME=官方 home 假根,确保断言只在解析链优先级上取胜,
 * 而不是依赖「本机 HOME 恰好未指向官方数据」。
 */

const originalEnv: Record<string, string | undefined> = {};
const MANAGED_ENV_KEYS = ["HOME", "USERPROFILE", "ZCODE_DESKTOP_HOME_DIR"];
const tempRoots: string[] = [];

function snapshotManagedEnv() {
  for (const key of MANAGED_ENV_KEYS) {
    originalEnv[key] = process.env[key];
  }
}

function restoreManagedEnv() {
  for (const key of MANAGED_ENV_KEYS) {
    if (originalEnv[key] == null) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }
}

function makeTempRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

/** 注入 mae 数据根(ZCODE_DESKTOP_HOME_DIR),模拟桌面 bootstrap(#9 的 mae 挂接)。 */
function injectMaeDataBaseDir(): string {
  const maeRoot = makeTempRoot("zcode-mae-home-");
  process.env.ZCODE_DESKTOP_HOME_DIR = maeRoot;
  return maeRoot;
}

/** 把 HOME 指到官方 home 假根(模拟同机共存的官方 ~/.zcode 轴)。 */
function injectOfficialHomeAxis(): string {
  const officialHome = makeTempRoot("zcode-official-home-");
  process.env.HOME = officialHome;
  return officialHome;
}

/** 撤销桌面 home 覆盖,模拟官方身份(未注入 ZCODE_DESKTOP_HOME_DIR)。 */
function clearDesktopHomeOverride(): void {
  delete process.env.ZCODE_DESKTOP_HOME_DIR;
}

function writeUserZcodeHooksConfig(home: string, command: string): void {
  mkdirSync(join(home, ".zcode", "cli"), { recursive: true });
  writeFileSync(
    join(home, ".zcode", "cli", "config.json"),
    JSON.stringify({
      hooks: {
        enabled: true,
        events: {
          SessionStart: [{ hooks: [{ type: "command", command }] }],
        },
      },
    }),
    "utf-8",
  );
}

const upsertMcpRequest: SaveCliMcpToUserDirectoryRequest = {
  action: "upsert",
  source: "zcodeagentmcp",
  name: "context7",
  config: {
    type: "stdio",
    command: "npx",
    args: ["-y", "@upstash/context7-mcp"],
  },
};

beforeEach(() => {
  snapshotManagedEnv();
});

afterEach(() => {
  restoreManagedEnv();
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("mae hooks 用户配置隔离(hooksService)", () => {
  it("mae 身份:用户级 zcode hooks 从 mae 数据根读取,官方 home 的 hook 不触发", async () => {
    const maeRoot = injectMaeDataBaseDir();
    const officialHome = injectOfficialHomeAxis();
    writeUserZcodeHooksConfig(maeRoot, "echo mae-hook");
    writeUserZcodeHooksConfig(officialHome, "echo official-hook");

    const workspacePath = makeTempRoot("zcode-hooks-ws-");
    const service = createHooksService();
    const result = await service.loadHooks({ workspacePath });

    expect(result.hooks.map((hook) => hook.command)).toEqual(["echo mae-hook"]);
    expect(
      result.hooks.every((hook) =>
        hook.location?.directoryPath.startsWith(join(maeRoot, ".zcode")),
      ),
    ).toBe(true);
  });

  it("mae 身份:用户级 hooks 保存落 mae 数据根,官方 home 对应文件零变化", async () => {
    const maeRoot = injectMaeDataBaseDir();
    const officialHome = injectOfficialHomeAxis();
    writeUserZcodeHooksConfig(officialHome, "echo official-hook");
    const officialBefore = readFileSync(
      join(officialHome, ".zcode", "cli", "config.json"),
      "utf-8",
    );

    const workspacePath = makeTempRoot("zcode-hooks-ws-");
    const service = createHooksService();
    await service.saveHooks({
      workspacePath,
      hooks: [
        {
          id: "mae-user-hook",
          event: "SessionStart",
          type: "command",
          command: "echo mae-save",
          enabled: true,
        },
      ],
    });

    const saved = JSON.parse(
      readFileSync(join(maeRoot, ".zcode", "cli", "config.json"), "utf-8"),
    );
    expect(saved.hooks.events.SessionStart).toEqual([
      { hooks: [{ type: "command", command: "echo mae-save", enabled: true }] },
    ]);
    expect(readFileSync(join(officialHome, ".zcode", "cli", "config.json"), "utf-8")).toBe(
      officialBefore,
    );
  });

  it("官方身份(未注入 home 覆盖):用户级 hooks 保持上游真实 HOME 语义", async () => {
    clearDesktopHomeOverride();
    const officialHome = injectOfficialHomeAxis();
    writeUserZcodeHooksConfig(officialHome, "echo official-hook");

    const workspacePath = makeTempRoot("zcode-hooks-ws-");
    const service = createHooksService();
    const result = await service.loadHooks({ workspacePath });

    expect(result.hooks.map((hook) => hook.command)).toEqual(["echo official-hook"]);
  });
});

describe("mae MCP 用户配置隔离(mcpSyncService)", () => {
  it("mae 身份:用户级 MCP server 保存落 mae 数据根,官方 home 零新增写入", async () => {
    const maeRoot = injectMaeDataBaseDir();
    const officialHome = injectOfficialHomeAxis();

    const service = createMcpSyncService();
    await service.saveMcpToUserDirectory(upsertMcpRequest);

    const saved = JSON.parse(
      readFileSync(join(maeRoot, ".zcode", "cli", "config.json"), "utf-8"),
    );
    expect(saved.mcp.servers.context7.command).toBe("npx");
    expect(existsSync(join(officialHome, ".zcode"))).toBe(false);
    expect(existsSync(join(officialHome, ".agents"))).toBe(false);
  });

  it("mae 身份:listLocalUserMcpCandidates 的 home 与 .agents 源都落 mae 数据根", async () => {
    const maeRoot = injectMaeDataBaseDir();
    const officialHome = injectOfficialHomeAxis();
    mkdirSync(join(officialHome, ".agents"), { recursive: true });
    writeFileSync(
      join(officialHome, ".agents", "mcp.json"),
      JSON.stringify({ mcpServers: { leak: { command: "echo leak" } } }),
      "utf-8",
    );

    const service = createMcpSyncService();
    const result = await service.listLocalUserMcpCandidates();

    expect(result.localHomeDir).toBe(maeRoot);
    expect(result.candidates).toEqual([]);
    expect(existsSync(join(maeRoot, ".agents", "mcp.json"))).toBe(false);
  });

  it("官方身份(未注入 home 覆盖):用户级 MCP 保存保持上游真实 HOME 语义", async () => {
    clearDesktopHomeOverride();
    const officialHome = injectOfficialHomeAxis();

    const service = createMcpSyncService();
    await service.saveMcpToUserDirectory(upsertMcpRequest);

    const saved = JSON.parse(
      readFileSync(join(officialHome, ".zcode", "cli", "config.json"), "utf-8"),
    );
    expect(saved.mcp.servers.context7.command).toBe("npx");
  });
});
