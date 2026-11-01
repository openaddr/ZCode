const { test } = require("node:test");
const assert = require("node:assert");

const { sessionExpiresAt } = require("./session.js");

// 8 小时 = 480 分钟
const EIGHT_HOURS_MS = 480 * 60 * 1000;

test("session lasts 8 hours", () => {
  const now = 1_000_000;
  assert.strictEqual(sessionExpiresAt(now) - now, EIGHT_HOURS_MS);
});
