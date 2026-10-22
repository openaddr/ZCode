/**
 * mae 用户级 home 统一 resolver(specs/mae/identity-isolation.md、specs/mae/README.md D3/D10,工单 #25)。
 *
 * hooksService/mcpSyncService 等用户内容轴的用户级 `.zcode`/`.agents` 配置基目录解析:
 * `ZCODE_DESKTOP_HOME_DIR → HOME → USERPROFILE`(空白值跳过),与 settingService 的
 * 既有解析链同源(上游语义:独立桌面 Dev 实例的显式 home 覆盖优先)。
 *
 * - mae 身份:desktopDataBaseDirBootstrap 启动早期注入 `ZCODE_DESKTOP_HOME_DIR`
 *   为 mae 数据根 `~/.zcode-mae` 并透传 Host,挂本 resolver 的服务用户级配置
 *   随之落 mae 数据树(`~/.zcode-mae/.zcode/...`),与官方 `~/.zcode` 零交集;
 * - 官方身份(显式授权构建):bootstrap 不注入覆盖,resolver 返回真实 HOME,
 *   上游行为原样;
 * - env 全缺失时返回 undefined,由调用方以 `os.homedir()` 兜底——本模块为
 *   architecture-policy 的 domain 层,不得依赖 node:*(domain-io);
 * - 纯函数:不读盘、无副作用;同一 env 输入永远同一结果。
 */
export function resolveMaeAwareUserHomeDir(env: {
  ZCODE_DESKTOP_HOME_DIR?: string;
  HOME?: string;
  USERPROFILE?: string;
} = process.env): string | undefined {
  return (
    env.ZCODE_DESKTOP_HOME_DIR?.trim() ||
    env.HOME?.trim() ||
    env.USERPROFILE?.trim() ||
    undefined
  );
}
