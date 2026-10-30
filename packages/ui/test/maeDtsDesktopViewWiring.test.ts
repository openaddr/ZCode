// mae 机械防漏门禁:WorkspaceShellLayout 里同一条视图 ternary 存在两份拷贝
// (renderRemoteShell 的 chatContent 拷贝 + 桌面 wideContent 拷贝)。
// #55 实锤:dts 分支插进远控壳拷贝,typecheck/组件测试全绿但桌面点击无响应。
// 本测试锚定「dts 分支必须落在桌面 wideContent 拷贝」这一事实,插错位置立即红灯。
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { describe } from "vitest";

const layoutSource = readFileSync(
  new URL("../src/app-shell/WorkspaceShellLayout.tsx", import.meta.url),
  "utf8",
);

function occurrences(needle: string): number[] {
  const out: number[] = [];
  let i = layoutSource.indexOf(needle);
  while (i !== -1) {
    out.push(i);
    i = layoutSource.indexOf(needle, i + 1);
  }
  return out;
}

describe("mae DTS 桌面视图接线门禁", () => {
  it("dts 分支必须插在桌面 wideContent 拷贝(第二份 automations 与 plugin-store 之间)", () => {
    const dts = occurrences('workspaceMainView === "dts"');
    // 既有四处:两处返回键判断 + 侧栏 active + 桌面视图分支;新增用法须显式更新本断言。
    expect(dts).toHaveLength(4);

    const automations = occurrences('workspaceMainView === "automations"');
    const pluginStore = occurrences('workspaceMainView === "plugin-store"');
    // 远控壳 chatContent 与桌面 wideContent 各持一份 automations/plugin-store。
    expect(automations.length).toBeGreaterThanOrEqual(2);
    expect(pluginStore.length).toBeGreaterThanOrEqual(2);

    const ternaryDts = dts[dts.length - 1];
    expect(ternaryDts).toBeGreaterThan(automations[automations.length - 1]);
    expect(ternaryDts).toBeLessThan(pluginStore[pluginStore.length - 1]);
  });

  it("远控壳 chatContent 拷贝不插 dts 分支(mae 禁远控 D7)", () => {
    const firstAutomations = occurrences('workspaceMainView === "automations"')[0];
    const firstPluginStore = occurrences('workspaceMainView === "plugin-store"')[0];
    const dtsInRemoteCopy = occurrences('workspaceMainView === "dts"').filter(
      (i) => i > firstAutomations && i < firstPluginStore,
    );
    expect(dtsInRemoteCopy).toEqual([]);
  });

  it("桌面分支渲染 DtsListPage 并接发起/切回回调", () => {
    const branchStart = layoutSource.indexOf('workspaceMainView === "dts" && !isWebRemoteControlShell');
    expect(branchStart).toBeGreaterThan(-1);
    const branchEnd = layoutSource.indexOf('workspaceMainView === "plugin-store" && !isWebRemoteControlShell', branchStart);
    const branch = layoutSource.slice(branchStart, branchEnd);
    expect(branch).toContain("<DtsListPage");
    expect(branch).toContain("onIssueStarted={handleCreateDtsIssueSession}");
    expect(branch).toContain("onSwitchToChat={showChatMainView}");
  });
});
