// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DtsListPage } from "@/mae/dts/DtsListPage.js";
import zhCN from "@/i18n/locales/zh-CN.js";
import enUS from "@/i18n/locales/en-US.js";

const mock = vi.hoisted(() => ({ locale: "zh-CN", fetchJson: vi.fn() }));
vi.mock("@/i18n/IntlProvider.js", () => ({
  useZCodeIntl: () => ({
    locale: mock.locale,
    intl: {
      formatMessage: ({ id }: { id: string }, values: Record<string, number | string> = {}) =>
        Object.entries(values).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), (mock.locale === "zh-CN" ? zhCN : enUS)[id] ?? id),
    },
  }),
}));

afterEach(cleanup);

const TICKETS = {
  mock: true,
  total: 1,
  actionableCount: 1,
  tickets: [
    {
      ticket: "DTS-2026-1008",
      title: "集群偶发 OOM",
      status: "开发人员实施修改",
      version: "V100R025C10SPC010B008",
      severity: "致命",
      submitter: "张三",
      featureName: "大数据平台",
      actionable: true,
    },
  ],
};

function routeFetch(postIssues: unknown): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/dts/tickets")) return new Response(JSON.stringify(TICKETS), { status: 200 });
    if (url.endsWith("/api/modules"))
      return new Response(JSON.stringify({ modules: [{ moduleName: "大数据平台", repos: ["https://r"] }] }), { status: 200 });
    if (url.endsWith("/api/issues") && init?.method === "POST")
      return new Response(
        JSON.stringify({ workspace: { workspacePath: "C:/ws/1008" }, openingBrief: "开场词" }),
        { status: 201 },
      );
    return new Response(JSON.stringify(postIssues), { status: 200 });
  }) as unknown as typeof fetch;
}

it.each(["zh-CN", "en-US"])("DTS列表页:发起→POST→开问题会话并切回聊天: %s", async (locale) => {
  mock.locale = locale;
  const fetchMock = vi.fn(routeFetch({}));
  vi.stubGlobal("fetch", fetchMock);
  const onIssueStarted = vi.fn();
  const onSwitchToChat = vi.fn();
  render(createElement(DtsListPage, { onIssueStarted, onSwitchToChat }));

  expect(await screen.findByText("DTS-2026-1008")).toBeDefined();
  fireEvent.click(screen.getByTestId("mae-dts-start"));

  const moduleSelect = await screen.findByTestId("mae-dts-start-module");
  fireEvent.change(moduleSelect, { target: { value: "大数据平台" } });
  fireEvent.click(screen.getByTestId("mae-dts-start-confirm"));

  await waitFor(() => expect(onIssueStarted).toHaveBeenCalledWith("C:/ws/1008", expect.stringContaining("开场词")));
  expect(onSwitchToChat).toHaveBeenCalled();
  const postCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith("/api/issues") && call[1]?.method === "POST");
  expect(postCall).toBeDefined();
  expect(JSON.parse(String(postCall?.[1]?.body))).toMatchObject({
    ticket: "DTS-2026-1008",
    module: "大数据平台",
    interventionTier: "align_first",
  });
});

it("服务未运行显示不可用态", async () => {
  mock.locale = "zh-CN";
  vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 }) as unknown as Response));
  render(createElement(DtsListPage, { onIssueStarted: vi.fn(), onSwitchToChat: vi.fn() }));
  expect(await screen.findByTestId("mae-dts-list-unavailable")).toBeDefined();
});
