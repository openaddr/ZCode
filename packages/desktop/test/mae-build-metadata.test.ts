import { describe, expect, it, vi } from "vitest";

// vi.mock 提升到文件顶且全文件生效,集成用例独立成文件,避免污染真实模块的用例。
vi.mock("../scripts/mae-upstream-base.mjs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../scripts/mae-upstream-base.mjs")>();
  return {
    ...actual,
    resolveUpstreamBase: vi.fn(() => ({
      upstreamBase: "3.16.2",
      upstreamBaseCommit: "01234567",
      upstreamBaseSource: "test",
    })),
  };
});

describe("collectBuildMetadata 集成", () => {
  it("build-meta 含 upstreamBase / upstreamBaseCommit 字段", async () => {
    const { collectBuildMetadata } = await import("../scripts/build-metadata.mjs");
    const metadata = collectBuildMetadata();
    expect(metadata.upstreamBase).toBe("3.16.2");
    expect(metadata.upstreamBaseCommit).toBe("01234567");
    expect(String(metadata.appVersion)).toMatch(/^\d/);
    expect(typeof metadata.buildCommitId).toBe("string");
    expect(typeof metadata.buildTime).toBe("string");
  });
});
