import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  MAE_PROVIDER_SITE_BLOCKED_PATTERNS,
  MAE_PROVIDER_TEMPLATE_ALLOWLIST,
  filterZCodeBuiltinCatalogForMae,
} from "@zcode/shared/mae";
import { decodeZCodeBuiltinRelease } from "../src/zcode-builtin-release.js";

const CATALOG_DIR = "../../../config/provider";

async function readCatalogJson(filename: string): Promise<unknown> {
  return JSON.parse(await readFile(new URL(`${CATALOG_DIR}/${filename}`, import.meta.url), "utf8"));
}

describe("mae 内置 provider 目录(config/provider/mae-builtin*.json)", () => {
  it.each([
    ["mae-builtin.json", "zcode-builtin.json"],
    ["mae-builtin.test.json", "zcode-builtin.test.json"],
  ])(
    "%s 通过 Release Schema 校验且仅含 API-key 型第三方",
    async (maeFilename, _sourceFilename) => {
      const release = decodeZCodeBuiltinRelease(await readCatalogJson(maeFilename));

      expect([...release.config.providerTemplates.keys()].sort()).toEqual(
        [...MAE_PROVIDER_TEMPLATE_ALLOWLIST].sort(),
      );
      for (const [, template] of release.config.providerTemplates.entries()) {
        expect(template.config.access?.type).toBe("api-key");
        for (const blocked of MAE_PROVIDER_SITE_BLOCKED_PATTERNS) {
          expect(template.config.api?.baseUrl).not.toContain(blocked.replace(/\\\./g, "."));
        }
      }
      expect(release.config.providers.entries()).toEqual([]);
    },
  );

  it.each([
    ["mae-builtin.json", "zcode-builtin.json"],
    ["mae-builtin.test.json", "zcode-builtin.test.json"],
  ])(
    "%s 与官方底版 %s 的过滤结果保持一致(上游目录变更后须重跑生成脚本)",
    async (maeFilename, sourceFilename) => {
      const source = await readCatalogJson(sourceFilename);
      const committed = await readCatalogJson(maeFilename);

      expect(committed).toEqual(filterZCodeBuiltinCatalogForMae(source as object));
    },
  );
});
