/**
 * DTS 问题会话直接启动器(#68,云平台「发起即开跑」同语义):建会话 → sendText 自动发
 * 首条消息(开场词/续处理词) → 由调用方导航到新会话。不走 composer 草稿、无用户确认
 * 环节;编排镜像 useSavedWorkflowLauncher,同一不变式「失败在会话存在之前」:sendText
 * 被拒即 deleteSession 收回刚建的空会话,不留孤儿。
 */
import { useCallback } from "react";

import type { CommandAck, CommandEnvelope } from "@zcode/shared/zcode-protocol-v4";
import { useOptionalServices } from "@/hooks/useServices.js";
import { logger } from "@/logger.js";
import { useZCodeSessionStore } from "@/store/zcodeSessionStore.js";
import { createCommandEnvelope } from "@/v4/commandFactory.js";
import {
  acquireWorkspaceConnection,
  type WorkspaceConnectionAgentService,
} from "@/v4/workspaceConnectionRegistry.js";

export type DtsIssueLaunchResult =
  | { ok: true; sessionId: string }
  | { ok: false; message: string };

/** 启动器依赖的传输窄面(= ConversationTransport.sendCommand 的结构化投影,便于测试注入)。 */
export interface DtsIssueLaunchTransport {
  sendCommand: (envelope: CommandEnvelope) => Promise<CommandAck>;
}

/**
 * 纯编排:建会话+发首条,被拒即回收。lease.release 由调用方 finally 负责。
 */
export async function launchDtsIssueOnTransport(
  transport: DtsIssueLaunchTransport,
  workspacePath: string,
  firstMessage: string,
): Promise<DtsIssueLaunchResult> {
  const deleteCreatedSession = (sessionId: string) => {
    void transport
      .sendCommand(createCommandEnvelope({ type: "deleteSession", payload: {}, sessionId }))
      .catch(() => {
        // 回收失败无碍:空会话随 CLI 退出消失,转写里不会出现它。
      });
  };
  let createdSessionId: string | null = null;
  try {
    const createAck = await transport.sendCommand(
      createCommandEnvelope({ type: "createSession", payload: { workspaceId: workspacePath }, sessionId: null }),
    );
    if (createAck.status !== "accepted" || createAck.result?.type !== "createSession") {
      logger.warn("[dts-issue-launch] createSession 被拒", {
        workspacePath,
        status: createAck.status,
        reasonCode: createAck.reasonCode ?? null,
      });
      return { ok: false, message: createAck.message ?? createAck.reasonCode ?? createAck.status };
    }
    createdSessionId = createAck.result.sessionId ?? null;
    if (createdSessionId === null) {
      return { ok: false, message: "createSession 响应缺少 sessionId" };
    }

    const sendAck = await transport.sendCommand(
      createCommandEnvelope({ type: "sendText", payload: { text: firstMessage }, sessionId: createdSessionId }),
    );
    if (sendAck.status !== "accepted") {
      deleteCreatedSession(createdSessionId);
      logger.warn("[dts-issue-launch] sendText 被拒,回收空会话", {
        sessionId: createdSessionId,
        status: sendAck.status,
        reasonCode: sendAck.reasonCode ?? null,
      });
      return { ok: false, message: sendAck.message ?? sendAck.reasonCode ?? sendAck.status };
    }
    return { ok: true, sessionId: createdSessionId };
  } catch (thrown) {
    if (createdSessionId) deleteCreatedSession(createdSessionId);
    return { ok: false, message: thrown instanceof Error ? thrown.message : String(thrown) };
  }
}

export function useDtsIssueLauncher(): (
  workspacePath: string,
  firstMessage: string,
) => Promise<DtsIssueLaunchResult> {
  // 可选解析:壳层可能在无 ServiceProvider 的环境渲染(裸测试壳),启动时才需要服务。
  const services = useOptionalServices();
  return useCallback(
    async (workspacePath: string, firstMessage: string): Promise<DtsIssueLaunchResult> => {
      if (services === null) {
        return { ok: false, message: "服务未就绪(ServiceProvider 缺席)" };
      }
      const lease = acquireWorkspaceConnection(
        { workspacePath },
        services.zcodeAgentService as WorkspaceConnectionAgentService,
      );
      try {
        return await launchDtsIssueOnTransport(lease.transport, workspacePath, firstMessage);
      } finally {
        lease.release();
      }
    },
    [services],
  );
}

/** 纯编排:向既有会话发续聊文本(转向/排队由协议层裁决),被拒原因透出。 */
export async function sendDtsSessionTextOnTransport(
  transport: DtsIssueLaunchTransport,
  sessionId: string,
  text: string,
): Promise<DtsIssueLaunchResult> {
  try {
    const ack = await transport.sendCommand(
      createCommandEnvelope({ type: "sendText", payload: { text }, sessionId }),
    );
    if (ack.status !== "accepted") {
      logger.warn("[dts-issue-launch] 续聊 sendText 被拒", {
        sessionId,
        status: ack.status,
        reasonCode: ack.reasonCode ?? null,
      });
      return { ok: false, message: ack.message ?? ack.reasonCode ?? ack.status };
    }
    return { ok: true, sessionId };
  } catch (thrown) {
    return { ok: false, message: thrown instanceof Error ? thrown.message : String(thrown) };
  }
}

/**
 * 向问题工作区的既有会话发文本(云平台「平台泵续回合」同语义,#68):确认闸放行/打回后
 * 由 UI 代发续聊词,Agent 不因闸停摆。目标=该工作区活动会话(处理阶段块只存在于活动
 * 会话窗格);缺席(会话已关闭)如实报不静默。
 */
export function useDtsIssueSessionSender(): (
  workspacePath: string,
  text: string,
) => Promise<DtsIssueLaunchResult> {
  const services = useOptionalServices();
  return useCallback(
    async (workspacePath: string, text: string): Promise<DtsIssueLaunchResult> => {
      if (services === null) {
        return { ok: false, message: "服务未就绪(ServiceProvider 缺席)" };
      }
      const state = useZCodeSessionStore.getState().getWorkspaceState(workspacePath);
      const liveTask = state.taskListCache?.find((task) => task.status === "running");
      const sessionId = state.activeTaskId ?? liveTask?.taskId ?? null;
      if (sessionId === null) {
        return { ok: false, message: "该工作区没有活动会话" };
      }
      const lease = acquireWorkspaceConnection(
        { workspacePath },
        services.zcodeAgentService as WorkspaceConnectionAgentService,
      );
      try {
        return await sendDtsSessionTextOnTransport(lease.transport, sessionId, text);
      } finally {
        lease.release();
      }
    },
    [services],
  );
}
