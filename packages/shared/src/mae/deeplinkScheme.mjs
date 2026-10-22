/**
 * mae 深链接 scheme 唯一定义(specs/mae/identity-isolation.md,工单 #10)。
 *
 * 本文件是 mae fork 的自有新增文件,不与上游合并冲突。以 .mjs 存放(配套手写
 * deeplinkScheme.d.mts)的原因:除 TS 消费方(desktop main、web 分享页)经
 * `@zcode/shared/mae` 公共入口引用外,构建脚本 packages/desktop/electron-builder.config.js
 * 需要由 Node 直接执行同一份常量——单一事实源,禁止任何消费方内联 "zcode-mae" 字面量。
 *
 * 语义:mae 安装只注册/接受自有 scheme;官方 zcode:// 链接不拉起 mae,mae 链接不拉起官方。
 */

/** mae 深链接 scheme(不带冒号;URL 形态为 `zcode-mae://`)。 */
export const MAE_DEEP_LINK_SCHEME = "zcode-mae";
