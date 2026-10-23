import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// 编译期常量 ZCODE_PRODUCT_FLAVOR 决定品牌目录;沿用 mae-data-root.test.ts 的
// 可切换持有者模式,默认 mae(fork 默认身份)。
const productFlavorMock = { value: "mae" as string };

vi.mock("@zcode/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@zcode/shared")>();
  return {
    ...actual,
    get ZCODE_PRODUCT_FLAVOR() {
      return productFlavorMock.value;
    },
  };
});

const { resolveBrandAssetSubdir, MAE_BRAND_ASSET_SUBDIR } = await import(
  "../src/main/mae/brandAssets.js"
);

const desktopPackageRoot = join(import.meta.dirname, "..");

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

describe("mae 品牌资产目录路由(#12)", () => {
  it("mae 身份路由到 build/mae 子目录", () => {
    expect(resolveBrandAssetSubdir("mae")).toBe("mae/");
    expect(MAE_BRAND_ASSET_SUBDIR).toBe("mae/");
  });

  it("官方身份(production/preview)保持上游 build/ 路径原样", () => {
    expect(resolveBrandAssetSubdir("production")).toBe("");
    expect(resolveBrandAssetSubdir("preview")).toBe("");
  });
});

describe("mae 品牌资产存在性守卫(#12 防丢网)", () => {
  // 资产由 scripts/mae/generate-mae-brand-assets.mjs 生成并随仓库提交;
  // rebase/同步冲掉生成文件或漏跑脚本时,此组立即变红。
  const maeAssetDir = join(desktopPackageRoot, "build", "mae");

  it("打包所需关键资产齐全(png/ico/icns/安装器)", () => {
    for (const asset of [
      "icon.png",
      "icon.ico",
      "icon.icns",
      "icon_windows.png",
      "icon_installer.png",
      "icon_installer.ico",
      "icon_installer.icns",
      "dmg_background.png",
      "dmg_background@2x.png",
      "icons/512x512.png",
      "icons/256x256.png",
    ]) {
      expect(existsSync(join(maeAssetDir, asset)), `missing ${asset}`).toBe(true);
    }
  });

  it("资产魔数合法(PNG/ICO/ICNS)", () => {
    for (const asset of ["icon.png", "icon_windows.png", "icons/512x512.png"]) {
      const header = readFileSync(join(maeAssetDir, asset)).subarray(0, 4);
      expect([...header], `${asset} PNG signature`).toEqual(PNG_SIGNATURE);
    }
    // ICO: u16 reserved=0 + u16 type=1(icon)
    const icoHeader = readFileSync(join(maeAssetDir, "icon.ico")).subarray(0, 4);
    expect(icoHeader[0]).toBe(0);
    expect(icoHeader[1]).toBe(0);
    expect(icoHeader[2]).toBe(1);
    const installerIcoHeader = readFileSync(join(maeAssetDir, "icon_installer.ico")).subarray(0, 4);
    expect(installerIcoHeader[2]).toBe(1);
    // ICNS: 'icns' magic
    expect(readFileSync(join(maeAssetDir, "icon.icns")).subarray(0, 4).toString("ascii")).toBe(
      "icns",
    );
  });
});
