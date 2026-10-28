// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DtsIssueSessionsSection } from "@/mae/dts/DtsIssueSessionsSection.js";
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
vi.mock("@/mae/dts/useDtsIssues.js", () => ({
  dtsStageLabel: (stage: string) => ({ dts_info: "拉单", fix: "修复" })[stage] ?? stage,
  useDtsIssues: (options: { baseUrl?: string }) => mock.fetchJson(options),
}));

afterEach(cleanup);

const ISSUES = [
  {
    ticket: "DTS-2026-1008",
    stage: "fix",
    closedAt: null,
    archived: false,
    workspacePath: "C:/ws/DTS-2026-1008",
    createdAt: "2026-10-28T00:00:02Z",
  },
  {
    ticket: "DTS-2026-1002",
    stage: "mr_green",
    closedAt: "2026-10-28T01:00:00Z",
    archived: false,
    workspacePath: "C:/ws/DTS-2026-1002",
    createdAt: "2026-10-28T00:00:01Z",
  },
];

it.each(["zh-CN", "en-US"])("渲染进行中的问题会话分组并按单打开: %s", async (locale) => {
  mock.locale = locale;
  mock.fetchJson = vi.fn(() => ({ available: true, issues: ISSUES }));
  const onCreateIssueSession = vi.fn();
  render(createElement(DtsIssueSessionsSection, { onCreateIssueSession }));
  expect(await screen.findByTestId("mae-dts-issue-sessions")).toBeDefined();
  expect(screen.getByText("DTS-2026-1008")).toBeDefined();
  expect(screen.getByText("修复")).toBeDefined();
  fireEvent.click(screen.getByTestId("mae-dts-issue-DTS-2026-1008"));
  expect(onCreateIssueSession).toHaveBeenCalledWith(
    "C:/ws/DTS-2026-1008",
    expect.stringContaining("DTS-2026-1008"),
    "DTS-2026-1008",
  );
  await waitFor(() => expect(onCreateIssueSession).toHaveBeenCalledTimes(1));
});

it("服务未运行时不渲染分组", async () => {
  mock.locale = "zh-CN";
  mock.fetchJson = vi.fn(() => ({ available: false, issues: [] }));
  render(createElement(DtsIssueSessionsSection, { onCreateIssueSession: vi.fn() }));
  expect(screen.queryByTestId("mae-dts-issue-sessions")).toBeNull();
});
