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
/** mae 业务数据基目录名(D10:~/.zcode-mae,其下 .zcode 与官方 ~/.zcode 零交集)。 */
export const MAE_DATA_BASE_DIR_NAME: ".zcode-mae";
/** mae 数据基目录:HOME→os.homedir() 兜底链上拼 .zcode-mae。 */
export function resolveMaeDataBaseDir(env?: Record<string, string | undefined>): string;
/**
 * mae 数据根启动决策(#9):mae 身份且无显式 ZCODE_DATA_BASE_DIR 覆盖时返回 ~/.zcode-mae,
 * 官方身份或显式覆盖时返回 null(保留上游语义)。
 */
export function resolveMaeDataRootBootstrap(
  productFlavor: string,
  env?: Record<string, string | undefined>,
): string | null;
