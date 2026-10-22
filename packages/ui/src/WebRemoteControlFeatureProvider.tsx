import { createContext, useContext } from "react";
import type { ReactNode } from "react";
// mae: D7 纯本地模式——feature gate 唯一所有者的消费点(#6)
import { isFeatureVisible } from "@/mae/featureGates.js";
// mae: D7 纯本地模式——手机远控默认随 gate 关闭(桌面端不传 prop 走此默认)(#6)
const DEFAULT_WEB_REMOTE_CONTROL_FEATURE_ENABLED = isFeatureVisible("web-remote-control");

const WebRemoteControlFeatureContext = createContext(
  DEFAULT_WEB_REMOTE_CONTROL_FEATURE_ENABLED,
);

export function WebRemoteControlFeatureProvider({
  enabled = DEFAULT_WEB_REMOTE_CONTROL_FEATURE_ENABLED,
  children,
}: {
  enabled?: boolean;
  children: ReactNode;
}) {
  return (
    <WebRemoteControlFeatureContext.Provider value={enabled}>
      {children}
    </WebRemoteControlFeatureContext.Provider>
  );
}

export function useWebRemoteControlFeatureEnabled(): boolean {
  return useContext(WebRemoteControlFeatureContext);
}
