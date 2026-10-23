import { homedir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFileSystemError } from "@zcode/contracts";
import type { FileSystemPort, TraceContext } from "@zcode/contracts";

const toPosix = (path: string) => path.replaceAll("\\", "/");

/**
 * mae 运行态写入重定位——user script workflow 分类根与按名解析根(#31,specs/mae D3)。
 *
 * 防丢网:mae 桌面 host 经 buildHostProcessEnv 注入 ZCODE_STORAGE_DIR(mae 数据根
 * ~/.zcode-mae/.zcode),bootstrap 侧 user workflow 的两处根(分类 + 按名解析)随 CLI
 * 存储轴落 mae 树;未注入(官方 CLI/官方桌面)保持上游 ~/.zcode/workflows 语义。
 * 挂接被 rebase 冲掉即红。
 */
describe("user script workflow 根的存储根环境变量挂接", () => {
  const originalStorageDir = process.env.ZCODE_STORAGE_DIR;

  beforeEach(() => {
    delete process.env.ZCODE_STORAGE_DIR;
  });

  afterEach(() => {
    if (originalStorageDir == null) {
      delete process.env.ZCODE_STORAGE_DIR;
    } else {
      process.env.ZCODE_STORAGE_DIR = originalStorageDir;
    }
  });

  describe("分类根(inferScriptWorkflowScope)", () => {
    it("ZCODE_STORAGE_DIR 已注入(mae 桌面 host)时 user 分类根随存储轴:<storage>/workflows", async () => {
      process.env.ZCODE_STORAGE_DIR = "/Users/mae-tester/.zcode-mae/.zcode";
      const { inferScriptWorkflowScope } = await import("../src/app/script-workflow-utils.js");

      expect(
        inferScriptWorkflowScope(
          join("/Users/mae-tester/.zcode-mae/.zcode", "workflows", "foo.workflow.js"),
          "/work",
        ),
      ).toBe("user");
      // 官方 ~/.zcode/workflows 下的脚本不再被误判为 user(落 mae 轴后是 explicit)。
      expect(
        inferScriptWorkflowScope(
          join(homedir(), ".zcode", "workflows", "foo.workflow.js"),
          "/work",
        ),
      ).toBe("explicit");
    });

    it("未注入(官方 CLI/官方桌面)时保持 ~/.zcode/workflows 分类语义", async () => {
      const { inferScriptWorkflowScope } = await import("../src/app/script-workflow-utils.js");

      expect(
        inferScriptWorkflowScope(
          join(homedir(), ".zcode", "workflows", "foo.workflow.js"),
          "/work",
        ),
      ).toBe("user");
      expect(
        inferScriptWorkflowScope(join("/work", ".zcode", "workflows", "foo.workflow.js"), "/work"),
      ).toBe("project");
      expect(inferScriptWorkflowScope("/elsewhere/foo.workflow.js", "/work")).toBe("explicit");
    });
  });

  describe("按名解析根(resolveNamedWorkflowPath 经 start 公共接口)", () => {
    const traceContext: TraceContext = { traceId: "trace-mae" };

    /** 记录 stat 探测序列的 fileSystemPort;所有候选都不命中,让 start 走到 Workflow not found。 */
    function makeProbingFileSystemPort(): { port: FileSystemPort; probed: string[] } {
      const probed: string[] = [];
      const port: FileSystemPort = {
        async stat() {
          throw createFileSystemError({ code: "not_found", message: "probe-only" });
        },
        // 其余方法按需补齐;本测试只走 stat 探测路径。
      } as unknown as FileSystemPort;
      const originalStat = port.stat.bind(port);
      port.stat = async (request: { path: string }) => {
        probed.push(request.path);
        return originalStat(request as never);
      };
      return { port, probed };
    }

    async function startNamedWorkflow(
      port: FileSystemPort,
      name: string,
    ): Promise<unknown> {
      const { createScriptWorkflowToolPort } = await import(
        "../src/app/script-workflow-tool-port.js"
      );
      const workflowPort = createScriptWorkflowToolPort({
        fileSystemPort: port,
        getRuntime: () => {
          throw new Error("runtime must not be reached in probe tests");
        },
        sessionId: "session-mae",
        sessionStore: {},
        storageRoot: "/storage-root",
        traceContext,
        workingDirectory: "/work",
      });
      return workflowPort.start({ name, trace: traceContext, workingDirectory: "/work" });
    }

    it("ZCODE_STORAGE_DIR 已注入(mae 桌面 host)时候选根落 mae 树,不探测官方 ~/.zcode/workflows", async () => {
      process.env.ZCODE_STORAGE_DIR = "/Users/mae-tester/.zcode-mae/.zcode";
      const { port, probed } = makeProbingFileSystemPort();

      await expect(startNamedWorkflow(port, "foo")).rejects.toThrow("Workflow not found: foo");
      const probedPosix = probed.map(toPosix);
      expect(probedPosix).toContain("/work/.zcode/workflows/foo.workflow.js");
      expect(probedPosix).toContain("/Users/mae-tester/.zcode-mae/.zcode/workflows/foo.workflow.js");
      expect(
        probedPosix.includes(toPosix(join(homedir(), ".zcode", "workflows", "foo.workflow.js"))),
      ).toBe(false);
    });

    it("未注入(官方 CLI/官方桌面)时候选根保持 ~/.zcode/workflows", async () => {
      const { port, probed } = makeProbingFileSystemPort();

      await expect(startNamedWorkflow(port, "foo")).rejects.toThrow("Workflow not found: foo");
      expect(probed.map(toPosix)).toContain(
        toPosix(join(homedir(), ".zcode", "workflows", "foo.workflow.js")),
      );
    });
  });
});
