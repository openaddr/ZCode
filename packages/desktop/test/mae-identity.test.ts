import { describe, expect, it } from "vitest";
import {
  desktopProductIdentities,
  resolveDesktopArtifactSuffix,
  resolveDesktopProductFlavor,
  resolveDesktopProductIdentity,
  resolveWindowsAppUserModelId,
  resolveWindowsAppUserModelIdForFlavor,
} from "../scripts/desktop-product-identity.mjs";
import {
  MAE_DEV_APP_USER_MODEL_ID,
  MAE_IDENTITY,
  ZCODE_ALLOW_OFFICIAL_IDENTITY_ENV,
  isOfficialIdentityAuthorized,
} from "../scripts/mae-identity.mjs";
import { normalizeZCodeProductFlavor } from "@zcode/shared";

/**
 * mae 默认身份与防误产守卫(specs/mae/README.md D10/D14、specs/mae/identity-isolation.md)。
 *
 * 断言全部打在上游唯一身份解析入口(desktop-product-identity.mjs)上:任何挂接行被上游同步
 * rebase 冲掉时,默认身份不再是 mae,本文件变红,即「防丢网」。上游自带的官方语义测试
 * (desktopProductIdentity.test.ts)已在授权 env 下保留;本文件钉住 mae 侧行为。
 */
describe("mae 默认身份与授权守卫(构建轴)", () => {
  it("全新克隆、零环境变量:默认身份是 mae(D14 翻转)", () => {
    expect(resolveDesktopProductFlavor({})).toBe("mae");
    expect(resolveDesktopProductIdentity({})).toBe(MAE_IDENTITY);
  });

  it("mae 身份常量与 D10 命名定稿一致", () => {
    expect(MAE_IDENTITY).toEqual({
      flavor: "mae",
      appId: "dev.zcode-mae.app",
      productName: "ZCode Mae",
      linuxExecutableName: "zcode-mae",
      linuxPackageName: "zcode-mae",
      cuaHelperInstallVariant: "mae",
    });
  });

  it("上游身份表注册了 mae 条目(挂接被 rebase 冲掉时本条变红)", () => {
    expect(desktopProductIdentities.mae).toBe(MAE_IDENTITY);
  });

  it("ZCODE_ENV 是后端轴:production/test/未知环境未授权时都产出 mae 身份", () => {
    for (const zcodeEnv of ["production", "test", "staging", undefined]) {
      const env = zcodeEnv === undefined ? {} : { ZCODE_ENV: zcodeEnv };
      expect(resolveDesktopProductFlavor(env)).toBe("mae");
      expect(resolveDesktopProductIdentity(env)).toBe(MAE_IDENTITY);
    }
  });

  it("未授权而显式请求官方身份(ZCODE_PREVIEW_IDENTITY=1)时构建期直接抛错", () => {
    for (const flag of ["1", " 1 "]) {
      expect(() =>
        resolveDesktopProductFlavor({ ZCODE_PREVIEW_IDENTITY: flag }),
      ).toThrow(new RegExp(ZCODE_ALLOW_OFFICIAL_IDENTITY_ENV));
      expect(() =>
        resolveDesktopProductFlavor({ ZCODE_ENV: "production", ZCODE_PREVIEW_IDENTITY: flag }),
      ).toThrow(/official/);
    }
    // 合法的关闭拼写不触发守卫,仍是默认 mae 身份。
    expect(resolveDesktopProductFlavor({ ZCODE_ENV: "production", ZCODE_PREVIEW_IDENTITY: "0" })).toBe(
      "mae",
    );
  });

  it("显式 ZCODE_ALLOW_OFFICIAL_IDENTITY=1 时恢复官方身份语义(对照调试用)", () => {
    const authorized = { [ZCODE_ALLOW_OFFICIAL_IDENTITY_ENV]: "1" };
    expect(isOfficialIdentityAuthorized(authorized)).toBe(true);
    expect(isOfficialIdentityAuthorized({})).toBe(false);
    // 授权后沿用上游两轴语义:production → production,test → preview,显式 preview flag → preview。
    expect(resolveDesktopProductFlavor({ ...authorized, ZCODE_ENV: "production" })).toBe(
      "production",
    );
    expect(resolveDesktopProductIdentity({ ...authorized, ZCODE_ENV: "production" })).toBe(
      desktopProductIdentities.production,
    );
    expect(resolveDesktopProductFlavor({ ...authorized, ZCODE_ENV: "test" })).toBe("preview");
    expect(
      resolveDesktopProductFlavor({
        ...authorized,
        ZCODE_ENV: "production",
        ZCODE_PREVIEW_IDENTITY: "1",
      }),
    ).toBe("preview");
  });

  it("产物后缀仍只标记后端环境,身份翻转不改变 _TEST 语义", () => {
    expect(resolveDesktopArtifactSuffix({})).toBe("_TEST");
    expect(resolveDesktopArtifactSuffix({ ZCODE_ENV: "test" })).toBe("_TEST");
    expect(resolveDesktopArtifactSuffix({ ZCODE_ENV: "production" })).toBe("");
  });

  it("mae 打包态 AUMID 与安装器 appId 一致(Windows Shell 单一身份)", () => {
    expect(resolveWindowsAppUserModelIdForFlavor("mae")).toBe(MAE_IDENTITY.appId);
    expect(resolveWindowsAppUserModelId({})).toBe(MAE_IDENTITY.appId);
    expect(resolveWindowsAppUserModelId({ ZCODE_ENV: "production" })).toBe(MAE_IDENTITY.appId);
  });

  it("mae 开发态使用独立 AUMID,与官方开发态、mae 打包态三方互不混淆", () => {
    const maeDevAumid = resolveWindowsAppUserModelIdForFlavor("mae", { isPackaged: false });
    expect(maeDevAumid).toBe(MAE_DEV_APP_USER_MODEL_ID);
    expect(maeDevAumid).not.toBe("cn.aminer.zcode");
    expect(maeDevAumid).not.toBe(MAE_IDENTITY.appId);
    // 官方身份的开发态 AUMID 保持上游行为。
    expect(resolveWindowsAppUserModelIdForFlavor("production", { isPackaged: false })).toBe(
      "cn.aminer.zcode",
    );
  });

  it("shared 层接受编译期注入的 mae flavor,不再回落官方 preview", () => {
    expect(normalizeZCodeProductFlavor("mae", "production")).toBe("mae");
    expect(normalizeZCodeProductFlavor("mae", "test")).toBe("mae");
  });
});
