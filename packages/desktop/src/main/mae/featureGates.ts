/**
 * mae feature gates —— Electron main 侧禁用清单(渲染侧唯一所有者的对应物)。
 *
 * 规格:specs/mae/feature-gates.md(D7 纯本地模式,issue #6)。
 * main 侧只消费深链接路由等无 UI 的入口;清单与渲染侧
 * packages/ui/src/mae/featureGates.ts 保持一致(测试互锁,改一处必须同步另一处)。
 */
export const DESKTOP_MAE_FEATURE_KEYS = [
  "account-login",
  "coding-plan",
  "session-share",
  "off-peak-tasks",
  "feedback",
  "marketing-banner",
  "rewards",
  "web-remote-control",
  "bots",
  "remote-workspace",
] as const;

export type DesktopMaeFeatureKey = (typeof DESKTOP_MAE_FEATURE_KEYS)[number];

export const DESKTOP_DISABLED_FEATURES: ReadonlySet<DesktopMaeFeatureKey> = new Set(
  DESKTOP_MAE_FEATURE_KEYS,
);

/** 查询特性是否被 mae 禁用;main 侧入口(如 share import 深链接)据此直接忽略请求。 */
export function isDesktopFeatureDisabled(feature: DesktopMaeFeatureKey): boolean {
  return DESKTOP_DISABLED_FEATURES.has(feature);
}
