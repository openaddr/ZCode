// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DtsListPage } from "@/mae/dts/DtsListPage.js";
import zhCN from "@/i18n/locales/zh-CN.js";
import enUS from "@/i18n/locales/en-US.js";

const mock = vi.hoisted(() => ({ locale: "zh-CN" }));
vi.mock("@/i18n/IntlProvider.js", () => ({
  useZCodeIntl: () => ({
    locale: mock.locale,
    intl: {
      formatMessage: ({ id }: { id: string }, values: Record<string, number | string> = {}) =>
        Object.entries(values).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), (mock.locale === "zh-CN" ? zhCN : enUS)[id] ?? id),
    },
  }),
}));

afterEach(() => {
  cleanup();
  globalThis.localStorage.clear();
});

const TICKETS = [
  { ticket: "DTS-2026-1002", title: "登录态掉线", status: "开发人员实施修改", version: "V100R026C10", severity: "一般", submitter: "李四", url: "https://dts.mock/t/1002", branch: null, moduleId: "module-web" },
  { ticket: "DTS-2026-1004", title: "报表错位", status: "开发人员实施修改", version: "V100R026C10", severity: "严重", submitter: "张三", url: "https://dts.mock/t/1004", branch: "master", moduleId: null },
  { ticket: "DTS-2026-1005", title: "重复提交", status: "开发人员实施修改", version: "V100R026C10", severity: "一般", submitter: "赵六", url: "", branch: null, moduleId: "module-web" },
  { ticket: "DTS-2026-1008", title: "集群 OOM", status: "开发人员实施修改", version: "V100R026C10", severity: "致命", submitter: "赵六", url: "https://dts.mock/t/1008", branch: "master", moduleId: "module-bigdata" },
  { ticket: "DTS-2026-1009", title: "定时任务双跑", status: "开发人员实施修改", version: "V100R026C10", severity: "严重", submitter: "张三", url: "https://dts.mock/t/1009", branch: "master", moduleId: "module-sched" },
  { ticket: "DTS-2026-1010", title: "告警重发", status: "开发人员实施修改", version: "V100R026C10", severity: "一般", submitter: "李四", url: "https://dts.mock/t/1010", branch: "master", moduleId: "module-alarm" },
];

const ISSUES = {
  issues: [
    { ticket: "DTS-2026-1008", workspacePath: "C:/ws/1008", closedAt: null, archived: false },
    { ticket: "DTS-2026-1005", workspacePath: "C:/ws/1005", closedAt: null, archived: false },
  ],
};

function routeFetch(overrides: Record<string, { status: number; body: unknown }> = {}): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    for (const [prefix, override] of Object.entries(overrides)) {
      if (url.includes(prefix)) return new Response(JSON.stringify(override.body), { status: override.status });
    }
    if (url.endsWith("/api/health")) return new Response(JSON.stringify({ ok: true, mock: true, employeeId: "dev" }), { status: 200 });
    if (url.includes("/api/dts/tickets?owner=")) {
      return new Response(JSON.stringify({ mock: true, total: TICKETS.length, actionableCount: 4, tickets: TICKETS }), { status: 200 });
    }
    if (url.includes("/api/dts/tickets/")) {
      const no = url.split("/").pop() ?? "";
      const found = TICKETS.find((ticket) => ticket.ticket === no);
      return found
        ? new Response(JSON.stringify({ ...found, description: "全文" }), { status: 200 })
        : new Response(JSON.stringify({ error: "查无此单" }), { status: 404 });
    }
    if (url.endsWith("/api/issues") && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as { ticket: string };
      return new Response(JSON.stringify({ ledger: {}, workspace: { workspacePath: `C:/ws/${body.ticket}` }, openingBrief: "开场词" }), { status: 201 });
    }
    if (url.endsWith("/api/issues")) return new Response(JSON.stringify(ISSUES), { status: 200 });
    if (url.endsWith("/api/modules")) {
      return new Response(JSON.stringify({ modules: [
        { id: "module-web", name: "Web 前端", repositories: ["https://r/web.git"] },
        { id: "module-bigdata", name: "大数据平台", repositories: ["https://r/bigdata.git"] },
        { id: "module-report", name: "报表中心", repositories: [] },
      ] }), { status: 200 });
    }
    if (url.endsWith("/api/dts/people")) {
      return new Response(JSON.stringify({ people: [{ username: "dev", displayName: "开发员" }, { username: "zhangsan", displayName: "张三" }] }), { status: 200 });
    }
    if (url.includes("/api/dts/bindings/")) return new Response(JSON.stringify({ ok: true }), { status: 200 });
    if (url.endsWith("/api/dts/bindings")) return new Response(JSON.stringify({ bindings: {} }), { status: 200 });
    return new Response(JSON.stringify({ error: "未知路由" }), { status: 404 });
  }) as unknown as typeof fetch;
}

