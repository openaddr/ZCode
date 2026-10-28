/** mock 网关的确定性罐头单据。口径仿云端 assets/mock/dts-tickets.json(10 张,5 张可发起)。 */
import type { DtsTicketDetail } from "../domain/dts.js";

export const MOCK_TICKETS: DtsTicketDetail[] = [
  { ticket: "DTS-2026-1001", title: "版本升级后配置项丢失", status: "已解决", version: "V100R025C10SPC010B001", severity: "一般", submitter: "张三", url: "https://dts.mock/t/1001", featureName: "配置管理", description: "<p>升级后部分配置项未保留。(mock)</p>" },
  { ticket: "DTS-2026-1002", title: "Web 界面登录态 30 分钟掉线", status: "开发人员实施修改", version: "V100R025C10SPC010B002", severity: "一般", submitter: "李四", url: "https://dts.mock/t/1002", featureName: "会话管理", description: "<p>登录态 30 分钟即失效,预期保持 8 小时。(mock)</p>" },
  { ticket: "DTS-2026-1003", title: "文档链接 404", status: "已驳回", version: "V100R025C10SPC010B003", severity: "轻微", submitter: "王五", url: "https://dts.mock/t/1003", featureName: "文档", description: "<p>帮助中心链接失效。(mock)</p>" },
  { ticket: "DTS-2026-1004", title: "导出报表在万行级时列错位", status: "开发人员实施修改", version: "V100R025C10SPC010B004", severity: "严重", submitter: "张三", url: "https://dts.mock/t/1004", featureName: "报表导出", description: "<p>万行级导出错位。(mock)</p>" },
  { ticket: "DTS-2026-1005", title: "重复提交表单产生双记录", status: "挂起", version: "V100R025C10SPC010B005", severity: "一般", submitter: "赵六", url: "https://dts.mock/t/1005", featureName: "表单", description: "<p>快速双击产生双记录。(mock)</p>" },
  { ticket: "DTS-2026-1006", title: "国际化文案截断", status: "已解决", version: "V100R025C10SPC010B006", severity: "轻微", submitter: "李四", url: "https://dts.mock/t/1006", featureName: "国际化", description: "<p>德语长词截断。(mock)</p>" },
  { ticket: "DTS-2026-1007", title: "导出功能报错(附截图)", status: "已拒绝", version: "V100R025C10SPC010B007", severity: "严重", submitter: "王五", url: "https://dts.mock/t/1007", featureName: "报表导出", description: '<p>导出报错,截图如下。<img src="/v1/nfs/mock/2026-1007/export-error.png" /></p>' },
  { ticket: "DTS-2026-1008", title: "大数据集群偶发 OOM 导致查询挂死", status: "开发人员实施修改", version: "V100R025C10SPC010B008", severity: "致命", submitter: "赵六", url: "https://dts.mock/t/1008", featureName: "大数据平台", description: "<p>集群偶发 OOM,查询进程挂死,重启恢复。(mock)</p>" },
  { ticket: "DTS-2026-1009", title: "定时任务在主备切换后重复触发", status: "开发人员实施修改", version: "V100R025C10SPC010B009", severity: "严重", submitter: "张三", url: "https://dts.mock/t/1009", featureName: "调度", description: "<p>主备切换后定时任务双跑。(mock)</p>" },
  { ticket: "DTS-2026-1010", title: "告警短信通道重复发送", status: "开发人员实施修改", version: "V100R025C10SPC011B001", severity: "一般", submitter: "李四", url: "https://dts.mock/t/1010", featureName: "告警", description: "<p>同条告警 5 分钟内重复下发。(mock)</p>" },
];
