// createMr 输出解析(#580 内网手册):codehub-cli `--json web_url,iid` 输出顶层
// web_url;历史模板约定 url。只认 url 会把真 CLI 的成功建单误判为「输出无 MR URL」。
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CliPlatformAdapter } from "../src/adapters/platformAdapter.js";

async function mkdtempSafe(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mae-dts-flow-adapter-"));
}

describe("CliPlatformAdapter.createMr URL 解析", () => {
  it("认 web_url 键(codehub-cli --json web_url,iid)", async () => {
    const adapter = new CliPlatformAdapter(
      {
        createMr: ["node", "-e", "console.log(JSON.stringify({web_url:'https://mr.test/mr/7',iid:'7'}))"],
        mrStatus: ["node", "-e", "console.log(JSON.stringify({pipeline:'running'}))"],
      },
      await mkdtempSafe(),
      process.env["PATH"],
    );
    const created = await adapter.createMr({
      repo: "https://git.test/g/r.git",
      branch: "master_u_DTS-1",
      title: "DTS-1 修复",
      description: "",
      ticket: "DTS-1",
    });
    expect(created.url).toBe("https://mr.test/mr/7");
  });

  it("仍认 url 键(历史模板约定)", async () => {
    const adapter = new CliPlatformAdapter(
      {
        createMr: ["node", "-e", "console.log(JSON.stringify({url:'https://mr.test/pull/1'}))"],
        mrStatus: ["node", "-e", "console.log(JSON.stringify({pipeline:'running'}))"],
      },
      await mkdtempSafe(),
      process.env["PATH"],
    );
    const created = await adapter.createMr({
      repo: "https://git.test/g/r.git",
      branch: "master_u_DTS-1",
      title: "DTS-1 修复",
      description: "",
      ticket: "DTS-1",
    });
    expect(created.url).toBe("https://mr.test/pull/1");
  });

  it("两键皆缺 = fail-loud(不猜)", async () => {
    const adapter = new CliPlatformAdapter(
      {
        createMr: ["node", "-e", "console.log(JSON.stringify({iid:'7'}))"],
        mrStatus: ["node", "-e", "console.log(JSON.stringify({pipeline:'running'}))"],
      },
      await mkdtempSafe(),
      process.env["PATH"],
    );
    await expect(
      adapter.createMr({
        repo: "https://git.test/g/r.git",
        branch: "master_u_DTS-1",
        title: "DTS-1 修复",
        description: "",
        ticket: "DTS-1",
      }),
    ).rejects.toThrow(/输出无 MR URL/);
  });
});
