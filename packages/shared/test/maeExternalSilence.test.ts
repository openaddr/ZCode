import { describe, expect, it } from "vitest";
import {
  ZCODE_ALLOW_OFFICIAL_IDENTITY_ENV,
  isMaeExternalSilenceEnabled,
  isOfficialIdentityExplicitlyAllowed,
  stripMaeExternalTelemetryEnv,
} from "../src/mae/externalSilence.js";

describe("isMaeExternalSilenceEnabled（mae 外联静默默认开）", () => {
  it("未设置授权变量时默认静默（任何构建路径默认 mae 身份）", () => {
    expect(isMaeExternalSilenceEnabled({})).toBe(true);
    expect(isMaeExternalSilenceEnabled({ [ZCODE_ALLOW_OFFICIAL_IDENTITY_ENV]: "" })).toBe(true);
    expect(isMaeExternalSilenceEnabled({ [ZCODE_ALLOW_OFFICIAL_IDENTITY_ENV]: "0" })).toBe(true);
    expect(isMaeExternalSilenceEnabled({ [ZCODE_ALLOW_OFFICIAL_IDENTITY_ENV]: "false" })).toBe(
      true,
    );
  });

  it("显式 ZCODE_ALLOW_OFFICIAL_IDENTITY=1 才恢复官方外联", () => {
    expect(isOfficialIdentityExplicitlyAllowed({ [ZCODE_ALLOW_OFFICIAL_IDENTITY_ENV]: "1" })).toBe(
      true,
    );
    expect(isMaeExternalSilenceEnabled({ [ZCODE_ALLOW_OFFICIAL_IDENTITY_ENV]: "1" })).toBe(false);
    expect(isMaeExternalSilenceEnabled({ [ZCODE_ALLOW_OFFICIAL_IDENTITY_ENV]: " true " })).toBe(
      false,
    );
  });
});

describe("stripMaeExternalTelemetryEnv（遥测端点置空的运行期防线）", () => {
  it("剥离全部 OTLP 与 ZCode 遥测键，其余环境原样保留", () => {
    expect(
      stripMaeExternalTelemetryEnv({
        OTEL_EXPORTER_OTLP_ENDPOINT: "https://collector.example/v1",
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "https://collector.example/v1/traces",
        OTEL_EXPORTER_OTLP_HEADERS: "authorization=secret",
        OTEL_SERVICE_NAME: "zcode-cli-agent",
        ZCODE_TELEMETRY_DEVICE_MID: "mid",
        ZCODE_TELEMETRY_IDENTITY_STATE: "authenticated",
        ZCODE_MODEL_TELEMETRY_ENABLED: "1",
        ZCODE_BASE_URL: "https://zcode.z.ai",
        GLM_BINARY_PATH: "/bin/glm",
      }),
    ).toEqual({
      ZCODE_BASE_URL: "https://zcode.z.ai",
      GLM_BINARY_PATH: "/bin/glm",
    });
  });

  it("无遥测键时不改写输入对象", () => {
    const env = { OTEL_SERVICE_NAME: "x" };
    const stripped = stripMaeExternalTelemetryEnv(env);
    expect(stripped).not.toBe(env);
    expect(stripped).toEqual({});
  });
});