function renderBoard(overrides: Record<string, { status: number; body: unknown }> = {}) {
  const fetchMock = vi.fn(routeFetch(overrides));
  vi.stubGlobal("fetch", fetchMock);
  const onIssueStarted = vi.fn();
  const onSwitchToChat = vi.fn();
  const onOpenIssueSession = vi.fn();
  render(
    createElement(DtsListPage, {
      onIssueStarted,
      onSwitchToChat,
      onOpenIssueSession,
    }),
  );
  return { fetchMock, onIssueStarted, onSwitchToChat, onOpenIssueSession };
}

function rowCheckbox(ticket: string): HTMLButtonElement {
  const cell = screen.getByText(ticket).closest("td");
  return cell?.previousElementSibling?.querySelector("button") as HTMLButtonElement;
}

/** 默认只看未发起;勾上「已发起(发起状态列头过滤)」让进行中行现形。 */
async function showLaunched() {
  fireEvent.click(screen.getByLabelText("发起状态 过滤"));
  fireEvent.click(await screen.findByTestId("mae-dts-show-launched"));
  await screen.findByTestId("mae-dts-show-launched");
}

it("看板:七列渲染,发起状态区分进行中/未发起;级别与 DTS 状态列不存在;单号外链", async () => {
  renderBoard();
  expect(await screen.findByTestId("mae-dts-list")).toBeDefined();
  await screen.findByText("DTS-2026-1002");
  await showLaunched();
  await screen.findByText("DTS-2026-1008");
  expect(screen.getByText("标题")).toBeDefined();
  expect(screen.getByText("发起状态")).toBeDefined();
  expect(screen.getByText("所属模块")).toBeDefined();
  expect(screen.getByText("介入档位")).toBeDefined();
  expect(screen.queryByText("级别")).toBeNull();
  expect(screen.queryByText("状态")).toBeNull();
  expect(screen.getAllByText("进行中")).toHaveLength(2);
  expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
  const link = screen.getByText("DTS-2026-1002").closest("a");
  expect(link?.getAttribute("href")).toBe("https://dts.mock/t/1002");
});

it("勾选禁用规则:进行中/无分支/无模块的行禁勾;全选只勾可勾行", async () => {
  renderBoard();
  await screen.findByText("DTS-2026-1002");
  await showLaunched();
  await screen.findByText("DTS-2026-1008");
  expect(rowCheckbox("DTS-2026-1002").disabled).toBe(true);
  expect(rowCheckbox("DTS-2026-1004").disabled).toBe(true);
  expect(rowCheckbox("DTS-2026-1005").disabled).toBe(true);
  expect(rowCheckbox("DTS-2026-1008").disabled).toBe(true);
  expect(rowCheckbox("DTS-2026-1009").disabled).toBe(false);
  expect(rowCheckbox("DTS-2026-1010").disabled).toBe(false);
  fireEvent.click(screen.getByTestId("mae-dts-select-all"));
  await waitFor(() => expect(rowCheckbox("DTS-2026-1009").getAttribute("aria-checked")).toBe("true"));
  expect(rowCheckbox("DTS-2026-1010").getAttribute("aria-checked")).toBe("true");
  expect(rowCheckbox("DTS-2026-1002").getAttribute("aria-checked")).toBe("false");
});

