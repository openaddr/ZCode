/**
 * mae-external-silence 对外契约：调用方要想正确调用就必须知道的一切都写在这里；其余对外不可见。
 * 每个方法注释写清：前置/后置条件、幂等性、发出哪些事件、是否等待持久化。
 */

/**
 * mae 外联静默开关与裁剪规则的唯一所有者（specs/mae/feature-gates.md，工单 #7）。
 *
 * - `isMaeExternalSilenceEnabled(env)`：纯函数，默认 true；仅
 *   `ZCODE_ALLOW_OFFICIAL_IDENTITY=1|true` 时为 false（D14 默认身份翻转的运行期投影）。
 *   调用方（desktop main、services 装配层、构建脚本）各自薄挂接，不自行复制判定。
 * - `stripMaeExternalTelemetryEnv(env)`：纯函数，返回剔除全部 `OTEL_*` /
 *   `ZCODE_TELEMETRY_*` / `ZCODE_MODEL_TELEMETRY_ENABLED` 键后的新对象；不改写入参。
 *   端点为空时上游遥测框架自然落入 Noop——框架保留、端点置空，不删模块。
 * - `filterZCodeBuiltinCatalogForMae(catalog)`：纯函数，以官方 zcode-builtin(.test).json
 *   为底派生 mae 裁剪目录（仅 API-key 型第三方 + 自定义 OpenAI 兼容底座；无账号型
 *   provider、无智谱系/opencode-go 端点）。生成物由
 *   scripts/mae/generate-mae-builtin-catalog.mjs 落盘为 config/provider/mae-builtin*.json。
 */
export type MaeExternalSilenceEnv = Record<string, string | undefined>;

export interface MaeExternalSilenceContract {
  /** 默认 true；官方身份显式授权时 false。幂等、无副作用、不读盘。 */
  readonly isSilent: (env?: MaeExternalSilenceEnv) => boolean;
  /** 返回新对象；入参键值原样保留。幂等：对已剥离结果再剥离是 no-op。 */
  readonly stripTelemetryEnv: <T extends MaeExternalSilenceEnv>(env: T) => Record<string, string>;
}

/** 官方身份授权环境变量名；与构建脚本 scripts/build-time-config.mjs 共用同一契约。 */
export const ZCODE_ALLOW_OFFICIAL_IDENTITY_ENV = "ZCODE_ALLOW_OFFICIAL_IDENTITY";
