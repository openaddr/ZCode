/**
 * mae 内置 provider 目录裁剪规则（specs/mae/feature-gates.md D8，工单 #7）。
 *
 * mae-builtin.json 由官方 zcode-builtin(.test).json 经本过滤函数派生
 * （scripts/mae/generate-mae-builtin-catalog.mjs）：
 * - 仅保留 API-key 型第三方模板与自定义 OpenAI 兼容底座（openai 模板）；
 * - 移除全部账号型 provider（zhipu-account / coding-plan）；
 * - 移除智谱系端点（z.ai / bigmodel / zcode 网关）与 opencode-go 网关的模板、站点与模型规则；
 * - 按模型名匹配的 modelRules / modelApiRules 不引用端点，原样保留
 *   （用户自定义 OpenAI 兼容 provider 仍可获得这些模型的元数据）。
 */

/** 保留的 API-key 型第三方模板 + 自定义 OpenAI 兼容底座。 */
export const MAE_PROVIDER_TEMPLATE_ALLOWLIST: ReadonlySet<string> = new Set([
  "moonshot-kimi",
  "minimax",
  "deepseek",
  "qwen-alibaba-model-studio-cn",
  "qwen-alibaba-model-studio-intl",
  "xiaomi-mimo",
  "xiaomi-mimo-token-plan",
  "openai",
  "anthropic",
  "xai",
  "openrouter",
  "opencode-zen-chat",
  "opencode-zen-messages",
  "opencode-zen-responses",
]);

/**
 * 站点规则(baseUrlMatch 正则源串)中禁止出现的网关片段。
 * JSON 解析后的正则源串里 '.' 均为 '\.'，这里按该口径匹配。
 */
export const MAE_PROVIDER_SITE_BLOCKED_PATTERNS: readonly string[] = [
  "z\\.ai",
  "bigmodel\\.cn",
  "zen/go",
];

/** mae 目录中 provider 必须(且仅能)使用的接入类型。 */
const MAE_ALLOWED_ACCESS_TYPE = "api-key";

interface CatalogRule {
  readonly templateId?: string;
  readonly providerId?: string;
  readonly baseUrlMatch?: string;
  readonly config?: { readonly access?: { readonly type?: string } };
}

interface BuiltinCatalog {
  readonly schemaVersion?: number;
  readonly revision?: number;
  readonly config: {
    readonly providerConfigRules: {
      readonly templateRules?: readonly CatalogRule[];
      readonly providerRules?: readonly CatalogRule[];
    };
    readonly modelConfigRules: {
      readonly modelRules?: readonly unknown[];
      readonly modelApiRules?: readonly unknown[];
      readonly providerSiteRules?: readonly CatalogRule[];
      readonly templateModelRules?: readonly CatalogRule[];
      readonly builtinProviderModelRules?: readonly CatalogRule[];
    };
  };
}

export interface FilterZCodeBuiltinCatalogForMaeOptions {
  /** 测试注入用；生产恒为 MAE_PROVIDER_TEMPLATE_ALLOWLIST。 */
  readonly allowedTemplateIds?: ReadonlySet<string>;
}

function isBlockedSitePattern(baseUrlMatch: string | undefined): boolean {
  if (!baseUrlMatch) return false;
  return MAE_PROVIDER_SITE_BLOCKED_PATTERNS.some((blocked) => baseUrlMatch.includes(blocked));
}

/**
 * 以官方目录为底派生 mae 裁剪目录。纯函数：不改写输入，返回可安全
 * JSON.stringify 的新结构；schemaVersion/revision 语义随底版走。
 */
export function filterZCodeBuiltinCatalogForMae<T extends BuiltinCatalog>(
  catalog: T,
  options: FilterZCodeBuiltinCatalogForMaeOptions = {},
): T {
  const allowedTemplateIds = options.allowedTemplateIds ?? MAE_PROVIDER_TEMPLATE_ALLOWLIST;
  const sourceProviderRules = catalog.config.providerConfigRules.providerRules ?? [];
  const providerRules = sourceProviderRules.filter(
    (rule) => rule.config?.access?.type === MAE_ALLOWED_ACCESS_TYPE,
  );
  const keptProviderIds = new Set(providerRules.map((rule) => rule.providerId));
  const templateRules = (catalog.config.providerConfigRules.templateRules ?? []).filter(
    (rule) =>
      allowedTemplateIds.has(rule.templateId ?? "") &&
      rule.config?.access?.type === MAE_ALLOWED_ACCESS_TYPE,
  );
  const keptTemplateIds = new Set(templateRules.map((rule) => rule.templateId));
  const sourceModelRules = catalog.config.modelConfigRules;

  return {
    ...catalog,
    config: {
      providerConfigRules: {
        templateRules,
        providerRules,
      },
      modelConfigRules: {
        modelRules: sourceModelRules.modelRules ?? [],
        modelApiRules: sourceModelRules.modelApiRules ?? [],
        providerSiteRules: (sourceModelRules.providerSiteRules ?? []).filter(
          (rule) => !isBlockedSitePattern(rule.baseUrlMatch),
        ),
        templateModelRules: (sourceModelRules.templateModelRules ?? []).filter((rule) =>
          keptTemplateIds.has(rule.templateId ?? ""),
        ),
        builtinProviderModelRules: (sourceModelRules.builtinProviderModelRules ?? []).filter(
          (rule) => keptProviderIds.has(rule.providerId ?? ""),
        ),
      },
    },
  };
}
