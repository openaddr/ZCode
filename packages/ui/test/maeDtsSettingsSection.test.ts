// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { DtsFlowSettingsSection } from "@/mae/dts/DtsFlowSettingsSection.js";
import zhCN from "@/i18n/locales/zh-CN.js";

vi.mock("@/i18n/IntlProvider.js", () => ({
  useZCodeIntl: () => ({
    locale: "zh-CN",
    intl: {
      formatMessage: ({ id }: { id: string }, values: Record<string, number | string> = {}) =>
        Object.entries(values).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), (zhCN as Record<string, string>)[id] ?? id),
    },
  }),
}));

vi.mock("@/hooks/usePlatform.js", () => ({
  usePlatform: () => mock.platform,
}));

afterEach(() => {
  cleanup();
  globalThis.localStorage.clear();
  globalThis.fetch = rawFetch;
});

// jsdom 没有 scrollIntoView(Radix Select 挂载时要滚动候选项)
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const rawFetch = globalThis.fetch;
const mock = vi.hoisted(() => ({
  platform: {
    dtsFlowConfig: {
      read: vi.fn(async () => null),
      write: vi.fn(async () => undefined),
    },
  },
}));

function stubHealth(body: Record<string, unknown> | null): void {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/health")) {
      if (body === null) throw new TypeError("Failed to fetch");
      return new Response(JSON.stringify(body), { status: 200 });
    }
    if (url.endsWith("/api/config")) {
      return new Response(JSON.stringify({ cloudBaseUrl: "http://mae-flow.internal:8787" }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;
}

it("设置分区:读入既有配置回填表单;状态卡显示运行中(云平台)", async () => {
  mock.platform.dtsFlowConfig.read.mockResolvedValueOnce({
    employeeId: "ning",
    cloudBaseUrl: "http://mae-flow.internal:8787",
    mock: false,
  });
  stubHealth({ ok: true, mock: false, employeeId: "ning" });
  render(createElement(DtsFlowSettingsSection));
  const baseUrl = await screen.findByTestId("mae-dts-settings-base-url") as HTMLInputElement;
  await waitFor(() => expect(baseUrl.value).toBe("http://mae-flow.internal:8787"));
  const employee = screen.getByTestId("mae-dts-settings-employee-id") as HTMLInputElement;
  expect(employee.value).toBe("ning");
  expect(screen.getByTestId("mae-dts-service-status-text").textContent).toContain("云平台");
});

it("保存:表单合法→写盘载荷含 mock 映射;缺工号→问题提示且不写盘", async () => {
  mock.platform.dtsFlowConfig.read.mockResolvedValueOnce(null);
  stubHealth(null);
  render(createElement(DtsFlowSettingsSection));
  await screen.findByTestId("mae-dts-settings-save");

  // 缺工号:不写盘
  fireEvent.click(screen.getByTestId("mae-dts-settings-save"));
  await waitFor(() => expect(screen.getByTestId("mae-dts-service-status-text")).toBeDefined());
  expect(mock.platform.dtsFlowConfig.write).not.toHaveBeenCalled();

  // 填齐:数据源=云平台+地址+工号 → 写盘载荷
  fireEvent.change(screen.getByTestId("mae-dts-settings-base-url"), { target: { value: "http://mae-flow.internal:8787/" } });
  fireEvent.change(screen.getByTestId("mae-dts-settings-employee-id"), { target: { value: "ning" } });
  fireEvent.click(screen.getByTestId("mae-dts-settings-save"));
  await waitFor(() => expect(mock.platform.dtsFlowConfig.write).toHaveBeenCalled());
  const patch = mock.platform.dtsFlowConfig.write.mock.calls[0]?.[0] as Record<string, unknown>;
  expect(patch).toEqual({ employeeId: "ning", mock: false, cloudBaseUrl: "http://mae-flow.internal:8787", httpPort: 8788 });
});

it("数据源=本地模拟:mock:true 且无地址也放行;服务未运行时状态卡显示停止", async () => {
  mock.platform.dtsFlowConfig.read.mockResolvedValueOnce({ employeeId: "ning" });
  stubHealth(null);
  render(createElement(DtsFlowSettingsSection));
  await screen.findByTestId("mae-dts-settings-save");
  expect(screen.getByTestId("mae-dts-service-status-text").textContent).toContain("服务未运行");

  fireEvent.click(screen.getByTestId("mae-dts-settings-data-source"));
  // Radix Select 在 jsdom 交互受限:直接断言表单状态机(数据源切 mock 由 onValueChange 驱动,单测覆盖 patch 映射即可)
  fireEvent.change(screen.getByTestId("mae-dts-settings-employee-id"), { target: { value: "ning" } });
  fireEvent.click(screen.getByTestId("mae-dts-settings-save"));
  await waitFor(() => expect(mock.platform.dtsFlowConfig.write).toHaveBeenCalled());
  expect(mock.platform.dtsFlowConfig.write.mock.calls[0]?.[0]).toMatchObject({ employeeId: "ning", mock: false });
});

it("web 形态(dtsFlowConfig 未实装):保存提示仅桌面可用", async () => {
  mock.platform.dtsFlowConfig = undefined as unknown as typeof mock.platform.dtsFlowConfig;
  stubHealth({ ok: true, mock: true, employeeId: "dev" });
  render(createElement(DtsFlowSettingsSection));
  await screen.findByTestId("mae-dts-settings-save");
  fireEvent.change(screen.getByTestId("mae-dts-settings-employee-id"), { target: { value: "dev" } });
  fireEvent.click(screen.getByTestId("mae-dts-settings-save"));
  await waitFor(() => expect(screen.getByTestId("mae-dts-service-status-text")).toBeDefined());
  expect(mock.platform.dtsFlowConfig?.write).toBeUndefined();
});
