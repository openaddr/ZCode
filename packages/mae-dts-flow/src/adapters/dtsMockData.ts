/**
 * mock 网关的确定性罐头数据。单据口径仿云端 assets/mock/dts-tickets.json(10 张,5 张可发起);
 * 版本串为 C 版形态(mae-flow-cloud#564:版本取 C 版字段,无 B 段);
 * branch/moduleId 刻意留空两张,演练「未配置分支」「未匹配」两道发起闸。
 */
import type { DtsBindingMap, DtsModuleOption, DtsPerson, DtsTicketDetail } from "../domain/dts.js";

export const MOCK_TICKETS: DtsTicketDetail[] = [
  { ticket: "DTS-2026-1001", title: "版本升级后配置项丢失", status: "已解决", version: "V100R025C10SPC010", severity: "一般", submitter: "张三", url: "https://dts.mock/t/1001", branch: "master", moduleId: "module-config", description: "<p>升级后部分配置项未保留。(mock)</p>" },
  { ticket: "DTS-2026-1002", title: "Web 界面登录态 30 分钟掉线", status: "开发人员实施修改", version: "V100R025C10SPC010", severity: "一般", submitter: "李四", url: "https://dts.mock/t/1002", branch: "master", moduleId: "module-web", description: "<p>登录态 30 分钟即失效,预期保持 8 小时。(mock)</p>" },
  { ticket: "DTS-2026-1003", title: "文档链接 404", status: "已驳回", version: "V100R025C10SPC010", severity: "轻微", submitter: "王五", url: "https://dts.mock/t/1003", branch: "master", moduleId: null, description: "<p>帮助中心链接失效。(mock)</p>" },
  { ticket: "DTS-2026-1004", title: "导出报表在万行级时列错位", status: "开发人员实施修改", version: "V100R025C10SPC010", severity: "严重", submitter: "张三", url: "https://dts.mock/t/1004", branch: "master", moduleId: "module-report", description: "<p>万行级导出错位。(mock)</p>" },
  { ticket: "DTS-2026-1005", title: "重复提交表单产生双记录", status: "挂起", version: "V100R025C10SPC010", severity: "一般", submitter: "赵六", url: "https://dts.mock/t/1005", branch: null, moduleId: "module-web", description: "<p>快速双击产生双记录。(mock)</p>" },
  { ticket: "DTS-2026-1006", title: "国际化文案截断", status: "已解决", version: "V100R025C10SPC010", severity: "轻微", submitter: "李四", url: "https://dts.mock/t/1006", branch: "master", moduleId: null, description: "<p>德语长词截断。(mock)</p>" },
  { ticket: "DTS-2026-1007", title: "导出功能报错(附截图)", status: "已拒绝", version: "V100R025C10SPC010", severity: "严重", submitter: "王五", url: "https://dts.mock/t/1007", branch: "master", moduleId: "module-report", description: '<p>导出报错,截图如下。<img src="/v1/nfs/mock/2026-1007/export-error.png" /></p>' },
  { ticket: "DTS-2026-1008", title: "大数据集群偶发 OOM 导致查询挂死", status: "开发人员实施修改", version: "V100R025C10SPC010", severity: "致命", submitter: "赵六", url: "https://dts.mock/t/1008", branch: "master", moduleId: "module-bigdata", description: "<p>集群偶发 OOM,查询进程挂死,重启恢复。(mock)</p>" },
  { ticket: "DTS-2026-1009", title: "定时任务在主备切换后重复触发", status: "开发人员实施修改", version: "V100R025C10SPC010", severity: "严重", submitter: "张三", url: "https://dts.mock/t/1009", branch: "master", moduleId: "module-sched", description: "<p>主备切换后定时任务双跑。(mock)</p>" },
  { ticket: "DTS-2026-1010", title: "告警短信通道重复发送", status: "开发人员实施修改", version: "V100R025C10SPC011", severity: "一般", submitter: "李四", url: "https://dts.mock/t/1010", branch: "master", moduleId: "module-alarm", description: "<p>同条告警 5 分钟内重复下发。(mock)</p>" },
];

export const MOCK_MODULES: DtsModuleOption[] = [
  { id: "module-config", name: "配置管理", repositories: ["https://repo.mock/config.git"] },
  { id: "module-web", name: "Web 前端", repositories: ["https://repo.mock/web.git"] },
  { id: "module-report", name: "报表中心", repositories: ["https://repo.mock/report.git", "https://repo.mock/export.git"] },
  { id: "module-bigdata", name: "大数据平台", repositories: ["https://repo.mock/bigdata.git"] },
  { id: "module-sched", name: "调度服务", repositories: ["https://repo.mock/sched.git"] },
  { id: "module-alarm", name: "告警网关", repositories: ["https://repo.mock/alarm.git"] },
];

/** 罐头改选映射:1004 的人工改选覆盖带出值,演示两层口径。 */
export const MOCK_BINDINGS: DtsBindingMap = {
  "DTS-2026-1004": { moduleId: "module-bigdata", updatedBy: "ning", updatedAt: "2026-10-30T08:00:00.000Z" },
};

export const MOCK_PEOPLE: DtsPerson[] = [
  { username: "dev", displayName: "开发员(mock)" },
  { username: "zhangsan", displayName: "张三" },
  { username: "lisi", displayName: "李四" },
  { username: "zhaoliu", displayName: "赵六" },
];
