/**
 * mae 产品身份(构建期唯一出口)——specs/mae/identity-isolation.md、specs/mae/README.md D10/D14。
 *
 * 本文件是 mae fork 的自有新增文件,不与上游合并冲突;上游 desktop-product-identity.mjs
 * 只做 ≤10 行薄挂接(委托本模块)。规则:
 * - 默认身份翻转为 mae(D14):任何构建路径、任何 ZCODE_ENV,未显式授权时一律产出 mae 身份。
 * - 官方(production/preview)身份仅在显式 `ZCODE_ALLOW_OFFICIAL_IDENTITY=1` 时可解析;
 *   未授权却显式请求官方身份(如 `ZCODE_PREVIEW_IDENTITY=1`)时构建期直接抛错。
 * - 身份轴与 ZCODE_ENV 轴正交:ZCODE_ENV 只决定后端环境与产物 _TEST 后缀,不再决定身份。
 */
import { homedir } from "node:os";
import { join } from "node:path";

/** 授权开关:允许解析官方(production/preview)身份的唯一钥匙(值固定拼写 `1`)。 */
export const ZCODE_ALLOW_OFFICIAL_IDENTITY_ENV = "ZCODE_ALLOW_OFFICIAL_IDENTITY";

/** mae 身份常量(specs/mae/README.md D10 命名定稿)。 */
export const MAE_IDENTITY = Object.freeze({
  flavor: "mae",
  appId: "dev.zcode-mae.app",
  productName: "ZCode Mae",
  linuxExecutableName: "zcode-mae",
  linuxPackageName: "zcode-mae",
  cuaHelperInstallVariant: "mae",
});

/** 开发态 AUMID:与打包态 appId、官方开发态 AUMID 三方互不混淆(D10「开发态 ZCode Mae Dev」)。 */
export const MAE_DEV_APP_USER_MODEL_ID = "dev.zcode-mae.app.dev";

/** mae 运行期应用名(打包态)。 */
export const MAE_APPLICATION_NAME = "ZCode Mae";
/** mae 运行期应用名(开发态)。 */
export const MAE_DEV_APPLICATION_NAME = "ZCode Mae Dev";
/** mae 的 Computer Use Helper 安装变体(与 production/preview 的运行组件目录隔离)。 */
export const MAE_CUA_HELPER_INSTALL_VARIANT = "mae";

export function isOfficialIdentityAuthorized(env = process.env) {
  return env[ZCODE_ALLOW_OFFICIAL_IDENTITY_ENV]?.trim() === "1";
}

/**
 * mae 感知的产品身份路由(D14 默认翻转 + 授权守卫)。
 *
 * 上游 desktop-product-identity.mjs 把自己解析出的事实(isPreviewRequested / officialFlavor)
 * 传入本函数,避免本模块反向依赖上游造成循环引用。语义:
 * - 未授权:`ZCODE_PREVIEW_IDENTITY=1` 是唯一的身份轴显式官方请求,直接抛错(防误产守卫);
 *   其余一切(含 ZCODE_ENV=production)默认回落 mae 身份。
 * - 已授权:完全沿用上游官方 flavor 语义(ZCODE_ENV=production → production,test → preview,
 *   ZCODE_PREVIEW_IDENTITY=1 → preview),供对照调试。
 */
export function resolveMaeAwareProductFlavor(env, { isPreviewRequested, officialFlavor }) {
  if (!isOfficialIdentityAuthorized(env)) {
    if (isPreviewRequested) {
      throw new Error(
        `refusing to build official "${officialFlavor}" identity: set ${ZCODE_ALLOW_OFFICIAL_IDENTITY_ENV}=1 to explicitly allow it, ` +
          "or unset ZCODE_PREVIEW_IDENTITY to build the default mae identity (specs/mae/identity-isolation.md)",
      );
    }
    return MAE_IDENTITY.flavor;
  }
  return officialFlavor;
}

/**
 * 运行名链:安装身份(构建侧)与运行身份(运行侧)同一 patch 联动(specs/mae/identity-isolation.md)。
 * Electron userData/sessionData 与单实例锁随应用名自动隔离,因此运行名必须与安装 productName 同时切换。
 *
 * - mae 身份:开发态 `ZCode Mae Dev`,打包态 `ZCode Mae`;
 * - 官方身份(仅显式授权构建可出现):保留上游语义(`ZCode Dev` / `ZCode Preview` / `ZCode`),
 *   官方开发态与 mae 开发态互不混淆。
 */
export function resolveMaeRuntimeApplicationName({ isLocalDevelopmentRuntime, productFlavor }) {
  if (productFlavor === MAE_IDENTITY.flavor) {
    return isLocalDevelopmentRuntime ? MAE_DEV_APPLICATION_NAME : MAE_APPLICATION_NAME;
  }
  return isLocalDevelopmentRuntime
    ? "ZCode Dev"
    : productFlavor === "preview"
      ? "ZCode Preview"
      : "ZCode";
}

/**
 * mae 业务数据根(specs/mae/identity-isolation.md、specs/mae/README.md D10/D3,issue #9):
 * 数据基目录 `~/.zcode-mae`,业务数据落 `~/.zcode-mae/.zcode`,与官方 `~/.zcode` 零交集。
 */
export const MAE_DATA_BASE_DIR_NAME = ".zcode-mae";

/** mae 数据基目录:与 services/paths.ts 同源的 HOME→os.homedir() 兜底链上拼 .zcode-mae。 */
export function resolveMaeDataBaseDir(env = process.env) {
  return join(env.HOME?.trim() || homedir(), MAE_DATA_BASE_DIR_NAME);
}

/**
 * mae 数据根启动决策(issue #9):
 * - mae 身份(开发态与打包态同样生效)→ 返回 `~/.zcode-mae`,由 mae 启动路径显式
 *   `setDataBaseDir()` 设定(编程接口优先级高于环境变量,不依赖 env 透传);
 * - 显式 `ZCODE_DATA_BASE_DIR` 是保留覆盖轴:上游 e2e(wdio)与 CLI 调试靠它重定向数据根,
 *   mae 不劫持显式覆盖,避免测试与联调数据落错目录;
 * - 官方身份(显式授权构建才可出现)→ 返回 null,完全保留上游数据根语义。
 */
export function resolveMaeDataRootBootstrap(productFlavor, env = process.env) {
  if (productFlavor !== MAE_IDENTITY.flavor) {
    return null;
  }
  if (env.ZCODE_DATA_BASE_DIR?.trim()) {
    return null;
  }
  return resolveMaeDataBaseDir(env);
}
