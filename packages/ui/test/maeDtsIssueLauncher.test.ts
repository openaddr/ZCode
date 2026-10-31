// 发起即开跑编排不变式(#68):createSession+sendText 全成才算发起成功;
// 任一环被拒/抛错即回收空会话、返回失败原因——「失败在会话存在之前」。
import type { CommandAck, CommandEnvelope } from "@zcode/shared/zcode-protocol-v4";
import { describe, expect, it } from "vitest";
import { launchDtsIssueOnTransport, type DtsIssueLaunchTransport } from "@/mae/dts/useDtsIssueLauncher.js";

function fakeTransport(overrides: {
  createStatus?: string;
  createResultType?: string;
  createSessionId?: string;
  sendStatus?: string;
  sendReject?: Error;
} = {}): DtsIssueLaunchTransport & { commands: Array<{ type: string; sessionId: string | null }> } {
  const commands: Array<{ type: string; sessionId: string | null }> = [];
  return {
    commands,
    async sendCommand(envelope: CommandEnvelope): Promise<CommandAck> {
      commands.push({ type: envelope.type, sessionId: envelope.sessionId });
      if (envelope.type === "createSession") {
        return {
          status: (overrides.createStatus ?? "accepted") as CommandAck["status"],
          result: {
            type: overrides.createResultType ?? "createSession",
            sessionId: overrides.createSessionId ?? "session-1",
          } as CommandAck["result"],
        };
      }
      if (envelope.type === "sendText") {
        if (overrides.sendReject) throw overrides.sendReject;
        return { status: (overrides.sendStatus ?? "accepted") as CommandAck["status"] };
      }
      return { status: "accepted" };
    },
  } as DtsIssueLaunchTransport & { commands: Array<{ type: string; sessionId: string | null }> };
}

describe("launchDtsIssueOnTransport", () => {
  it("全成:建会话→发首条,返回 ok+sessionId", async () => {
    const transport = fakeTransport();
    const result = await launchDtsIssueOnTransport(transport, "C:/ws/DTS-1", "开场词");
    expect(result).toEqual({ ok: true, sessionId: "session-1" });
    expect(transport.commands.map((command) => command.type)).toEqual(["createSession", "sendText"]);
    expect(transport.commands[1]?.sessionId).toBe("session-1");
  });

  it("createSession 被拒:不发首条、不留会话", async () => {
    const transport = fakeTransport({ createStatus: "rejected", createResultType: "rejected" });
    const result = await launchDtsIssueOnTransport(transport, "C:/ws/DTS-1", "开场词");
    expect(result).toEqual({ ok: false, message: "rejected" });
    expect(transport.commands.map((command) => command.type)).toEqual(["createSession"]);
  });

  it("sendText 被拒:deleteSession 回收空会话", async () => {
    const transport = fakeTransport({ sendStatus: "rejected" });
    const result = await launchDtsIssueOnTransport(transport, "C:/ws/DTS-1", "开场词");
    expect(result).toEqual({ ok: false, message: "rejected" });
    expect(transport.commands.map((command) => command.type)).toEqual([
      "createSession",
      "sendText",
      "deleteSession",
    ]);
  });

  it("sendText 抛错:同样回收空会话,原因透出", async () => {
    const transport = fakeTransport({ sendReject: new Error("连接中断") });
    const result = await launchDtsIssueOnTransport(transport, "C:/ws/DTS-1", "开场词");
    expect(result).toEqual({ ok: false, message: "连接中断" });
    expect(transport.commands.map((command) => command.type)).toEqual([
      "createSession",
      "sendText",
      "deleteSession",
    ]);
  });
});
