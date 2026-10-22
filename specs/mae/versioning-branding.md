# P2 — 版本与品牌规格

## 产品规则

- 版本采用 CalVer `YYYY.MMDD.PATCH`(如 `2026.1021.0`;同日多发时 PATCH 递增)。该形态为合法 semver(major=年、minor=月日),electron-updater / NSIS / npm 均兼容,时间序 = 版本序(跨年 major 递增,年内月日单调)。
- 上游基线进 build-meta:新增字段 `upstreamBase`(取自同步时的上游 tag/版本);关于页展示 `ZCode Mae <version> · 基于 ZCode <upstreamBase>`。
- release-it 配置 CalVer 模板(默认语义化 bump 不适用)。
- 品牌:应用图标、安装包名、关于页、`config/default.json`(反馈入口隐藏;社区链接去留待定)替换为 mae 资产。
- 同步清理文档与技能中对已裁剪官方功能的引用(AGENTS.md 纪律:删除功能时同步清理指令和技能中的引用);AGENTS.md 相关章节加 mae 状态标注(见 D6 例外条款)。

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
