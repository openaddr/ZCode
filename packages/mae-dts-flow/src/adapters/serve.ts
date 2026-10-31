import { mkdir, stat } from "node:fs/promises";

import { createDtsFlowService } from "./serviceFactory.js";
import type { DtsFlowService } from "../app/service.js";
import { defaultConfigPath, loadConfig } from "./configLoader.js";
import { startHttpFace } from "./http.js";
import { SERVER_INFO_TOOL, createMcpStdioFace, type McpFaceHandlers } from "./mcpStdio.js";
import { buildFlowToolHandlers } from "./mcpTools.js";

interface ServeArgs {
  config?: string;
  port?: number;
  stdio: boolean;
  mock: boolean;
}

function parseArgs(argv: readonly string[]): ServeArgs {
  const args: ServeArgs = { stdio: false, mock: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--stdio") {
      args.stdio = true;
    } else if (arg === "--mock") {
      args.mock = true;
    } else if (arg === "--config" || arg === "--port") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`${arg} 需要参数`);
      }
      if (arg === "--config") {
        args.config = value;
      } else {
        args.port = Number.parseInt(value, 10);
        if (!Number.isInteger(args.port)) throw new Error(`--port 非法: ${value}`);
      }
      index += 1;
    } else {
      throw new Error(`未知参数: ${String(arg)}`);
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  // 无 --config 时探缺省配置文件(设置分区「DTS 问题流」的落盘位置,#63);不存在=全缺省启动。
  const configPath = args.config ?? (await stat(defaultConfigPath()).then(() => defaultConfigPath(), () => undefined));
  const config = await loadConfig({ configPath });
  if (args.mock) config.mock = true;
  await mkdir(config.dataDir, { recursive: true });

  const selfServePath = new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  // 打包态自启(dist 产物,由 electron 充当 node):不要 --import tsx(包不在场),
  // 且 MCP 面以 ELECTRON_RUN_AS_NODE=1 拉起,否则 electron 裸壳会作为第二实例退出(#69 E2E 发现)。
  const isBundled = /[\\/]dist[\\/]/.test(selfServePath);
  const selfArgs = isBundled ? [selfServePath, "--stdio"] : ["--import", "tsx", selfServePath, "--stdio"];
  if (args.config !== undefined) selfArgs.push("--config", args.config);
  const service = createDtsFlowService(config, {
    fetch,
    selfLauncher: {
      command: process.execPath,
      args: selfArgs,
      ...(isBundled ? { env: { ELECTRON_RUN_AS_NODE: "1" } } : {}),
    },
  });
  // stdio 面独占进程,不再起 HTTP 面:桌面常驻进程已监听配置端口,stdio 子进程再抢必
  // EADDRINUSE 自杀(打包态首跑发现);台账是文件原子写,双进程经同一份落盘状态收敛。
  const face = args.stdio ? null : await startHttpFace(service, { port: args.port ?? config.httpPort });
  if (face) {
    // 日志只走 stderr:--stdio 时 stdout 是 MCP 协议通道,任何非协议字节都会打断会话客户端。
    console.error(`[mae-dts-flow] HTTP 面 http://127.0.0.1:${face.port} (mock=${String(config.mock)}, 工号=${config.employeeId})`);
  }

  if (args.stdio) {
    const handlers: McpFaceHandlers = (() => {
      const flow = buildFlowToolHandlers(service);
      return {
        listTools: () => [SERVER_INFO_TOOL, ...flow.listTools()],
        callTool: async (name, args_) => (name === SERVER_INFO_TOOL.name ? textSelfInfo(service) : flow.callTool(name, args_)),
      };
    })();
    const mcpFace = createMcpStdioFace(handlers, {
      input: process.stdin,
      output: process.stdout,
      serverInfo: { name: "mae-dts-flow", version: "0.1.0" },
    });
    mcpFace.start();
    console.error("[mae-dts-flow] stdio MCP 面已启用(四件套工具已注册)");
  }

  const pollTimer = setInterval(() => {
    void service.pollTickets().catch((error: unknown) => {
      console.error(`[mae-dts-flow] 轮询失败: ${error instanceof Error ? error.message : String(error)}`);
    });
  }, 60_000);
  pollTimer.unref?.();

  const shutdown = (): void => {
    console.error("[mae-dts-flow] 收到退出信号,关闭服务");
    clearInterval(pollTimer);
    void (face ? face.close() : Promise.resolve()).then(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  console.error(`[mae-dts-flow] 启动失败: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
});

async function textSelfInfo(service: DtsFlowService): Promise<{
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
