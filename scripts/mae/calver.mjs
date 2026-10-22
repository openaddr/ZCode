/**
 * mae CalVer 版本语义唯一所有者——specs/mae/versioning-branding.md(#11)。
 *
 * 形态:`YYYY.MMDD.PATCH`(如 2026.1022.0;同日多发 PATCH 递增)。该形态为合法
 * semver(major=年、minor=月日),electron-updater / NSIS / npm 均兼容,且
 * 时间序 = 版本序(跨年 major 递增、年内月日单调)——P3 自建更新通道直接复用
 * 本模块做版本比较,不得各自实现。
 */

const CALVER_PATTERN = /^(\d{4})\.(\d{4})\.(\d+)$/;

/** 解析 CalVer 为数值三元组 [year, mmdd, patch];非 CalVer 形态返回 null。 */
export function parseCalVer(version) {
  if (typeof version !== "string") {
    return null;
  }
  const match = CALVER_PATTERN.exec(version.trim());
  if (!match) {
    return null;
  }
  const [, yearText, mmddText, patchText] = match;
  const mmdd = Number(mmddText);
  const month = Math.floor(mmdd / 100);
  const day = mmdd % 100;
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return [Number(yearText), mmdd, Number(patchText)];
}

/** 判断字符串是否为合法 CalVer 形态。 */
export function isCalVer(version) {
  return parseCalVer(version) !== null;
}

/** 数值三元组比较:时间序 = 版本序。返回 -1/0/1。 */
export function compareCalVer(a, b) {
  const left = parseCalVer(a);
  const right = parseCalVer(b);
  if (!left || !right) {
    throw new Error(`compareCalVer: 非 CalVer 版本(a=${a}, b=${b})`);
  }
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] < right[index] ? -1 : 1;
    }
  }
  return 0;
}

/** 日期 → CalVer 日期段 `YYYY.MMDD`(以 UTC 为准,保证跨时区构建产物一致)。 */
export function formatCalVerDate(date = new Date()) {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const mmdd = `${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
  return `${year}.${mmdd}`;
}

/**
 * 计算下一个 CalVer 版本:
 * - 当前版本与给定日期同日 → PATCH + 1(同日多发递增);
 * - 不同日或当前非 CalVer → 当日 `YYYY.MMDD.0` 起步(即使当前日期段落后也对齐)。
 */
export function nextCalVer(currentVersion, date = new Date()) {
  const today = formatCalVerDate(date);
  const current = parseCalVer(currentVersion);
  if (current && `${current[0]}.${String(current[1]).padStart(4, "0")}` === today) {
    return `${today}.${current[2] + 1}`;
  }
  return `${today}.0`;
}

/**
 * 发布版本决策(release-calver 包装脚本用):
 * - 参数里首个非 flag 项 = 显式版本,必须是合法 CalVer(防止退回语义化 bump);
 * - 否则按 `nextCalVer(当前版本, 今日)` 计算(同日多发 PATCH 递增)。
 */
export function resolveReleaseVersion(args, { currentVersion, now = new Date() } = {}) {
  const explicit = args.find((arg) => !arg.startsWith("-"));
  if (explicit !== undefined) {
    if (!isCalVer(explicit)) {
      throw new Error(
        `release: 显式版本 "${explicit}" 不是 CalVer(YYYY.MMDD.PATCH,如 2026.1022.1)——` +
          "版本语义见 specs/mae/versioning-branding.md",
      );
    }
    return { version: explicit, source: "explicit" };
  }
  return { version: nextCalVer(currentVersion, now), source: "computed" };
}
