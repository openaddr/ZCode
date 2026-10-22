import { describe, expect, it } from "vitest";

import { ZCODE_ALLOW_OFFICIAL_IDENTITY_ENV, type MaeExternalSilenceContract } from "./contract.js";
import { maeExternalSilenceModule } from "./module.js";
import { isMaeExternalSilenceEnabled, stripMaeExternalTelemetryEnv } from "./externalSilence.js";

// 契约测试只 import contract 与 module，不知道实现是谁；同一份测试应同时跑真实现与跨进程代理。
describe("mae-external-silence contract", () => {
  it("declares its module manifest", () => {
    expect(maeExternalSilenceModule.id).toBe("mae-external-silence");
  });

  // 真实现必须满足契约：默认静默 + 授权恢复 + 遥测键剥离（防 rebase 丢挂接的语义锚点）。
  const implementation: MaeExternalSilenceContract = {
    isSilent: isMaeExternalSilenceEnabled,
    stripTelemetryEnv: stripMaeExternalTelemetryEnv,
  };

  it("isSilent 默认 true，显式授权官方身份时 false", () => {
    expect(implementation.isSilent({})).toBe(true);
    expect(
      implementation.isSilent({ [ZCODE_ALLOW_OFFICIAL_IDENTITY_ENV]: "1" }),
    ).toBe(false);
  });

  it("stripTelemetryEnv 剥离遥测键且不改写入参", () => {
    const env = { OTEL_SERVICE_NAME: "x", KEEP: "y" };
    expect(implementation.stripTelemetryEnv(env)).toEqual({ KEEP: "y" });
    expect(env).toEqual({ OTEL_SERVICE_NAME: "x", KEEP: "y" });
  });
});
