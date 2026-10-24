"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ExternalLink, Eye, EyeOff, Pause, Pencil, Play, RefreshCw, Trash2 } from "lucide-react";
import { MonitorDetailsDialog, Rows, Section, Tile, seconds, when, type Row } from "@/components/admin/MonitorDetailsDialog";
import { MonitorHistoryDrawer } from "@/components/admin/MonitorHistoryDrawer";
import type { MonitorListItem } from "@/components/admin/MonitorList";
import { PageSubmitButton } from "@/components/admin/PageSubmitButton";
import { ActionRow, InlineActionForm } from "@/components/InlineActionForm";
import { Button, buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { kindOfType } from "@/lib/monitor-kinds";
import { cn } from "@/lib/utils";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";

const RECENT = 5;

/** Summary shown under an expanded monitor row: health, recent checks, key settings and every action. The full details dialog stays one click away. */
export function MonitorExpandedPanel({ monitor, canManage, indented = false }: { monitor: MonitorListItem; canManage: boolean; /** Matches the row indent when the row sits under a group header. */ indented?: boolean }) {
  const { values: m, details: d, actions, checks } = monitor;
  const [viewing, setViewing] = useState(false);
  const kind = kindOfType(m.type);
  const latencies = checks.flatMap((check) => (check.latencyMs === null ? [] : [check.latencyMs]));
  const upCount = checks.filter((check) => check.ok).length;
  const settings: Row[] = [
    ["Linked service", monitor.componentName ?? "Not linked to a service"],
    ["System metric", monitor.metric ? monitor.metric.visible ? "Shown on the status page" : "Hidden from the status page" : "No response-time metric"],
    ...(kind === "JOB" ? [["Expected every", seconds(d.intervalSec)] as Row, ["Grace period", seconds(d.heartbeatGraceSec ?? 0)] as Row] : [["Check every", seconds(d.intervalSec)] as Row, ["Timeout", `${d.timeoutMs} ms`] as Row]),
    ["Down after", `${d.failThreshold} failed check${d.failThreshold === 1 ? "" : "s"} in a row`],
    ["Streak now", d.consecutiveFails > 0 ? `${d.consecutiveFails} failing` : `${d.consecutiveOks} passing`],
  ];

  return (
    <div className={cn("space-y-4 bg-sunken/30 pb-4 pr-4 text-sm leading-6 text-ink-soft", indented ? "pl-4 sm:pl-11" : "pl-4 sm:pl-3")} onClick={(event) => event.stopPropagation()}>
      <ActionRow className="sticky top-14 z-20 flex flex-wrap items-center justify-center gap-1.5 border-b border-line bg-surface py-3" messageClassName="max-w-56">
        {canManage && (
          <>
            <InlineActionForm action={actions.run}>
              <Button type="submit" size="sm" variant="secondary"><RefreshCw aria-hidden size={14} className="!text-primary" />Check now</Button>
            </InlineActionForm>
            <InlineActionForm action={actions.toggle}>
              <Button type="submit" size="sm" variant="secondary" aria-label={`${monitor.enabled ? "Pause" : "Resume"} ${m.name}`}>
                {monitor.enabled ? <Pause aria-hidden size={14} className="!text-warn-fg" /> : <Play aria-hidden size={14} className="!text-ok-fg" />}
                {monitor.enabled ? "Pause" : "Resume"}
              </Button>
            </InlineActionForm>
            {monitor.metric && (
              <PlatformActionForm action={monitor.metric.toggle} successMessage={`${m.name} metric ${monitor.metric.visible ? "hidden from" : "shown on"} the status page. Monitoring continues.`} className="flex">
                <PageSubmitButton variant="secondary" size="sm" pendingLabel="Saving…" aria-label={`${monitor.metric.visible ? "Hide" : "Show"} ${m.name} metric ${monitor.metric.visible ? "from" : "on"} the status page`} title="Controls the System metrics chart only. Monitoring and service status continue.">
                  {monitor.metric.visible ? <EyeOff aria-hidden size={14} className="!text-warn-fg" /> : <Eye aria-hidden size={14} className="!text-info-fg" />}
                  {monitor.metric.visible ? "Hide from page" : "Show on page"}
                </PageSubmitButton>
              </PlatformActionForm>
            )}
          </>
        )}
        <Button type="button" size="sm" variant="secondary" data-button-guard="off" onClick={() => setViewing(true)}><Eye aria-hidden size={14} className="!text-info-fg" />Full details</Button>
        <MonitorHistoryDrawer monitorId={m.id} name={m.name} latest={checks} labelled />
        <a href={monitor.pageHref} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ExternalLink aria-hidden size={14} className="text-primary" />Status page
        </a>
        {canManage && (
          <Link href={`/organization/monitors/${m.id}/edit`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <Pencil aria-hidden size={14} className="text-primary" />Edit
          </Link>
        )}
        {canManage && (
          <InlineActionForm action={actions.remove}>
            <PageSubmitButton variant="ghost" size="sm" pendingLabel="Deleting…" className={cn("hover:bg-danger-bg hover:text-danger-fg [&_svg]:!text-danger hover:[&_svg]:!text-danger-fg")} confirmMessage={`Delete the monitor ${m.name} and its check history? This cannot be undone.`}>
              <Trash2 aria-hidden size={14} />
              Delete
              <span className="sr-only"> {m.name}</span>
            </PageSubmitButton>
          </InlineActionForm>
        )}
      </ActionRow>
      {monitor.lastError && (
        <p className="flex items-start gap-2 rounded-control border border-danger/25 bg-danger-bg px-3 py-2 text-sm text-danger-fg">
          <AlertTriangle aria-hidden size={16} className="mt-0.5 shrink-0" />
          <span className="min-w-0 break-words">{monitor.lastError}</span>
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Tile label="Last latency">{monitor.lastLatencyMs === null ? "—" : `${monitor.lastLatencyMs} ms`}</Tile>
        <Tile label={`Uptime, last ${checks.length || 0}`}>{checks.length ? `${Math.round((upCount / checks.length) * 100)}%` : "—"}</Tile>
        <Tile label="Average latency">{latencies.length ? `${Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)} ms` : "—"}</Tile>
        <Tile label="Last checked">{monitor.lastCheckedAt ? when(monitor.lastCheckedAt) : "Never"}</Tile>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Recent checks">
          {checks.length === 0 ? <p className="rounded-control border border-dashed border-line px-3 py-4 text-center text-sm text-ink-dim">No checks yet.</p> : (
            <ul className="divide-y divide-line/70 rounded-control border border-line/70 bg-surface">
              {checks.slice(0, RECENT).map((check) => (
                <li key={check.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-1.5 text-xs">
                  <StatusBadge tone={check.ok ? "ok" : "danger"}>{check.ok ? "OK" : "Failed"}</StatusBadge>
                  <span className="tabular-nums text-ink">{new Date(check.checkedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" })}</span>
                  <span className="tabular-nums text-ink-dim">{check.latencyMs === null ? "" : `${check.latencyMs} ms`}</span>
                  {check.statusCode && <span className="text-ink-dim">HTTP {check.statusCode}</span>}
                  {check.error && <span className="min-w-0 basis-full break-words text-danger-fg">{check.error}</span>}
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Settings"><Rows rows={settings} /></Section>
      </div>


      {viewing && <MonitorDetailsDialog monitor={monitor} canManage={canManage} onClose={() => setViewing(false)} />}
    </div>
  );
}
