/** 侧栏「问题会话」分组(#41 定形:与项目平级,置顶;服务未运行时不渲染)。 */
import { Button } from "@/components/ui/button.js";
import { cn } from "@/components/lib/utils.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { dtsStageLabel, useDtsIssues } from "./useDtsIssues.js";

export interface DtsIssueSessionsSectionProps {
  /** 点击单条:打开/续开该问题工作区的会话(由 shell 提供建会话链路)。 */
  onCreateIssueSession: (workspacePath: string, initialPrompt: string, ticket: string) => void;
  baseUrl?: string;
}

export function DtsIssueSessionsSection(props: DtsIssueSessionsSectionProps) {
  const { available, issues } = useDtsIssues({ baseUrl: props.baseUrl });
  const { intl } = useZCodeIntl();
  if (!available || issues.length === 0) return null;
  return (
    <div className="flex flex-col gap-1" data-testid="mae-dts-issue-sessions">
      <div className="flex items-center gap-2 px-2 py-1 text-sidebar-foreground/70 text-xs font-medium">
        {intl.formatMessage({ id: "mae.dts.issueSessions" })}
        <span className="ml-auto tabular-nums">{issues.length}</span>
      </div>
      {issues.map((issue) => {
        const done = issue.archived || issue.closedAt !== null;
        return (
          <Button
            key={issue.ticket}
            variant="ghost"
            size="sm"
            className={cn("w-full justify-start gap-2 px-2 font-normal", done && "opacity-60")}
            data-testid={`mae-dts-issue-${issue.ticket}`}
            onClick={() =>
              props.onCreateIssueSession(
                issue.workspacePath,
                `继续处理 DTS 问题单 ${issue.ticket}:先读工作区 .agents/skills/dts-issue-flow/SKILL.md,再按当前阶段推进。`,
                issue.ticket,
              )
            }
          >
            <span className="truncate font-mono text-xs">{issue.ticket}</span>
            <span className="ml-auto whitespace-nowrap text-xs text-sidebar-foreground/70">
              {done ? "已收口" : dtsStageLabel(issue.stage)}
            </span>
          </Button>
        );
      })}
    </div>
  );
}
