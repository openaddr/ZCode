/** dts-flow 插件包出仓契约(#96):构建产物形状、manifest 声明、技能泛化都在这道门上校验。 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const manifestPath = join(packageRoot, ".zcode-plugin", "plugin.json");
const serverPath = join(packageRoot, "dist", "mcp", "server.js");
const skillPath = join(packageRoot, "skills", "dts-issue-flow", "SKILL.md");

const FLOW_TOOLS = ["dts_get_ticket", "submit_analysis", "create_mr", "complete_stage", "server_info"];
const STAGES = ["dts_info", "prep_repo", "analyze", "fix", "mr_green"];

/** EOL 铁律:mae 新文件一律 LF。 */
function assertLf(content: string, label: string): void {
  expect(content.includes("\r"), `${label} 含 CR(必须 LF)`).toBe(false);
}

describe("dts-flow plugin manifest", () => {
  it("declares the dts-flow stdio mcp server and skills directory", async () => {
    const raw = await readFile(manifestPath, "utf8");
    assertLf(raw, "plugin.json");
    const manifest = JSON.parse(raw) as {
      name?: string;
      version?: string;
      skills?: string;
      mcpServers?: Record<string, { command?: unknown; args?: unknown[] }>;
    };
    expect(manifest.name).toBe("dts-flow");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.skills).toBe("skills");
    const server = manifest.mcpServers?.["dts-flow"];
    expect(server).toBeDefined();
    expect(typeof server?.command).toBe("string");
    // 宿主改写只替换 ${ZCODE_PLUGIN_ROOT}(official-plugin-runtime.ts),入口必须走插件相对形状。
    expect(server?.args).toEqual(["${ZCODE_PLUGIN_ROOT}/dist/mcp/server.js"]);
  });
});

describe("dts-flow plugin build artifact", () => {
  it("builds dist/mcp/server.js exporting main()", async () => {
    const build = spawnSync(process.execPath, ["scripts/build-mcp.mjs"], { cwd: packageRoot });
    expect(build.status, build.stderr.toString()).toBe(0);
    expect(existsSync(serverPath)).toBe(true);

    const raw = readFileSync(serverPath, "utf8");
    assertLf(raw, "dist/mcp/server.js");
    for (const tool of FLOW_TOOLS) {
      expect(raw.includes(tool), `bundle 缺工具名 ${tool}`).toBe(true);
    }
    // 宿主 __zcode-plugin-host 动态 import 本文件并要求 main() 导出(spike #95 实测形状)。
    const mod = (await import(pathToFileURL(serverPath).href)) as { main?: unknown };
    expect(typeof mod.main).toBe("function");
  });
});

describe("dts-issue-flow skill", () => {
  it("is a generalized five-stage skill without baked-in ticket identity", async () => {
    expect(existsSync(skillPath)).toBe(true);
    const raw = await readFile(skillPath, "utf8");
    assertLf(raw, "SKILL.md");
    expect(raw.includes("name: dts-issue-flow")).toBe(true);
    for (const tool of FLOW_TOOLS) {
      expect(raw.includes(tool), `技能缺工具 ${tool}`).toBe(true);
    }
    for (const stage of STAGES) {
      expect(raw.includes(stage), `技能缺阶段 ${stage}`).toBe(true);
    }
    // 泛化红线:不烤死单号/工号/分支——分支一律写成占位形状 master_<工号>_<单号>。
    expect(raw).toContain("master_<工号>_<单号>");
    expect(raw).not.toMatch(/master_\d/);
    expect(raw).not.toMatch(/\d{6,}/);
  });
});
