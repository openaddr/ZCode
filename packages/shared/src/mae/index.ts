export {
  ZCODE_ALLOW_OFFICIAL_IDENTITY_ENV,
  isMaeExternalSilenceEnabled,
  isOfficialIdentityExplicitlyAllowed,
  stripMaeExternalTelemetryEnv,
} from "./externalSilence.js";
export {
  MAE_PROVIDER_SITE_BLOCKED_PATTERNS,
  MAE_PROVIDER_TEMPLATE_ALLOWLIST,
  filterZCodeBuiltinCatalogForMae,
} from "./providerCatalogFilter.js";
// mae: 深链接 scheme 唯一定义经公共入口再导出,desktop/web 消费方统一引用(#10)
export { MAE_DEEP_LINK_SCHEME } from "./deeplinkScheme.mjs";
