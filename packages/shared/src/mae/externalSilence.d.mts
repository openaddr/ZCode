/**
 * mae:externalSilence.mjs 的手写声明(与同目录 deeplinkScheme.d.mts 同一约定:
 * 跨包 TS 消费方与 Node 构建脚本共用同一份 .mjs 实现,类型靠本文件提供)。
 */

export type MaeExternalSilenceEnv = Record<string, string | undefined>;

export declare const ZCODE_ALLOW_OFFICIAL_IDENTITY_ENV: "ZCODE_ALLOW_OFFICIAL_IDENTITY";

export declare function isOfficialIdentityExplicitlyAllowed(
  env?: MaeExternalSilenceEnv,
): boolean;

/** mae 外联静默是否生效；默认生效，官方身份需显式授权（D14）。 */
export declare function isMaeExternalSilenceEnabled(env?: MaeExternalSilenceEnv): boolean;

/** 剥离继承环境里的全部 OTLP / ZCode 遥测键(遥测框架保留,端点为空落入 Noop)。 */
export declare function stripMaeExternalTelemetryEnv<T extends MaeExternalSilenceEnv>(
  env: T,
): Record<string, string>;
