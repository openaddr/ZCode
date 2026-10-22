import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  filterZCodeBuiltinCatalogForMae,
  MAE_PROVIDER_TEMPLATE_ALLOWLIST,
  MAE_PROVIDER_SITE_BLOCKED_PATTERNS,
} from "../src/mae/providerCatalogFilter.js";

interface CatalogRule {
  readonly templateId?: string;
  readonly providerId?: string;
  readonly baseUrlMatch?: string;
  readonly [key: string]: unknown;
}

interface Catalog {
  readonly revision: number;
  readonly config: {
    readonly providerConfigRules: {
      readonly templateRules: CatalogRule[];
      readonly providerRules: CatalogRule[];
    };
    readonly modelConfigRules: {
      readonly modelRules: unknown[];
      readonly modelApiRules: unknown[];
      readonly providerSiteRules: CatalogRule[];
      readonly templateModelRules: CatalogRule[];
      readonly builtinProviderModelRules: CatalogRule[];
    };
  };
}

async function readCatalog(filename: string): Promise<Catalog> {
  return JSON.parse(await readFile(new URL(`../../../config/provider/${filename}`, import.meta.url), "utf8")) as Catalog;
}

const RETAINED_TEMPLATE_CASES: ReadonlyArray<[templateId: string, label: string]> = [
  ["moonshot-kimi", "Kimi"],
  ["minimax", "MiniMax"],
  ["deepseek", "DeepSeek"],
  ["qwen-alibaba-model-studio-cn", "阿里 DashScope(中国站)"],
  ["qwen-alibaba-model-studio-intl", "阿里 DashScope(国际站)"],
  ["xiaomi-mimo", "小米 MiMo"],
  ["xiaomi-mimo-token-plan", "小米 MiMo Token Plan"],
  ["openai", "OpenAI(自定义 OpenAI 兼容模板的底座)"],
  ["anthropic", "Anthropic"],
  ["xai", "xAI"],
  ["openrouter", "OpenRouter"],
  ["opencode-zen-chat", "OpenCode Zen"],
  ["opencode-zen-messages", "OpenCode Zen"],
  ["opencode-zen-responses", "OpenCode Zen"],
];

describe("filterZCodeBuiltinCatalogForMae", () => {
  it.each(["zcode-builtin.json", "zcode-builtin.test.json"])(
    "%s 过滤后仅保留 API-key 型第三方模板",
    async (filename) => {
      const filtered = filterZCodeBuiltinCatalogForMae(await readCatalog(filename));
      const templates = filtered.config.providerConfigRules.templateRules;

      expect(templates.map((rule) => rule.templateId).sort()).toEqual(
        [...MAE_PROVIDER_TEMPLATE_ALLOWLIST].sort(),
      );
      for (const rule of templates) {
        expect((rule.config as { access?: { type?: string } }).access?.type).toBe("api-key");
      }
    },
  );

  it.each(["zcode-builtin.json", "zcode-builtin.test.json"])(
    "%s 过滤后无账号型 provider(zhipu-account / coding-plan)",
    async (filename) => {
      const filtered = filterZCodeBuiltinCatalogForMae(await readCatalog(filename));
      const providers = filtered.config.providerConfigRules.providerRules;

      expect(providers).toEqual([]);
    },
  );

  it.each(["zcode-builtin.json", "zcode-builtin.test.json"])(
    "%s 过滤后无智谱系端点与 opencode-go 网关",
    async (filename) => {
      const filtered = filterZCodeBuiltinCatalogForMae(await readCatalog(filename));
      const rules = filtered.config.providerConfigRules;
      const json = JSON.stringify({
        templates: rules.templateRules,
        providers: rules.providerRules,
        sites: filtered.config.modelConfigRules.providerSiteRules,
      });

      for (const blocked of MAE_PROVIDER_SITE_BLOCKED_PATTERNS) {
        expect(json).not.toContain(blocked);
      }
    },
  );

  it.each(["zcode-builtin.json", "zcode-builtin.test.json"])(
    "%s 过滤后模型/站点规则与保留模板一致",
    async (filename) => {
      const source = await readCatalog(filename);
      const filtered = filterZCodeBuiltinCatalogForMae(source);
      const modelRules = filtered.config.modelConfigRules;

      expect(
        [...new Set(modelRules.templateModelRules.map((rule) => rule.templateId))].sort(),
      ).toEqual([...MAE_PROVIDER_TEMPLATE_ALLOWLIST].sort());
      expect(modelRules.builtinProviderModelRules).toEqual([]);
      // 模型元数据规则(modelRules/modelApiRules)按模型名匹配,不引用任何端点,原样保留。
      expect(modelRules.modelRules).toEqual(source.config.modelConfigRules.modelRules);
      expect(modelRules.modelApiRules).toEqual(source.config.modelConfigRules.modelApiRules);
      expect(filtered.revision).toBe(source.revision);
    },
  );

  it("保留清单覆盖全部 API-key 型第三方与自定义 OpenAI 兼容底座", () => {
    for (const [templateId] of RETAINED_TEMPLATE_CASES) {
      expect(MAE_PROVIDER_TEMPLATE_ALLOWLIST).toContain(templateId);
    }
  });

  it("对未知结构保持失败优先:非 api-key 模板即使混入 allowlist 也被拒绝", () => {
    const source = {
      revision: 1,
      config: {
        providerConfigRules: {
          templateRules: [
            {
              templateId: "evil",
              config: { access: { type: "zhipu-coding-plan-api-key" } },
            },
          ],
          providerRules: [],
        },
        modelConfigRules: {
          modelRules: [],
          modelApiRules: [],
          providerSiteRules: [],
          templateModelRules: [],
          builtinProviderModelRules: [],
        },
      },
    };
    const filtered = filterZCodeBuiltinCatalogForMae(source, {
      allowedTemplateIds: new Set(["evil"]),
    });
    expect(filtered.config.providerConfigRules.templateRules).toEqual([]);
  });
});
