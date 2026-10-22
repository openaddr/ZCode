import { describe, expect, it } from "vitest";
import {
  ZCODE_UPSTREAM_BASE_COMMIT_ENV,
  ZCODE_UPSTREAM_BASE_ENV,
  resolveUpstreamBase,
} from "../scripts/mae-upstream-base.mjs";

function fakeGit(script) {
  // 返回 [命令 → 输出] 映射;未命中的命令抛错,模拟引用/提交不存在
  return (command) => {
    for (const [fragment, output] of Object.entries(script)) {
      if (command.includes(fragment)) {
        return output;
      }
    }
    throw new Error(`git command failed: ${command}`);
  };
}

describe("resolveUpstreamBase", () => {
  it("显式 env 覆盖优先(无 .git 环境/jj workspace 的唯一可靠来源)", () => {
    const result = resolveUpstreamBase(
      { [ZCODE_UPSTREAM_BASE_ENV]: "3.16.2", [ZCODE_UPSTREAM_BASE_COMMIT_ENV]: "deadbeef" },
      "/fake/cwd",
      () => {
        throw new Error("不应触达 git");
      },
    );
    expect(result).toEqual({
      upstreamBase: "3.16.2",
      upstreamBaseCommit: "deadbeef",
      upstreamBaseSource: "env",
    });
  });

  it("upstream 远程优先:merge-base 提交上的根 package.json 版本即基线", () => {
    const runGit = fakeGit({
      "merge-base HEAD refs/remotes/upstream/main": "0123456789abcdef",
      "show 0123456789abcdef:package.json": '{\n  "version": "3.16.2"\n}\n',
      "rev-parse --short=8 0123456789abcdef": "01234567",
    });
    const result = resolveUpstreamBase({}, "/fake/cwd", runGit);
    expect(result).toEqual({
      upstreamBase: "3.16.2",
      upstreamBaseCommit: "01234567",
      upstreamBaseSource: "refs/remotes/upstream/main",
    });
  });

  it("upstream 缺失时回落 origin/main 镜像(openaddr fork 的上游同步点)", () => {
    const runGit = fakeGit({
      "merge-base HEAD refs/remotes/origin/main": "abcdef0123456789",
      "show abcdef0123456789:package.json": '{"version":"3.15.1"}',
      "rev-parse --short=8 abcdef0123456789": "abcdef01",
    });
    const result = resolveUpstreamBase({}, "/fake/cwd", runGit);
    expect(result).toEqual({
      upstreamBase: "3.15.1",
      upstreamBaseCommit: "abcdef01",
      upstreamBaseSource: "refs/remotes/origin/main",
    });
  });

  it("基线 package.json 无版本时换下一个候选引用", () => {
    const runGit = fakeGit({
      "merge-base HEAD refs/remotes/upstream/main": "0000000000000000",
      "show 0000000000000000:package.json": '{"name":"broken"}',
      "merge-base HEAD refs/remotes/origin/main": "1111111111111111",
      "show 1111111111111111:package.json": '{"version":"3.16.0"}',
      "rev-parse --short=8 1111111111111111": "11111111",
    });
    const result = resolveUpstreamBase({}, "/fake/cwd", runGit);
    expect(result.upstreamBase).toBe("3.16.0");
    expect(result.upstreamBaseSource).toBe("refs/remotes/origin/main");
  });

  it("全部来源失败时回落 unknown(jj workspace 无 .git 等)", () => {
    const result = resolveUpstreamBase({}, "/fake/cwd", () => {
      throw new Error("no git");
    });
    expect(result).toEqual({
      upstreamBase: "unknown",
      upstreamBaseCommit: "unknown",
      upstreamBaseSource: "none",
    });
  });
});
