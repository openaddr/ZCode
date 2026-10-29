/** 侧栏「问题会话」分组(#41 定形:与 项目/任务 分区同壳同风格;服务未运行时不渲染)。 */
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible.js";
import { Button } from "@/components/ui/button.js";
import { cn } from "@/components/lib/utils.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { dtsStageLabel, useDtsIssues } from "./useDtsIssues.js";

export interface DtsIssueSessionsSectionProps {
  /** 点击单条:打开/续开该问题工作区的会话(由 shell 提供建会话链路)。 */
  onCreateIssueSession: (workspacePath: string, initialPrompt: string, ticket: string) => void;
  baseUrl?: string;
}

/** 外观复刻 WorkspacePurposeSection 的分区壳(dnd 绑定是上游内部件不可独立复用,静态壳对齐样式)。 */
export function DtsIssueSessionsSection(props: DtsIssueSessionsSectionProps) {
  const { available, issues } = useDtsIssues({ baseUrl: props.baseUrl });
  const { intl } = useZCodeIntl();
  const [open, setOpen] = useState(true);
  if (!available || issues.length === 0) return null;
  return (
    <section aria-label={intl.formatMessage({ id: "mae.dts.issueSessions" })} data-testid="mae-dts-issue-sessions" className="relative min-w-0">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="ml-2 mr-1 flex h-7 min-w-0 items-center">
          <CollapsibleTrigger
            type="button"
            className="flex h-7 min-w-0 flex-1 touch-none items-center gap-1 px-2.5 text-left text-ui-base font-medium text-foreground-subtlest outline-none transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <span className="min-w-0 truncate">{intl.formatMessage({ id: "mae.dts.issueSessions" })}</span>
            {open ? (
              <ChevronDown aria-hidden="true" className="size-3.5 shrink-0" />
            ) : (
              <ChevronRight aria-hidden="true" className="size-3.5 shrink-0" />
            )}
          </CollapsibleTrigger>
          <span className="shrink-0 pr-1 tabular-nums text-muted-foreground text-xs">{issues.length}</span>
        </div>
        <CollapsibleContent>
          <div className="pl-2">
            {issues.map((issue) => {
              const done = issue.archived || issue.closedAt !== null;
              return (
                <Button
                  key={issue.ticket}
                  variant="ghost"
                  size="sm"
                  className={cn("h-auto w-full justify-start gap-2 px-2.5 py-2 text-left font-normal", done && "opacity-60")}
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
                  <span className="ml-auto shrink-0 text-muted-foreground text-xs">
                    {done ? intl.formatMessage({ id: "mae.dts.issue.done" }) : dtsStageLabel(issue.stage)}
                  </span>
                </Button>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
