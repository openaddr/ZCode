import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 编译期常量 ZCODE_PRODUCT_FLAVOR 决定 Linux 图标名;沿用 mae-data-root.test.ts 的
// 可切换持有者模式,本文件固定 mae(fork 默认身份)。
const productFlavorMock = { value: "mae" as string };

vi.mock("@zcode/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@zcode/shared")>();
  return {
    ...actual,
    get ZCODE_PRODUCT_FLAVOR() {
      return productFlavorMock.value;
    },
  };
});

const { createLinuxDeepLinkDesktopEntry } = await import(
  "../src/main/desktopLinuxDeepLinkRegistration.js"
);
const { installLinuxAppImageDesktopIcon } = await import("../src/main/desktopLinuxAppImageIcon.js");

describe("mae Linux 图标名路由(#12 收口 #10 登记遗留)", () => {
  it("mae 身份下 desktop entry 默认 Icon=zcode-mae(与官方 hicolor zcode.png 解耦)", () => {
    const entry = createLinuxDeepLinkDesktopEntry({ executablePath: "/opt/ZCode Mae/zcode-mae" });
    expect(entry).toContain("Icon=zcode-mae");
    expect(entry).not.toContain("Icon=zcode\n");
  });

  it("mae 身份下 AppImage 用户级 hicolor 图标落 zcode-mae.png", async () => {
    const root = await mkdtemp(join(tmpdir(), "mae-linux-icon-test-"));
    try {
      const source = join(root, "source.png");
      // 1x1 透明 PNG,内容不重要,只验证安装路径命名。
      await writeFile(
        source,
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
          "base64",
        ),
      );
      const logger = { info: () => undefined, warn: () => undefined };
      const result = installLinuxAppImageDesktopIcon({
        dataDir: join(root, "data"),
        iconSourcePath: source,
        logger,
        // 免去 gtk-update-icon-cache 依赖。
        runCommand: () => ({ status: 0, stdout: "", stderr: "" }),
      });
      expect(result.iconFilePath).toContain(join("apps", "zcode-mae.png"));
      expect(result.installed).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
