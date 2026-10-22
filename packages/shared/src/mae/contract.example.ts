/**
 * mae-external-silence 标准调用示例：agent 靠模仿写代码，这里放的就是该模仿的那份。
 */
import type { MaeExternalSilenceContract } from "./contract.js";

/** 薄挂接的标准形态：一次判定 + 按结果选择两条既有路径之一，禁止散布第三种判断。 */
export function exampleMaeExternalSilence(contract: MaeExternalSilenceContract): void {
  const env: Record<string, string | undefined> = { OTEL_EXPORTER_OTLP_ENDPOINT: "https://collector.example/v1" };
  if (contract.isSilent(env)) {
    // 静默路径：剥离遥测键，后续框架以空端点自然 Noop。
    const silentEnv = contract.stripTelemetryEnv(env);
    void silentEnv;
  }
  // 官方路径：原样透传 env，走上游既有链路。
}
