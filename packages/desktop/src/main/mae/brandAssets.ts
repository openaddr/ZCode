/**
 * mae 品牌资产目录路由(#12)——specs/mae/versioning-branding.md。
 *
 * 打包态:electron-builder.config.js 的 brandAssetDir 已把 mae 资产按同名打进 resources
 * (`to` 不变),因此 `process.resourcesPath` 消费方零改动;
 * dev 态:mae 身份读 `build/mae/`(青色调占位资产,scripts/mae/generate-mae-brand-assets.mjs 生成),
 * 官方身份(显式授权构建才可出现)保留上游 `build/` 原资产。
 *
 * 本模块只出目录前缀,不拼路径:main 进程会被 tsup 打平到 out/main/index.js,
 * `../../build` 的 bundle 相对深度由各消费方(均在 src/main/ 深度)保持,与上游写法一致。
 */
import { ZCODE_PRODUCT_FLAVOR, type ZCodeProductFlavor } from "@zcode/shared";

/** dev 态品牌子目录前缀:mae → `mae/`,官方 → 空(直接用上游 build/ 根)。 */
export function resolveBrandAssetSubdir(flavor: ZCodeProductFlavor): string {
  // mae: 品牌资产随身份路由(#12);官方身份保持上游路径原样
  return flavor === "mae" ? "mae/" : "";
}

/** 当前身份的品牌子目录前缀(消费方拼 `../../build/${本前缀}icon.png`)。 */
export const MAE_BRAND_ASSET_SUBDIR = resolveBrandAssetSubdir(ZCODE_PRODUCT_FLAVOR);
