/**
 * mae: dts-flow 官方插件的 MCP server 入口(#96)。
 * 形状硬约束(spike #95 实测):宿主 `__zcode-plugin-host` 动态 import 本文件并调用
 * `main()` 导出;stdio 协议独占 stdout,日志一律 stderr。
 * 职责是薄适配:全部装配逻辑复用 packages/mae-dts-flow 的公开出口(serve.ts 的 stdio 面
 * 等价物),服务本体零改动。配置读缺省路径 ~/.zcode-mae/dts-flow/config.json(票 #63)。
 */
import { mkdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import {
  SERVER_INFO_TOOL,
  buildFlowToolHandlers,
  createDtsFlowService,
  createMcpStdioFace,
  loadConfig,
  type McpFaceHandlers,
} from "@mae/dts-flow";

interface PluginArgs {
  config?: string;
  mock: boolean;
}

function parseArgs(argv: readonly string[]): PluginArgs {
  const args: PluginArgs = { mock: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      // plugin-host 对 server 附加参数原样透传(实测不吞分隔符),跳过即可。
      continue;
    }
    if (arg === "--mock") {
      args.mock = true;
    } else if (arg === "--config") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error("--config 需要参数");
      }
      args.config = value;
      index += 1;
    } else {
      throw new Error(`未知参数: ${String(arg)}`);
    }
  }
  return args;
}

/**
 * 缺省配置路径。与 mae-dts-flow adapters/configLoader.defaultConfigPath 一致(#63);
 * contract 未导出该函数,插件侧按同式复算——漂移只会退化成"全缺省启动",不会崩。
 */
function defaultConfigPath(): string {
  return path.join(homedir(), ".zcode-mae", "dts-flow", "config.json");
}

/** 与 serve.ts 同款:无 --config 时探缺省配置文件,不存在=全缺省启动。 */
async function resolveConfigPath(explicit: string | undefined): Promise<string | undefined> {
  if (explicit !== undefined) return explicit;
  const fallback = defaultConfigPath();
  return await stat(fallback).then(
    () => fallback,
    () => undefined,
  );
}

export async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const configPath = await resolveConfigPath(args.config);
  const config = await loadConfig(configPath === undefined ? {} : { configPath });
  if (args.mock) config.platform = "mock";
  await mkdir(config.dataDir, { recursive: true });

  // plugin-host 把 process.argv 改写成 [execPath, server, ...args]:argv[1] 即本文件。
  // selfLauncher 只物化进问题工作区的项目级 MCP 配置(遗留挂载链,#92 后仅作兜底),
  // 插件路径本身由宿主 manifest 改写负责,不经这里。
  const selfEntry = process.argv[1];
  const service = createDtsFlowService(config, {
    fetch,
    selfLauncher: {
      command: process.execPath,
      args: [selfEntry, "--stdio"],
      env: { ELECTRON_RUN_AS_NODE: "1" },
    },
  });

  const handlers: McpFaceHandlers = (() => {
    const flow = buildFlowToolHandlers(service);
    return {
      listTools: () => [SERVER_INFO_TOOL, ...flow.listTools()],
      callTool: async (name, toolArgs) =>
        name === SERVER_INFO_TOOL.name ? textSelfInfo(service) : flow.callTool(name, toolArgs),
    };
  })();
  const mcpFace = createMcpStdioFace(handlers, {
    input: process.stdin,
    output: process.stdout,
    serverInfo: { name: "mae-dts-flow", version: "0.1.0" },
  });
  mcpFace.start();
  console.error(
    `[mae-dts-flow-plugin] stdio MCP 面已启用(四件套+server_info, platform=${config.platform})`,
  );

  const pollTimer = setInterval(() => {
    void service.pollTickets().catch((error: unknown) => {
      console.error(`[mae-dts-flow-plugin] 轮询失败: ${error instanceof Error ? error.message : String(error)}`);
    });
  }, 60_000);
  pollTimer.unref?.();

  const shutdown = (): void => {
    clearInterval(pollTimer);
    mcpFace.dispose();
    process.exit(0);
  };
  // 会话结束=宿主关闭 stdin(连接生命周期);显式退出,不留孤儿轮询进程。
  process.stdin.once("close", shutdown);
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

async function textSelfInfo(service: Awaited<ReturnType<typeof createDtsFlowService>>): Promise<{
  content: Array<{ type: "text"; text: string }>;
}> {
  const summary = await service.configSummary();
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            server: "mae-dts-flow",
            employeeId: summary.employeeId,
            platform: summary.platform,
            mock: summary.mock,
            dataDir: summary.dataDir,
            issuesRoot: summary.issuesRoot,
            cloudBaseUrl: summary.cloudBaseUrl,
            cloudPlatformConfigured: summary.cloudBaseUrl !== null,
          },
          null,
          2,
        ),
      },
    ],
  };
}
