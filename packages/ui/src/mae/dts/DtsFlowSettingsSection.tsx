/**
 * mae: 设置分区「DTS 问题流」——云平台地址/工号/数据源连接配置(票 D,openaddr/ZCode#63)。
 * 保存写缺省配置文件 ~/.zcode-mae/dts-flow/config.json(经桌面 IPC);服务状态卡实时探测。
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.js";
import { toast } from "@/components/ui/toast.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { cn } from "@/components/lib/utils.js";
import { DEFAULT_DTS_SERVICE_BASE } from "./useDtsIssues.js";

type DataSource = "cloud" | "mock";

interface DtsConfigForm {
  cloudBaseUrl: string;
  employeeId: string;
  dataSource: DataSource;
  httpPort: string;
}

const EMPTY_FORM: DtsConfigForm = { cloudBaseUrl: "", employeeId: "", dataSource: "cloud", httpPort: "8788" };

function configToForm(config: Record<string, unknown> | null): DtsConfigForm {
  if (config === null) return EMPTY_FORM;
  const httpPort = typeof config["httpPort"] === "number" ? String(config["httpPort"]) : "8788";
  const mock = config["mock"] === true;
  return {
    cloudBaseUrl: typeof config["cloudBaseUrl"] === "string" ? config["cloudBaseUrl"] : "",
    employeeId: typeof config["employeeId"] === "string" ? config["employeeId"] : "",
    dataSource: mock ? "mock" : "cloud",
    httpPort,
  };
}

/** 保存载荷:数据源=模拟时 mock:true 且不带地址(地址留档);云平台要求地址与工号。 */
function formToPatch(form: DtsConfigForm): { patch: Record<string, unknown>; problem: string | null } {
  const employeeId = form.employeeId.trim();
  if (!employeeId) return { patch: {}, problem: "missingEmployeeId" };
  const cloudBaseUrl = form.cloudBaseUrl.trim();
  if (form.dataSource === "cloud" && cloudBaseUrl !== "" && !/^https?:\/\//.test(cloudBaseUrl)) {
    return { patch: {}, problem: "badBaseUrl" };
  }
  if (form.dataSource === "cloud" && cloudBaseUrl === "") return { patch: {}, problem: "missingBaseUrl" };
  const port = Number.parseInt(form.httpPort, 10);
  if (form.httpPort.trim() !== "" && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    return { patch: {}, problem: "badPort" };
  }
  const patch: Record<string, unknown> = { employeeId, mock: form.dataSource === "mock" };
  if (cloudBaseUrl !== "") patch["cloudBaseUrl"] = cloudBaseUrl.replace(/\/+$/, "");
  if (form.httpPort.trim() !== "") patch["httpPort"] = port;
  return { patch, problem: null };
}

