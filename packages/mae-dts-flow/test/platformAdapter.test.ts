// 具名平台适配器单测(ADR-0002):github/codehub 两实现 + 纯映射函数。
// 全部经 exec port 注入假执行器,不触真实 CLI;形状=平台生产配置与 #580 内网手册实证。
import { describe, expect, it } from "vitest";

import {
  CodehubCliPlatformAdapter,
  GithubPlatformAdapter,
  createPlatformAdapter,
  mapChecks,
  mapPipelineStatus,
  mapPrState,
  parseMrUrl,
  pickLatestRun,
  type CliExec,
} from "../src/adapters/platformAdapter.js";

const isCreate = (command: string[]) => command.slice(0, 3).join(" ") === "codehub-cli mr create";
const isList = (command: string[]) => command.slice(0, 3).join(" ") === "codehub-cli mr list";

const CREATE_INPUT = {
  repo: "https://codehub-y.huawei.com/org/repo.git",
  branch: "master_ning_DTS-2026-1001",
  title: "DTS-2026-1001 修复",
  description: "",
  ticket: "DTS-2026-1001",
};

describe("CodehubCliPlatformAdapter.createMr(先查后建)", () => {
  it("查无已开 MR → 建,目标分支从分支名约定解析,输出认 web_url", async () => {
    const seen: string[][] = [];
    const adapter = new CodehubCliPlatformAdapter({
      binDir: "x",
      exec: async (command) => {
        seen.push(command);
        if (isList(command)) return "[]";
        if (isCreate(command)) {
          return JSON.stringify({ web_url: "https://codehub-y.huawei.com/org/repo/merge_requests/7" });
        }
        throw new Error(`未预期命令: ${command.join(" ")}`);
      },
    });
    const created = await adapter.createMr(CREATE_INPUT);
    expect(created.url).toBe("https://codehub-y.huawei.com/org/repo/merge_requests/7");
    const createCommand = seen.find(isCreate);
    expect(createCommand).toBeDefined();
    expect(createCommand?.[createCommand.indexOf("--target-branch") + 1]).toBe("master");
    expect(createCommand?.[createCommand.indexOf("--e2e-issues") + 1]).toBe("DTS-2026-1001");
  });

  it("同分支对已有 opened MR → 复用其 URL,不盲建(CodeHub 幂等语义不统一,平台纪律)", async () => {
    const adapter = new CodehubCliPlatformAdapter({
      binDir: "x",
      exec: async (command) => {
        if (isList(command)) {
          return JSON.stringify([{ web_url: "https://codehub-y.huawei.com/org/repo/merge_requests/9", iid: "9" }]);
        }
        throw new Error("查到已开 MR 时不得走到创建");
      },
    });
    const created = await adapter.createMr(CREATE_INPUT);
    expect(created.url).toBe("https://codehub-y.huawei.com/org/repo/merge_requests/9");
  });

  it("查询单失败放行到创建;创建输出无 URL fail-loud", async () => {
    const adapter = new CodehubCliPlatformAdapter({
      binDir: "x",
      exec: async (command) => {
        if (isList(command)) throw new Error("list 挂了");
        return JSON.stringify({ iid: "7" });
      },
    });
    await expect(adapter.createMr(CREATE_INPUT)).rejects.toThrow(/输出无 MR URL/);
  });

  it("分支名不含目标分支段 → fail-loud(不猜 target)", async () => {
    const adapter = new CodehubCliPlatformAdapter({
      binDir: "x",
      exec: async () => "[]",
    });
    await expect(adapter.createMr({ ...CREATE_INPUT, branch: "weirdbranch" })).rejects.toThrow(/目标分支/);
  });
});

describe("CodehubCliPlatformAdapter.pipelineStatus", () => {
  it("MR URL 解析出 project+iid;多条 run 取 id 最大;空数组=running", async () => {
    const adapter = new CodehubCliPlatformAdapter({
      binDir: "x",
      exec: async (command) => {
        expect(command[3]).toBe("12");
        expect(command[command.indexOf("-p") + 1]).toBe("org/repo");
        expect(command).toContain("--no-cache");
        return JSON.stringify([
          { id: "9", status: "failed" },
          { id: "12", status: "success" },
        ]);
      },
    });
    expect(await adapter.pipelineStatus("https://codehub-y.huawei.com/org/repo/merge_requests/12")).toBe("green");

    const empty = new CodehubCliPlatformAdapter({ binDir: "x", exec: async () => "[]" });
    expect(await empty.pipelineStatus("https://codehub-y.huawei.com/org/repo/merge_requests/1")).toBe("running");
  });

  it("认不出的状态词 fail-loud(拒绝猜测);URL 解析不动 fail-loud", async () => {
    const adapter = new CodehubCliPlatformAdapter({
      binDir: "x",
      exec: async () => JSON.stringify([{ id: "1", status: "mysterious" }]),
    });
    await expect(adapter.pipelineStatus("https://codehub-y.huawei.com/org/repo/merge_requests/1")).rejects.toThrow(/拒绝猜测/);
    const badUrl = new CodehubCliPlatformAdapter({ binDir: "x", exec: async () => "[]" });
    await expect(badUrl.pipelineStatus("https://mr.test/pull/1")).rejects.toThrow(/解析不动/);
  });
});

