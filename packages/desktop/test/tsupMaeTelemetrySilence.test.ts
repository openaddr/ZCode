import { describe, expect, it } from "vitest";
import { resolveBuildPackagedAgentTelemetryEnv } from "../tsup.config";
import { resolveBuildTimeConfig } from "../../../scripts/build-time-config.mjs";

const OFFICIAL_OTLP_ENV = {
  ZCODE_PACKAGED_AGENT_OTEL_ENDPOINT: "https://collector.example.com/v1",
  ZCODE_PACKAGED_AGENT_OTEL_HEADERS: "authorization=secret",
};

// mae: 外联静默——遥测端点置空(框架保留,#7)
describe("mae 构建期遥测静默", () => {
  it("默认静默:Agent OTLP 打包默认值解析为空(数据不出本机)", () => {
    expect(resolveBuildPackagedAgentTelemetryEnv(OFFICIAL_OTLP_ENV)).toEqual({});
    expect(resolveBuildPackagedAgentTelemetryEnv({ ...OFFICIAL_OTLP_ENV, CI: "1" })).toEqual({});
  });

  it("ZCODE_ALLOW_OFFICIAL_IDENTITY=1 恢复官方 OTLP 注入与校验", () => {
    const resolved = resolveBuildPackagedAgentTelemetryEnv({
      ...OFFICIAL_OTLP_ENV,
      ZCODE_ALLOW_OFFICIAL_IDENTITY: "1",
    });
    expect(resolved.OTEL_EXPORTER_OTLP_ENDPOINT).toBe("https://collector.example.com/v1");
    expect(resolved.OTEL_EXPORTER_OTLP_HEADERS).toBe("authorization=secret");
    expect(resolved.ZCODE_TELEMETRY_RUNTIME_DISTRIBUTION).toBe("packaged");
  });

  it("默认静默:ARMS/事件上报端点构建期解析为空(空端点=SDK 关闭)", async () => {
    const config = await resolveBuildTimeConfig({
      ZCODE_ARMS_RUM_ENDPOINT: "https://arms.example.com",
      ZCODE_TELEMETRY_REPORT_ENDPOINT: "https://report.example.com",
    });
    expect(config.armsRumEndpoint).toBe("");
    expect(config.telemetryReportEndpoint).toBe("");
  });

  it("ZCODE_ALLOW_OFFICIAL_IDENTITY=1 恢复官方端点注入", async () => {
    const config = await resolveBuildTimeConfig({
      ZCODE_ARMS_RUM_ENDPOINT: "https://arms.example.com",
      ZCODE_TELEMETRY_REPORT_ENDPOINT: "https://report.example.com",
      ZCODE_ALLOW_OFFICIAL_IDENTITY: "1",
    });
    expect(config.armsRumEndpoint).toBe("https://arms.example.com");
    expect(config.telemetryReportEndpoint).toBe("https://report.example.com");
  });
});
