/**
 * mae 关于页上游基线展示(#11)——specs/mae/versioning-branding.md。
 *
 * "ZCode Mae <version> · 基于 ZCode <upstreamBase>" 双信息中的上游基线行:
 * 展示文案与留空策略的唯一所有者;about.ts / aboutWindow.ts 只做薄挂接。
 * unknown(开发态/jj workspace 无 git 等场景)不渲染半截文案,留空即可。
 */

import { DEFAULT_LOCALE, type Locale } from "@zcode/shared";

const UPSTREAM_BASE_LABELS: Record<Locale, string> = {
  "zh-CN": "基于 ZCode",
  "en-US": "Based on ZCode",
};

/** 生成关于页上游基线展示行;基线未知时返回空串(调用方按空串隐藏整行)。 */
export function formatUpstreamBaseLine(
  upstreamBase: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const trimmed = upstreamBase.trim();
  if (trimmed.length === 0 || trimmed === "unknown") {
    return "";
  }
  return `${UPSTREAM_BASE_LABELS[locale] ?? UPSTREAM_BASE_LABELS[DEFAULT_LOCALE]} ${trimmed}`;
}
