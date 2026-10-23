// mae: 本体迁 .mjs(类型见 externalSilence.d.mts)——tsup 配置链的原生 ESM 加载依赖纯 JS(#12)
export {
  ZCODE_ALLOW_OFFICIAL_IDENTITY_ENV,
  isMaeExternalSilenceEnabled,
  isOfficialIdentityExplicitlyAllowed,
  stripMaeExternalTelemetryEnv,
} from "./externalSilence.mjs";
export {
  MAE_PROVIDER_SITE_BLOCKED_PATTERNS,
  MAE_PROVIDER_TEMPLATE_ALLOWLIST,
  filterZCodeBuiltinCatalogForMae,
} from "./providerCatalogFilter.js";
// mae: 深链接 scheme 唯一定义经公共入口再导出,desktop/web 消费方统一引用(#10)
export { MAE_DEEP_LINK_SCHEME } from "./deeplinkScheme.mjs";
// mae: 用户级 home 统一 resolver 经公共入口再导出,services 消费方统一引用(#25)
export { resolveMaeAwareUserHomeDir } from "./userHome.js";
