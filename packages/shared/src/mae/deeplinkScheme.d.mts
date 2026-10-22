/**
 * mae:deeplinkScheme.mjs 的手写声明(与 desktop/scripts/mae-identity.d.mts 同一约定:
 * 跨包 TS 消费方与 Node 构建脚本共用同一份 .mjs 常量,类型靠本文件提供)。
 */

/** mae 深链接 scheme(不带冒号;URL 形态为 `zcode-mae://`),唯一定义见 deeplinkScheme.mjs。 */
export const MAE_DEEP_LINK_SCHEME: "zcode-mae";
