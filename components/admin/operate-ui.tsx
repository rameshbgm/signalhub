import Link from "next/link";
import type { InputHTMLAttributes, ReactNode } from "react";
import { PanelsTopLeft, Plus } from "lucide-react";
import { PageSelect } from "@/components/admin/PageSelect";
import { buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import type { StatusTone } from "@/components/ui/status-badge";
import { INCIDENT_STATUS_LABEL, MAINTENANCE_STATUS_LABEL, type IncidentStatus, type MaintenanceStatus } from "@/lib/status";
import { cn } from "@/lib/utils";

/** Shared building blocks for the incident, maintenance, monitor, metric, and analytics screens. */

/** A checkbox inside a tappable row, with an optional hint under the label. */
export function CheckRow({ label, hint, className, ...checkbox }: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: ReactNode; hint?: ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 rounded-control border border-line px-3.5 py-3 text-sm transition-colors duration-200 hover:bg-sunken has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 has-[:disabled]:hover:bg-transparent", className)}>
      <Checkbox {...checkbox} className="mt-0.5" />
      <span className="min-w-0">
        <span className="block font-medium text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-xs leading-5 text-ink-dim">{hint}</span>}
      </span>
    </label>
  );
}

/** Shown instead of a screen's content when the organization has no page it can act on. */
export function NoPagesState({ description, canCreate }: { description: ReactNode; canCreate: boolean }) {
  return (
    <EmptyState
      icon={PanelsTopLeft}
      hue="violet"
      title="Create a page first"
      description={description}
      action={canCreate ? <Link href="/organization/pages/new" className={buttonVariants()}><Plus aria-hidden size={16} />Create page</Link> : undefined}
      className="py-20"
    />
  );
}

/** Which page a new event posts to. The page usually comes from where the user started, so the picker stays folded behind "Change". */
export function PostingTo({ pages, selected, basePath }: { pages: { id: string; name: string }[]; selected: string; basePath: string }) {
  const name = pages.find((p) => p.id === selected)?.name;
  const label = (
    <span className="flex min-w-0 items-center gap-2">
      <PanelsTopLeft aria-hidden size={16} className="shrink-0 text-ink-dim" />
      <span className="truncate text-ink-soft">Posting to <span className="font-semibold text-ink">{name}</span></span>
    </span>
  );
  if (pages.length < 2) return <div className="rounded-card border border-line bg-surface px-4 py-3 text-sm">{label}</div>;
  return (
    <details className="group rounded-card border border-line bg-surface px-4 py-3 text-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-chip outline-none focus-visible:ring-4 focus-visible:ring-primary/25 [&::-webkit-details-marker]:hidden">
        {label}
        <span className="shrink-0 font-semibold text-primary-ink group-open:hidden">Change</span>
      </summary>
      <div className="mt-3 max-w-sm">
        <PageSelect pages={pages} basePath={basePath} selected={selected} />
      </div>
    </details>
  );
}

export function componentTone(status: string): StatusTone {
  if (status === "OPERATIONAL") return "ok";
  if (status === "MAJOR_OUTAGE") return "danger";
  if (status === "UNDER_MAINTENANCE") return "info";
  if (status === "DEGRADED_PERFORMANCE" || status === "PARTIAL_OUTAGE") return "warn";
  return "neutral";
}

export function incidentStatusTone(status: string): StatusTone {
  if (status === "RESOLVED") return "ok";
  if (status === "MONITORING") return "info";
  return "warn";
}

export function maintenanceStatusTone(status: string): StatusTone {
  if (status === "COMPLETED") return "ok";
  if (status === "SCHEDULED") return "info";
  return "warn";
}

/** Timeline updates carry either an incident status or a maintenance status. */
export function updateStatusLabel(status: string) {
  return INCIDENT_STATUS_LABEL[status as IncidentStatus] ?? MAINTENANCE_STATUS_LABEL[status as MaintenanceStatus] ?? status;
}

export function updateStatusTone(status: string): StatusTone {
  return status in MAINTENANCE_STATUS_LABEL ? maintenanceStatusTone(status) : incidentStatusTone(status);
}

/** A vertical rail of updates; mark the most recent entry with `current`. */
export function TimelineList({ children }: { children: ReactNode }) {
  return <ol className="relative space-y-6 border-l border-line pl-6">{children}</ol>;
}

export function TimelineItem({ current = false, children }: { current?: boolean; children: ReactNode }) {
  return (
    <li className="relative">
      <span aria-hidden="true" className={cn("absolute -left-[1.9rem] top-1.5 size-3 rounded-full border-2 border-surface ring-1", current ? "bg-primary ring-primary/40" : "bg-line-strong ring-line")} />
      {children}
    </li>
  );
}
