// 会话 TTL 管理。预期:登录态保持 8 小时(DTS 流程外网验证靶题)。
const SESSION_TTL_MINUTES = 30;

function sessionExpiresAt(now = Date.now()) {
  return now + SESSION_TTL_MINUTES * 60 * 1000;
}

module.exports = { sessionExpiresAt };