export function DtsFlowSettingsSection() {
  const { intl } = useZCodeIntl();
  const platform = usePlatform();
  const [form, setForm] = useState<DtsConfigForm>(EMPTY_FORM);
  const [loaded, setLoaded] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [status, setStatus] = useState<"probing" | "running" | "stopped">("probing");
  const [statusMock, setStatusMock] = useState<boolean | null>(null);
  const [statusConfigured, setStatusConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    if (platform.dtsFlowConfig === undefined) {
      setLoaded(true);
      return;
    }
    void platform.dtsFlowConfig.read().then((config) => {
      setForm(configToForm(config));
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [platform]);

  /** 服务状态卡:探测本地服务 health+config(5s 轮询)。 */
  useEffect(() => {
    let disposed = false;
    const probe = async () => {
      try {
        const health = await fetch(`${DEFAULT_DTS_SERVICE_BASE}/api/health`, { signal: AbortSignal.timeout(3000) });
        const body = (await health.json()) as { mock?: boolean };
        if (disposed) return;
        setStatus("running");
        setStatusMock(body.mock === true);
        try {
          const config = await fetch(`${DEFAULT_DTS_SERVICE_BASE}/api/config`, { signal: AbortSignal.timeout(3000) });
          const configBody = (await config.json()) as { cloudBaseUrl?: string | null };
          if (!disposed) setStatusConfigured(Boolean(configBody.cloudBaseUrl));
        } catch {
          if (!disposed) setStatusConfigured(null);
        }
      } catch {
        if (!disposed) {
          setStatus("stopped");
          setStatusMock(null);
          setStatusConfigured(null);
        }
      }
    };
    void probe();
    const timer = setInterval(() => void probe(), 5000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, []);

  const save = useCallback(async () => {
    const { patch, problem } = formToPatch(form);
    if (problem !== null) {
      toast(intl.formatMessage({ id: `settings.dtsFlow.problem.${problem}` }), { variant: "warning" });
      return;
    }
    if (platform.dtsFlowConfig === undefined) {
      toast(intl.formatMessage({ id: "settings.dtsFlow.desktopOnly" }), { variant: "warning" });
      return;
    }
    try {
      await platform.dtsFlowConfig.write(patch);
      toast(intl.formatMessage({ id: "settings.dtsFlow.saved" }));
    } catch (caught) {
      toast(`${intl.formatMessage({ id: "settings.dtsFlow.saveFailed" })}: ${caught instanceof Error ? caught.message : String(caught)}`, { variant: "warning" });
    }
  }, [form, intl, platform]);

  const statusLabel = useMemo(() => {
    if (status === "probing") return intl.formatMessage({ id: "settings.dtsFlow.statusProbing" });
    if (status === "stopped") return intl.formatMessage({ id: "settings.dtsFlow.statusStopped" });
    if (statusConfigured === false) return intl.formatMessage({ id: "settings.dtsFlow.statusUnconfigured" });
    return intl.formatMessage({ id: "settings.dtsFlow.statusRunning" }, { mode: statusMock === true ? intl.formatMessage({ id: "settings.dtsFlow.statusModeMock" }) : intl.formatMessage({ id: "settings.dtsFlow.statusModeCloud" }) });
  }, [intl, status, statusMock, statusConfigured]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6" data-testid="mae-dts-settings">
      <div>
        <h2 className="text-lg font-semibold">{intl.formatMessage({ id: "settings.dtsFlow.title" })}</h2>
        <p className="pt-1 text-muted-foreground text-xs">{intl.formatMessage({ id: "settings.dtsFlow.subtitle" })}</p>
      </div>

      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border border-card-border px-3 py-2 text-xs",
          status === "running" ? "text-foreground" : "text-muted-foreground",
        )}
        data-testid="mae-dts-service-status"
      >
        <span
          className={cn(
            "size-2 rounded-full",
            status === "running" ? "bg-emerald-500" : status === "probing" ? "bg-muted-foreground/50" : "bg-destructive",
          )}
        />
        <span data-testid="mae-dts-service-status-text">{statusLabel}</span>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs">{intl.formatMessage({ id: "settings.dtsFlow.baseUrl" })}</span>
        <Input
          className="h-8"
          placeholder="http://mae-flow.internal:8787"
          value={form.cloudBaseUrl}
          onChange={(event) => setForm((current) => ({ ...current, cloudBaseUrl: event.target.value }))}
          data-testid="mae-dts-settings-base-url"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs">{intl.formatMessage({ id: "settings.dtsFlow.employeeId" })}</span>
        <Input
          className="h-8"
          placeholder={intl.formatMessage({ id: "settings.dtsFlow.employeeIdPlaceholder" })}
          value={form.employeeId}
          onChange={(event) => setForm((current) => ({ ...current, employeeId: event.target.value }))}
          data-testid="mae-dts-settings-employee-id"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs">{intl.formatMessage({ id: "settings.dtsFlow.dataSource" })}</span>
        <Select value={form.dataSource} onValueChange={(value) => setForm((current) => ({ ...current, dataSource: value as DataSource }))}>
          <SelectTrigger className="h-8" data-testid="mae-dts-settings-data-source">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cloud">{intl.formatMessage({ id: "settings.dtsFlow.dataSourceCloud" })}</SelectItem>
            <SelectItem value="mock">{intl.formatMessage({ id: "settings.dtsFlow.dataSourceMock" })}</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-muted-foreground text-xs">{intl.formatMessage({ id: "settings.dtsFlow.dataSourceHint" })}</span>
      </label>

      <div>
        <Button variant="ghost" size="sm" onClick={() => setAdvancedOpen((open) => !open)}>
          {intl.formatMessage({ id: "settings.dtsFlow.advanced" })}
        </Button>
        {advancedOpen ? (
          <label className="mt-1 flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">{intl.formatMessage({ id: "settings.dtsFlow.httpPort" })}</span>
            <Input
              className="h-8 w-32"
              value={form.httpPort}
              onChange={(event) => setForm((current) => ({ ...current, httpPort: event.target.value }))}
              data-testid="mae-dts-settings-port"
            />
          </label>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <Button size="sm" onClick={() => void save()} data-testid="mae-dts-settings-save" disabled={!loaded}>
          {intl.formatMessage({ id: "settings.dtsFlow.save" })}
        </Button>
        <span className="text-muted-foreground text-xs">{intl.formatMessage({ id: "settings.dtsFlow.saveHint" })}</span>
      </div>
    </div>
  );
}
