import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { tsImport } from "tsx/esm/api";

/**
 * mae 内置 provider 目录生成脚本（specs/mae/feature-gates.md D8，工单 #7）。
 *
 * 用法：node scripts/mae/generate-mae-builtin-catalog.mjs
 * 以官方 config/provider/zcode-builtin(.test).json 为底，经
 * @zcode/shared/mae 的 filterZCodeBuiltinCatalogForMae 派生 mae 裁剪目录。
 * 上游目录变更（revision/内容）后必须重跑本脚本，保持两侧一致
 * （packages/provider-node/test/mae-builtin-catalog.test.ts 会强制校验）。
 */

const repositoryRoot = resolve(import.meta.dirname, "../..");

const CATALOG_PAIRS = [
  { source: "zcode-builtin.json", target: "mae-builtin.json" },
  { source: "zcode-builtin.test.json", target: "mae-builtin.test.json" },
];

const { filterZCodeBuiltinCatalogForMae } = await tsImport(
  pathToFileURL(resolve(repositoryRoot, "packages/shared/src/mae/providerCatalogFilter.ts")).href,
  import.meta.url,
);

for (const { source, target } of CATALOG_PAIRS) {
  const sourcePath = resolve(repositoryRoot, "config/provider", source);
  const targetPath = resolve(repositoryRoot, "config/provider", target);
  const catalog = JSON.parse(await readFile(sourcePath, "utf8"));
  const filtered = filterZCodeBuiltinCatalogForMae(catalog);
  await writeFile(targetPath, `${JSON.stringify(filtered, null, 2)}\n`, "utf8");
  const templates = filtered.config.providerConfigRules.templateRules.length;
  const providers = filtered.config.providerConfigRules.providerRules.length;
  console.log(
    `[mae] ${source} -> ${target}: revision=${filtered.revision} templates=${templates} providers=${providers}`,
  );
}
