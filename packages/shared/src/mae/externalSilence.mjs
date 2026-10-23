/**
 * mae 外联静默开关（specs/mae/feature-gates.md，工单 #7）。
 *
 * 这是「默认身份翻转」口径（specs/mae/README.md D14）在运行期的投影：
 * 任何构建路径、任何环境下默认启用外联静默——provider 目录本地化、
 * 官方提供商目录后台刷新切断、遥测端点置空；只有显式
 * `ZCODE_ALLOW_OFFICIAL_IDENTITY=1` 才恢复官方云端外联，供上游对比验证使用。
 *
 * mae(#12):本体从 externalSilence.ts 迁为 .mjs(手写声明见 externalSilence.d.mts,
 * 与同目录 deeplinkScheme.mjs 同一约定)——tsup.config.ts 经原生 ESM 加载,
 * `@zcode/shared/mae` 的 TS 入口在 Node 下无法解析(.js→.ts 不重写,#7 落地时
 * 未跑真实打包故漏网);纯 JS 双胎使构建脚本与 TS 消费方共用同一份实现。
 */

export const ZCODE_ALLOW_OFFICIAL_IDENTITY_ENV = "ZCODE_ALLOW_OFFICIAL_IDENTITY";

export function isOfficialIdentityExplicitlyAllowed(env = process.env) {
  const explicit = env[ZCODE_ALLOW_OFFICIAL_IDENTITY_ENV]?.trim().toLowerCase();
  return explicit === "1" || explicit === "true";
}

/** mae 外联静默是否生效；默认生效，官方身份需显式授权（D14）。 */
export function isMaeExternalSilenceEnabled(env = process.env) {
  return !isOfficialIdentityExplicitlyAllowed(env);
}

/** 与 packages/shared/src/runtimeEnv.ts 的 isZCodeAgentTelemetryEnvKey 同口径的遥测键判定。 */
function isExternalTelemetryEnvKey(key) {
  return (
    key.startsWith("OTEL_") ||
    key.startsWith("ZCODE_TELEMETRY_") ||
    key === "ZCODE_MODEL_TELEMETRY_ENABLED"
  );
}

/**
 * 剥离继承环境里的全部 OTLP / ZCode 遥测键。
 * mae 默认运行不外发：即使开发者本机 shell 配了官方 OTLP 端点，
 * 也不得随 Host/Agent 环境泄出（遥测框架保留，端点为空时自然落入 Noop）。
 */
export function stripMaeExternalTelemetryEnv(env) {
  const stripped = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || isExternalTelemetryEnvKey(key)) continue;
    stripped[key] = value;
  }
  return stripped;
}
