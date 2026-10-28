/**
 * mae-dts-flow 模块清单(architecture-governance managed 模块)。
 * 层:domain/app/adapters。修改 requires 时同步更新 architecture-policy.yaml(检查器会校验两者一致)。
 */
export const maeDtsFlowModule = {
  id: "mae-dts-flow",
  requires: [],
  provides: ["mae-dts-flow"],
  publicEntrypoints: ["index.ts", "contract.ts"],
} as const;
