/**
 * mae:mae-identity.mjs 的手写声明(与 desktop-product-identity.d.mts 同一约定:
 * 仓库未开启 allowJs,main 侧与配置文件导入本模块时靠本文件获得类型)。
 */
export type MaeProductFlavor = "mae";

export interface MaeProductIdentity {
  readonly flavor: MaeProductFlavor;
  readonly appId: string;
  readonly productName: string;
  readonly linuxExecutableName: string;
  readonly linuxPackageName: string;
  readonly cuaHelperInstallVariant: "mae";
}

export const ZCODE_ALLOW_OFFICIAL_IDENTITY_ENV: "ZCODE_ALLOW_OFFICIAL_IDENTITY";
export const MAE_IDENTITY: MaeProductIdentity;
export const MAE_DEV_APP_USER_MODEL_ID: string;
export const MAE_APPLICATION_NAME: "ZCode Mae";
export const MAE_DEV_APPLICATION_NAME: "ZCode Mae Dev";
export const MAE_CUA_HELPER_INSTALL_VARIANT: "mae";

export function isOfficialIdentityAuthorized(
  env?: Record<string, string | undefined>,
): boolean;
export function resolveMaeAwareProductFlavor(
  env: Record<string, string | undefined>,
  facts: {
    isPreviewRequested: boolean;
    officialFlavor: "production" | "preview";
  },
): "mae" | "production" | "preview";
/** 运行名链:mae 身份 ZCode Mae / 开发态 ZCode Mae Dev;官方身份保留上游命名。 */
export function resolveMaeRuntimeApplicationName(options: {
  isLocalDevelopmentRuntime: boolean;
  productFlavor: "mae" | "production" | "preview";
}): string;