describe("状态映射(与平台 status_map 一字对应)", () => {
  it("success=green;failed/canceled/skipped=red;running/created/pending/manual=running;未知=抛", () => {
    expect(mapPipelineStatus("success")).toBe("green");
    expect(mapPipelineStatus("failed")).toBe("red");
    expect(mapPipelineStatus("canceled")).toBe("red");
    expect(mapPipelineStatus("skipped")).toBe("red");
    expect(mapPipelineStatus("running")).toBe("running");
    expect(mapPipelineStatus("created")).toBe("running");
    expect(mapPipelineStatus("pending")).toBe("running");
    expect(mapPipelineStatus("manual")).toBe("running");
    expect(() => mapPipelineStatus("mysterious")).toThrow(/拒绝猜测/);
  });

  it("parseMrUrl 兼容 /-/merge_requests 与查询串;解析不动=null", () => {
    expect(parseMrUrl("https://codehub-y.huawei.com/a%20b/repo/-/merge_requests/7?tab=diff"))
      .toEqual({ project: "a b/repo", iid: "7" });
    expect(parseMrUrl("https://mr.test/pull/1")).toBeNull();
  });

  it("pickLatestRun:数值 id 最大者;多 run 缺 id 抛;单 run 无 id 接受;空=null", () => {
    expect(pickLatestRun([{ id: "9", status: "failed" }, { id: "12", status: "success" }])).toEqual({ status: "success" });
    expect(pickLatestRun([])).toBeNull();
    expect(() => pickLatestRun([{ status: "success" }, { id: "3", status: "failed" }])).toThrow(/无法判最新/);
    expect(pickLatestRun([{ status: "success" }])).toEqual({ status: "success" });
  });
});

describe("GithubPlatformAdapter", () => {
  it("createMr:先查后建——无 open PR 才建,gh pr create 输出末行 URL", async () => {
    const calls: string[][] = [];
    const adapter = new GithubPlatformAdapter({
      binDir: "x",
      exec: async (command) => {
        calls.push(command);
        if (command[2] === "list") return "[]";
        expect(command.slice(0, 3)).toEqual(["gh", "pr", "create"]);
        expect(command[command.indexOf("--head") + 1]).toBe("master_ning_x");
        return "Creating pull request for branch...\nhttps://github.com/openaddr/mae-dts-fixture/pull/2\n";
      },
    });
    const created = await adapter.createMr({
      repo: "openaddr/mae-dts-fixture",
      branch: "master_ning_x",
      title: "t",
      description: "d",
      ticket: "DTS-1",
    });
    expect(created.url).toBe("https://github.com/openaddr/mae-dts-fixture/pull/2");
    expect(calls.some((command) => command[2] === "list")).toBe(true);
    expect(calls.some((command) => command[2] === "create")).toBe(true);

    const bad = new GithubPlatformAdapter({ binDir: "x", exec: async () => "gh: request failed" });
    await expect(bad.createMr({ repo: "r", branch: "b", title: "t", description: "", ticket: "T" })).rejects.toThrow(/无 PR URL/);
  });

  it("先查后建:同 head 分支已有 open PR → 复用其 URL,不重建(部分失败重试不撞 already exists)", async () => {
    const adapter = new GithubPlatformAdapter({
      binDir: "x",
      exec: async (command) => {
        if (command[2] === "list") {
          expect(command).toContain("master_ning_x");
          return JSON.stringify([{ url: "https://github.com/openaddr/mae-dts-fixture/pull/2" }]);
        }
        throw new Error("查到 open PR 时不得走到创建");
      },
    });
    const created = await adapter.createMr({ repo: "openaddr/mae-dts-fixture", branch: "master_ning_x", title: "t", description: "", ticket: "T" });
    expect(created.url).toBe("https://github.com/openaddr/mae-dts-fixture/pull/2");
  });

  it("pipelineStatus:MERGED/CLOSED 直接裁决;否则 checks rollup 映射", async () => {
    const adapter = new GithubPlatformAdapter({
      binDir: "x",
      exec: async (command) => {
        expect(command.slice(0, 3)).toEqual(["gh", "pr", "view"]);
        expect(command).toContain("state,statusCheckRollup");
        return JSON.stringify({ state: "OPEN", statusCheckRollup: [{ conclusion: "SUCCESS" }, { conclusion: "FAILURE" }] });
      },
    });
    expect(await adapter.pipelineStatus("https://github.com/o/r/pull/1")).toBe("red");
    expect(mapPrState("MERGED")).toBe("green");
    expect(mapPrState("CLOSED")).toBe("red");
    expect(mapPrState("OPEN")).toBe("running");
    expect(mapChecks([])).toBe("running");
    expect(mapChecks([{ conclusion: "SUCCESS" }, { state: "NEUTRAL" }])).toBe("green");
    expect(mapChecks([{ conclusion: "TIMED_OUT" }])).toBe("red");
    expect(mapChecks([{ conclusion: "SUCCESS" }, { conclusion: "PENDING" }])).toBe("running");
  });
});

describe("createPlatformAdapter 三选一", () => {
  it("mock/github/codehub 各返回对应实现", () => {
    expect(createPlatformAdapter({ platform: "mock", binDir: "x" }).createMr).toBeTypeOf("function");
    expect(createPlatformAdapter({ platform: "github", binDir: "x" })).toBeInstanceOf(GithubPlatformAdapter);
    expect(createPlatformAdapter({ platform: "codehub", binDir: "x" })).toBeInstanceOf(CodehubCliPlatformAdapter);
  });
});
