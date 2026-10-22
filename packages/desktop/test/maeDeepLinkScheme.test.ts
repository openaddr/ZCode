import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MAE_DEEP_LINK_SCHEME } from "@zcode/shared/mae";
import {
  extractDeepLinkUrlFromArgs,
  isShareImportUrl,
  isWorkspaceOpenUrl,
} from "@desktop/main/desktopDeepLinkUrl";
import { createLinuxDeepLinkDesktopEntry } from "@desktop/main/desktopLinuxDeepLinkRegistration";
import { installFinderOpenFolderWorkflow } from "@desktop/main/desktopFinderOpenFolderWorkflow";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

// mae 深链接全链路防丢网(工单 #10,specs/mae/identity-isolation.md):
// 六消费方中 main 进程侧的协议校验必须收敛到 zcode-mae——官方 zcode:// 链接不得再被 mae 解析,
// 任一挂接在 rebase 中丢失回落官方 scheme,这里立即变红。
describe("mae deep link scheme 链路", () => {
  it("深链接 argv 解析接受 zcode-mae 工作区链接", () => {
    const url = `${MAE_DEEP_LINK_SCHEME}://workspace/open?path=${encodeURIComponent("C:\\Proj A&B")}`;
    expect(extractDeepLinkUrlFromArgs([url])).toBe(url);
    expect(isWorkspaceOpenUrl(new URL(url))).toBe(true);
  });

  it("官方 zcode:// 链接不匹配任何 mae 深链接路由", () => {
    const official = "zcode://workspace/open?path=%2Ftmp%2Fproj";
    expect(extractDeepLinkUrlFromArgs([official])).toBeNull();
    expect(isWorkspaceOpenUrl(new URL(official))).toBe(false);

    const officialShare = "zcode://share/import?code=abc_DEF-123";
    expect(isShareImportUrl(new URL(officialShare))).toBe(false);
  });

  it("zcode-mae 分享导入链接被识别", () => {
    const url = `${MAE_DEEP_LINK_SCHEME}://share/import?code=abc_DEF-123`;
    expect(isShareImportUrl(new URL(url))).toBe(true);
    expect(extractDeepLinkUrlFromArgs([url])).toBe(url);
  });

  it("Linux desktop entry 注册 zcode-mae scheme 且 desktop 文件名随 scheme 隔离", () => {
    const entry = createLinuxDeepLinkDesktopEntry({
      executablePath: "/opt/ZCode Mae/zcode-mae",
      productName: "ZCode Mae",
    });
    expect(entry).toContain(`MimeType=x-scheme-handler/${MAE_DEEP_LINK_SCHEME};`);
    expect(entry).not.toContain("x-scheme-handler/zcode;");
  });

  it("macOS Finder 打开文件夹工作流构造 zcode-mae 链接(隐蔽消费方,漏改静默失效)", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "mae-finder-deeplink-"));
    tempDirs.push(homeDir);

    installFinderOpenFolderWorkflow({
      platform: "darwin",
      locale: "zh-CN",
      homeDir,
      logger: { info: vi.fn(), warn: vi.fn() },
      refreshServicesIndex: vi.fn(),
    });

    const workflow = readFileSync(
      join(homeDir, "Library", "Services", "Open in ZCode.workflow", "Contents", "document.wflow"),
      "utf8",
    );
    // document.wflow 里的 shell 脚本经 XML 转义,引号呈 &quot; 形态。
    expect(workflow).toContain(
      `/usr/bin/open &quot;${MAE_DEEP_LINK_SCHEME}://workspace/open?path=`,
    );
    expect(workflow).not.toContain("&quot;zcode://workspace/open");
  });
});