it("版本组默认勾选最高组;未映射红条列组名", async () => {
  renderBoard();
  await screen.findByText("DTS-2026-1002");
  // 默认视图:只看未发起 ∩ 默认勾选组 V100R026C10 → 1002(无分支)在列 → 红条列组名
  expect(screen.getByTestId("mae-dts-unmapped-banner")).toBeDefined();
  expect(screen.getByTestId("mae-dts-unmapped-banner").textContent).toContain("V100R026C10");
  expect(screen.getByTestId("mae-dts-version-filter").textContent).toContain("V100R026C10");
});

it("批量发起:逐张 POST,成功切聊天并开草稿,失败保勾选", async () => {
  const fetchMock = vi.fn((async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/issues") && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as { ticket: string };
      if (body.ticket === "DTS-2026-1010") {
        return new Response(JSON.stringify({ error: "版本未配置分支" }), { status: 400 });
      }
      return new Response(JSON.stringify({ ledger: {}, workspace: { workspacePath: `C:/ws/${body.ticket}` }, openingBrief: "开场词" }), { status: 201 });
    }
    return routeFetch()(input, init);
  }) as unknown as typeof fetch);
  vi.stubGlobal("fetch", fetchMock);
  const onIssueStarted = vi.fn();
  const onSwitchToChat = vi.fn();
  render(createElement(DtsListPage, { onIssueStarted, onSwitchToChat }));
  await screen.findByText("DTS-2026-1002");

  fireEvent.click(rowCheckbox("DTS-2026-1009"));
  fireEvent.click(rowCheckbox("DTS-2026-1010"));
  fireEvent.click(screen.getByTestId("mae-dts-start"));

  await waitFor(() => expect(onSwitchToChat).toHaveBeenCalledTimes(1));
  expect(onIssueStarted).toHaveBeenCalledTimes(1);
  expect(onIssueStarted.mock.calls[0]?.[0]).toBe("C:/ws/DTS-2026-1009");
  // 失败单保留勾选,成功单移出勾选
  expect(rowCheckbox("DTS-2026-1010").getAttribute("aria-checked")).toBe("true");
  expect(rowCheckbox("DTS-2026-1009").getAttribute("aria-checked")).toBe("false");
});

it("附加信息行内编辑:保存进 localStorage 草稿", async () => {
  renderBoard();
  await screen.findByText("DTS-2026-1002");
  fireEvent.click(screen.getByLabelText("DTS-2026-1002 附加信息"));
  const input = await screen.findByTestId("mae-dts-remark-input");
  fireEvent.change(input, { target: { value: "复现步骤:见描述" } });
  fireEvent.click(screen.getByTestId("mae-dts-remark-save"));
  await waitFor(() => expect(screen.getByText("复现步骤:见描述")).toBeDefined());
  expect(globalThis.localStorage.getItem("mae-dts-board-remarks-v1")).toContain("复现步骤");
});

it("发起状态徽标点击:回调带回进行中会话的 workspacePath", async () => {
  const { onOpenIssueSession } = renderBoard();
  await showLaunched();
  await screen.findByText("DTS-2026-1008");
  const row = screen.getByText("DTS-2026-1008").closest("tr");
  const badge = Array.from(row?.querySelectorAll("button") ?? []).find((button) => button.textContent?.includes("进行中"));
  expect(badge).not.toBeUndefined();
  fireEvent.click(badge as Element);
  expect(onOpenIssueSession).toHaveBeenCalledWith("C:/ws/1008");
});

it("401 降级:整页 unavailable + 错误详情指向平台放行", async () => {
  renderBoard({ "/api/dts/tickets?owner=": { status: 401, body: { error: "免登录允许清单未放行,等待 yunine9/mae-flow-cloud#566" } } });
  const banner = await screen.findByTestId("mae-dts-list-unavailable");
  expect(banner.textContent).toContain("#566");
});
