/**
 * mae feature gates —— 渲染侧禁用清单的唯一所有者。
 *
 * 规格:specs/mae/feature-gates.md(D7 纯本地模式,issue #6)。
 * 十类云端功能禁用且入口隐藏(不渲染、不置灰);各入口点一行引用本模块,
 * 组件内禁止散布判断。清单静态写死:mae 不提供运行时开关,需要临时放开时改这里。
 *
 * main 进程对应物:packages/desktop/src/main/mae/featureGates.ts(两份清单必须同步)。
 */
export const MAE_FEATURE_KEYS = [
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

export type MaeFeatureKey = (typeof MAE_FEATURE_KEYS)[number];

const DISABLED_FEATURES: ReadonlySet<MaeFeatureKey> = new Set(MAE_FEATURE_KEYS);

/** 查询特性是否被 mae 禁用;禁用即隐藏入口,不是置灰。 */
export function isFeatureDisabled(feature: MaeFeatureKey): boolean {
  return DISABLED_FEATURES.has(feature);
}

/** isFeatureDisabled 的语义化反向:入口渲染条件用它,保持读作“可见才渲染”。 */
export function isFeatureVisible(feature: MaeFeatureKey): boolean {
  return !isFeatureDisabled(feature);
}
