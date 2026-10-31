// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DtsStageSection, deriveTicketFromWorkspacePath } from "@/mae/dts/DtsStageSection.js";
import zhCN from "@/i18n/locales/zh-CN.js";
import enUS from "@/i18n/locales/en-US.js";

const mock = vi.hoisted(() => ({ locale: "zh-CN", fetchJson: vi.fn() }));
vi.mock("@/i18n/IntlProvider.js", () => ({
  useZCodeIntl: () => ({
    locale: mock.locale,
    intl: {
      formatMessage: ({ id }: { id: string }) => (mock.locale === "zh-CN" ? zhCN : enUS)[id] ?? id,
    },
  }),
}));

afterEach(cleanup);

const LEDGER_WAITING = {
  ticket: "DTS-2026-1008",
  stage: "analyze",
  stages: { dts_info: "done", prep_repo: "done", analyze: "in_progress", fix: "pending", mr_green: "pending" },
  analysisGate: { status: "waiting", askedAt: "t", answeredAt: null },
  closedAt: null,
  archived: false,
};

it.each(["zh-CN", "en-US"])("阶段条投影+闸确认按钮 POST: %s", async (locale) => {
  mock.locale = locale;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    if (String(input).endsWith("/api/issues/DTS-2026-1008"))
      return new Response(JSON.stringify(LEDGER_WAITING), { status: 200 });
    if (String(input).endsWith("/analysis-gate"))
      return new Response(JSON.stringify({ stage: "fix", gate: { status: "confirmed" } }), { status: 200 });
    return new Response("{}", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);

  render(
    createElement(DtsStageSection, {
      workspacePath: "C:/Users/x/.zcode-mae/dts-issues/DTS-2026-1008",
      separated: true,
    }),
  );
  expect(await screen.findByTestId("mae-dts-stage")).toBeDefined();
  expect(screen.getByText("修复")).toBeDefined();
  fireEvent.click(screen.getByTestId("mae-dts-gate-confirm"));
  await waitFor(() =>
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith("/analysis-gate") && call[1]?.method === "POST")).toBe(true),
  );
});

it("非问题工作区(目录名非单号形态)不渲染不轮询", async () => {
  expect(deriveTicketFromWorkspacePath("C:/repo/mae")).toBeNull();
  expect(deriveTicketFromWorkspacePath("C:/repo/DTS-2026-1008")).toBe("DTS-2026-1008");
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  render(createElement(DtsStageSection, { workspacePath: "C:/repo/mae" }));
  expect(screen.queryByTestId("mae-dts-stage")).toBeNull();
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(fetchMock).not.toHaveBeenCalled();
});

const senderMock = vi.hoisted(() => ({ sender: vi.fn(async () => ({ ok: true as const, sessionId: "s1" })) }));
vi.mock("@/mae/dts/useDtsIssueLauncher.js", () => ({
  useDtsIssueSessionSender: () => senderMock.sender,
}));

it.each([true, false])("闸裁决后代发续聊词泵起 Agent(确认=%s): 云平台同语义 #68", async (confirm) => {
  mock.locale = "zh-CN";
  senderMock.sender.mockClear();
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    if (String(input).endsWith("/api/issues/DTS-2026-1008"))
      return new Response(JSON.stringify(LEDGER_WAITING), { status: 200 });
    if (String(input).endsWith("/analysis-gate"))
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    return new Response("{}", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);

  render(
    createElement(DtsStageSection, {
      workspacePath: "C:/Users/x/.zcode-mae/dts-issues/DTS-2026-1008",
      separated: true,
    }),
  );
  fireEvent.click(await screen.findByTestId("mae-dts-stage"));
  if (!confirm) {
    fireEvent.click(screen.getByText("打回"));
  } else {
    fireEvent.click(screen.getByText("确认,进入修复"));
  }
  await waitFor(() => expect(senderMock.sender).toHaveBeenCalledTimes(1));
  expect(senderMock.sender).toHaveBeenCalledWith(
    "C:/Users/x/.zcode-mae/dts-issues/DTS-2026-1008",
    confirm ? "分析报告已确认放行,请继续执行修复阶段" : "分析报告被打回,请按闸结果修订后重新提交分析",
  );
});
