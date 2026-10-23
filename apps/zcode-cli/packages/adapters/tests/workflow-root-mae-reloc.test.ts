import { homedir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * mae 运行态写入重定位——动态工作流默认根(#24,specs/mae/README.md D3)。
 *
 * 防丢网:mae 桌面 host 经 buildHostProcessEnv 注入 ZCODE_STORAGE_DIR(mae 数据根
 * ~/.zcode-mae/.zcode),Agent 侧 workflow 模块的默认根随 CLI 存储轴落 mae 树;
 * 未注入(官方 CLI/官方桌面)保持上游 ~/.zcode/cli/workflows 语义。
 */
describe("workflow 默认根的存储根环境变量挂接", () => {
  const originalStorageDir = process.env.ZCODE_STORAGE_DIR;

  // vi.resetModules 后的首次动态导入在 Windows 上要付整条模块图的转译成本,放宽本组时限。
  const TEST_TIMEOUT_MS = 30_000;

  afterEach(() => {
    if (originalStorageDir == null) {
      delete process.env.ZCODE_STORAGE_DIR;
    } else {
      process.env.ZCODE_STORAGE_DIR = originalStorageDir;
    }
    vi.resetModules();
  });

  it(
    "ZCODE_STORAGE_DIR 已注入(mae 桌面 host)时默认根随存储轴:<storage>/cli/workflows",
    { timeout: TEST_TIMEOUT_MS },
    async () => {
      process.env.ZCODE_STORAGE_DIR = "/Users/mae-tester/.zcode-mae/.zcode";
      vi.resetModules();
      const { getDefaultWorkflowRoot, getDefaultWorkflowDefinitionsRoot } = await import(
        "../src/workflow/index.js"
      );

      expect(getDefaultWorkflowRoot()).toBe(
        join("/Users/mae-tester/.zcode-mae/.zcode", "cli", "workflows"),
      );
      expect(getDefaultWorkflowDefinitionsRoot()).toBe(
        join("/Users/mae-tester/.zcode-mae/.zcode", "cli", "workflows", "definitions"),
      );
    },
  );

  it(
    "空白 ZCODE_STORAGE_DIR 视为未注入,保持 ~/.zcode/cli/workflows",
    { timeout: TEST_TIMEOUT_MS },
    async () => {
      process.env.ZCODE_STORAGE_DIR = "   ";
      vi.resetModules();
      const { getDefaultWorkflowRoot } = await import("../src/workflow/index.js");

      expect(getDefaultWorkflowRoot()).toBe(join(homedir(), ".zcode", "cli", "workflows"));
    },
  );

  it(
    "未注入(官方 CLI/官方桌面)保留上游默认根 ~/.zcode/cli/workflows",
    { timeout: TEST_TIMEOUT_MS },
    async () => {
      delete process.env.ZCODE_STORAGE_DIR;
      vi.resetModules();
      const { getDefaultWorkflowRoot } = await import("../src/workflow/index.js");

      expect(getDefaultWorkflowRoot()).toBe(join(homedir(), ".zcode", "cli", "workflows"));
    },
  );
});
