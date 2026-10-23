# P2 — 版本与品牌规格

## 产品规则

- 版本采用 CalVer `YYYY.MMDD.PATCH`(如 `2026.1021.0`;同日多发时 PATCH 递增)。该形态为合法 semver(major=年、minor=月日),electron-updater / NSIS / npm 均兼容,时间序 = 版本序(跨年 major 递增,年内月日单调)。
- 上游基线进 build-meta:新增字段 `upstreamBase`(取自同步时的上游 tag/版本);关于页展示 `ZCode Mae <version> · 基于 ZCode <upstreamBase>`。
- release-it 配置 CalVer 模板(默认语义化 bump 不适用)。
- 品牌:应用图标、安装包名、关于页、`config/default.json` 替换为 mae 资产。落地记录(#12):图标为青色调 duotone 占位资产(暗端深青 `#072E2A`、亮端薄荷青 `#8CF7E7`,以官方图标为底),集中于 `packages/desktop/build/mae/`(18 个文件,覆盖 png/ico/icns/安装器/Linux hicolor 全尺寸),由 `scripts/mae/generate-mae-brand-assets.mjs` 生成并随仓库提交;electron-builder 图标路径经 `brandAssetDir` 随身份路由,运行期 dev 态经 `packages/desktop/src/main/mae/brandAssets.ts` 同路由。正式图标资产待用户提供,替换 `build/mae/` 同名文件即得。
- `config/default.json` 决策(#12):`feedback_url` 置空(与 feedback gate 双保险,空串经 sanitizeUrl 归一为 undefined);`community_urls` 两 locale 置空——纯本地个人版不导流官方社区渠道(智谱飞书群/官方 Discord 均为官方产品运营,mae 用户进去版本与支持不匹配),远端配置通道已随 #7 切断,本地兜底置空后入口点击仅记 warn 日志优雅降级。
- 同步清理文档与技能中对已裁剪官方功能的引用(AGENTS.md 纪律:删除功能时同步清理指令和技能中的引用);AGENTS.md 相关章节加 mae 状态标注(见 D6 例外条款)。落地记录(#12):AGENTS.md「规则层级」加 mae 状态标注;`.agents/skills/` 清理(zcode-large-task-fixture 数据根随身份解析+SKILL 路径说明、session-management 加 mae 状态标注);macOS dev 壳协议/身份常量随身份路由(修掉硬编码官方 `zcode` scheme 残留);Linux desktop entry `Icon=zcode` 与官方共名遗留收口为 `zcode-mae`(#10 登记遗留)。

## 状态所有者

- build-meta 生成脚本是 `upstreamBase` 的唯一写入方;mae 品牌资产集中于新增目录,不与上游资产混放。

## 验收场景

1. 安装包文件名含 CalVer 版本;关于页显示 mae 版本与上游基线双信息。
2. 版本比较正确:`2026.1021.0 < 2026.1022.0 < 2027.0101.0`(为 P3 更新通道预留的语义保证)。

## 后续项(P3,方案已备,本期不做)

- SSH/WSL 远程工作区:`stage:remote-assets` 产物托管到自建静态服务,mae 模块注入 `ZCODE_REMOTE_ASSET_CDN_BASE_URL`;官方 CDN 按官方版本号寻址,不含 mae 版本,故打包版不可直连。
- 自有账号:新增 account provider,复用现有 OAuth 深链接管道与凭据仓库(端点换自有)。
- 自建更新通道:静态 feed(latest.yml + exe + blockmap)+ `ZCODE_UPDATE_FEED_URL`;appId 保持稳定;未签名分发不配 publisherName。
- 自建插件市场源:做成可配置市场源,与官方只读源并存。
