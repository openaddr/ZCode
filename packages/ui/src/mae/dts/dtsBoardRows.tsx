import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
/** DTS 看板行组件与列头气泡:纯展示拆分(主文件超行数上限,eslint max-lines)。 */
import { Badge } from "@/components/ui/badge.js";
import { Checkbox } from "@/components/ui/checkbox.js";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.js";
import { Button } from "@/components/ui/button.js";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { cn } from "@/components/lib/utils.js";
import {
  type BoardColKey,
  type BoardIssueRef,
  type BoardTicket,
  type TierValue,
  TIER_FOLLOW,
  TIER_OPTIONS,
  type ColumnShownKey,
} from "./dtsBoardModel.js";

export function BoardRow(props: {
  ticket: BoardTicket;
  shown: Record<ColumnShownKey, boolean>;
  widths: Record<BoardColKey, number>;
  selected: boolean;
  liveIssue: BoardIssueRef | null;
  resolvedModule: string | null;
  bindingFailMessage: string | null;
  bindingPending: boolean;
  remark: string;
  tier: TierValue | null;
  modules: Array<{ id: string; name: string }>;
  onToggleSelect: () => void;
  onEditRemark: () => void;
  onChangeModule: (moduleId: string) => void;
  onChangeTier: (tier: TierValue | null) => void;
  onOpenIssueSession?: (workspacePath: string) => void;
  onResizeStart: (key: BoardColKey, event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  const { intl } = useZCodeIntl();
  const ticket = props.ticket;
  const disabledReason = props.liveIssue !== null
    ? intl.formatMessage({ id: "mae.dts.list.disableLive" })
    : ticket.branch === null
      ? intl.formatMessage({ id: "mae.dts.list.disableBranch" })
      : props.resolvedModule === null
        ? intl.formatMessage({ id: "mae.dts.list.disableModule" })
        : undefined;
  return (
    <tr className="border-b border-card-border transition-colors last:border-b-0 hover:bg-hover">
      <td className="px-2 py-2">
        <Checkbox
          checked={props.selected}
          disabled={disabledReason !== undefined}
          title={disabledReason}
          aria-label={`选择 ${ticket.ticket}`}
          onCheckedChange={() => props.onToggleSelect()}
        />
      </td>
      <td className="overflow-hidden px-3 py-2">
        {ticket.url ? (
          <a
            className="block truncate font-mono text-xs font-medium text-primary underline-offset-2 hover:underline"
            href={ticket.url}
            target="_blank"
            rel="noreferrer"
            title={ticket.ticket}
          >
            {ticket.ticket}
          </a>
        ) : (
          <span className="font-mono text-xs">{ticket.ticket}</span>
        )}
      </td>
      {props.shown.title ? (
        <td className="overflow-hidden px-3 py-2">
          <span className="block truncate" title={ticket.title || undefined}>{ticket.title || "(无标题)"}</span>
        </td>
      ) : null}
      {props.shown.launch ? (
        <td className="px-3 py-2">
          {props.liveIssue !== null ? (
            <button
              type="button"
              className="inline-flex h-6 items-center rounded-md px-2 hover:bg-hover"
              title={intl.formatMessage({ id: "mae.dts.list.openSession" })}
              onClick={() => props.onOpenIssueSession?.(props.liveIssue?.workspacePath ?? "")}
            >
              <Badge>{intl.formatMessage({ id: "mae.dts.list.launched" })}</Badge>
            </button>
          ) : (
            <span className="text-muted-foreground" aria-label={intl.formatMessage({ id: "mae.dts.list.unlaunched" })}>—</span>
          )}
        </td>
      ) : null}
      {props.shown.remark ? (
        <td className="px-3 py-2">
          <button
            type="button"
            className={cn(
              "h-8 w-full truncate rounded-md border px-2 text-left text-xs transition-colors",
              props.remark
                ? "border-input-border bg-surface hover:bg-hover"
                : "border-dashed border-input-border text-muted-foreground hover:bg-hover",
            )}
            title={props.remark || undefined}
            aria-label={`${ticket.ticket} ${intl.formatMessage({ id: "mae.dts.list.col.remark" })}`}
            onClick={props.onEditRemark}
          >
            {props.remark || intl.formatMessage({ id: "mae.dts.list.remarkEmpty" })}
          </button>
        </td>
      ) : null}
      {props.shown.module ? (
        <td className="px-3 py-2">
          <Select
            value={props.resolvedModule ?? "__none"}
            disabled={props.bindingPending}
            onValueChange={(value) => props.onChangeModule(value === "__none" ? "" : value)}
          >
            <SelectTrigger
              className={cn("h-8 w-full text-xs", props.resolvedModule === null && "border-destructive/60 text-destructive")}
              aria-label={`${ticket.ticket} ${intl.formatMessage({ id: "mae.dts.list.col.module" })}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {props.resolvedModule === null ? (
                <SelectItem value="__none">{intl.formatMessage({ id: "mae.dts.list.modulePlaceholder" })}</SelectItem>
              ) : null}
              {props.modules.map((module) => (
                <SelectItem key={module.id} value={module.id}>{module.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {props.bindingFailMessage !== null ? (
            <p className="mt-1 text-destructive text-xs" role="alert">{props.bindingFailMessage}</p>
          ) : null}
        </td>
      ) : null}
      {props.shown.tier ? (
        <td className="px-3 py-2">
          {props.liveIssue !== null ? (
            <span className="block truncate text-muted-foreground text-xs">
              {props.tier === null ? intl.formatMessage({ id: "mae.dts.list.tierFollow" }) : tierLabel(props.tier)}
            </span>
          ) : (
            <Select
              value={props.tier ?? TIER_FOLLOW}
              onValueChange={(value) => props.onChangeTier(value === TIER_FOLLOW ? null : (value as TierValue))}
            >
              <SelectTrigger className="h-8 w-full text-xs" aria-label={`${ticket.ticket} ${intl.formatMessage({ id: "mae.dts.list.col.tier" })}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TIER_FOLLOW}>{intl.formatMessage({ id: "mae.dts.list.tierFollow" })}</SelectItem>
                {TIER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </td>
      ) : null}
    </tr>
  );
}

function tierLabel(tier: TierValue): string {
  return TIER_OPTIONS.find((option) => option.value === tier)?.label ?? tier;
}

/** 版本组多选下拉(勾选组,组内全部 B 版命中);未映射组标红点。 */
export function VersionGroupSelect(props: {
  groups: readonly string[];
  selected: readonly string[];
  unmapped: readonly string[];
  onChange: (next: string[]) => void;
}) {
  const { intl } = useZCodeIntl();
  const label = props.selected.length === 0
    ? intl.formatMessage({ id: "mae.dts.list.versionAll" })
    : props.selected.length === 1
      ? props.selected[0] ?? ""
      : `${props.selected.length} ${intl.formatMessage({ id: "mae.dts.list.versionCount" })}`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" data-testid="mae-dts-version-filter">
          {intl.formatMessage({ id: "mae.dts.list.version" })} {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {props.groups.length === 0 ? (
          <p className="px-2 py-1.5 text-muted-foreground text-xs">{intl.formatMessage({ id: "mae.dts.list.versionEmpty" })}</p>
        ) : (
          props.groups.map((group) => (
            <label key={group} className="flex min-h-8 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm hover:bg-hover">
              <Checkbox
                checked={props.selected.includes(group)}
                onCheckedChange={(checked) => {
                  const next = checked === true
                    ? [...props.selected, group]
                    : props.selected.filter((group_) => group_ !== group);
                  props.onChange(next);
                }}
              />
              <span className={cn(props.unmapped.includes(group) && "text-destructive")}>{group}</span>
            </label>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** 列头过滤气泡(单号/标题输入,发起状态双勾选),激活时亮筛选图标。 */
export function HeaderFilter(props: { label: string; active: boolean; onClear: () => void; children: ReactNode }) {
  const { intl } = useZCodeIntl();
  return (
    <span className="inline-flex items-center gap-1">
      {props.label}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`${props.label} ${intl.formatMessage({ id: "mae.dts.list.filter" })}`}
            className={cn("rounded px-0.5 hover:bg-hover", props.active && "text-primary")}
          >
            <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 5h18M6 12h12M10 19h4" strokeLinecap="round" />
            </svg>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="start">
          <div className="flex flex-col gap-2">
            {props.children}
            {props.active ? (
              <Button variant="ghost" size="sm" onClick={props.onClear}>{intl.formatMessage({ id: "mae.dts.list.filterClear" })}</Button>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
    </span>
  );
}

