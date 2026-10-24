"use client";

import { type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AlertTriangle, ExternalLink, Pencil, X } from "lucide-react";
import { Dialog, DialogSurface } from "@/components/ui/dialog";
import { buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { COMPONENT_STATUS_LABEL, type ComponentStatus } from "@/lib/status";
import { kindOfType, monitorTypeLabel } from "@/lib/monitor-kinds";
import { cn } from "@/lib/utils";
import type { MonitorListItem } from "@/components/admin/MonitorList";

/** Everything the dialog shows beyond the list row. Never holds secrets: credentials, header values and bodies stay on the server. */
export type MonitorDetails = {
  createdAt: string;
  intervalSec: number;
  timeoutMs: number;
  failThreshold: number;
  recoverThreshold: number;
  downStatus: string;
  consecutiveFails: number;
  consecutiveOks: number;
  method: string;
  expectedStatusRange: string;
  keywordMatch: string | null;
  keywordAbsent: string | null;
  verifyTls: boolean;
  cacheBuster: boolean;
  saveErrorResponse: boolean;
  upsideDown: boolean;
  ipFamily: string;
  authType: string;
  headerNames: string[];
  hasBody: boolean;
  usesProxy: boolean;
  dnsRecordType: string | null;
  dnsExpectedValue: string | null;
  heartbeatGraceSec: number | null;
  hasHeartbeatUrl: boolean;
  lastHeartbeatAt: string | null;
  certExpiryNotify: boolean;
  domainExpiryNotify: boolean;
  sslWarnDays: number | null;
  certExpiresAt: string | null;
  domainExpiresAt: string | null;
  actions: { flipStatus: boolean; recordMetric: boolean; autoIncident: boolean; notify: boolean };
};

export type Row = [label: string, value: ReactNode];

const STATE_TONE = { up: "ok", down: "danger", pending: "warn", paused: "neutral" } as const;
const STATE_LABEL = { up: "Up", down: "Down", pending: "Pending", paused: "Paused" } as const;
const AUTH_LABEL: Record<string, string> = { NONE: "None", BASIC: "HTTP Basic", BEARER: "Bearer token", OAUTH2: "OAuth2 client credentials", MTLS: "Client certificate (mTLS)", HEADER: "Custom header" };
const IP_LABEL: Record<string, string> = { AUTO: "Automatic", IPV4: "IPv4 only", IPV6: "IPv6 only" };

export const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Never");
export const seconds = (value: number) => (value >= 3600 && value % 3600 === 0 ? `${value / 3600} h` : value >= 60 && value % 60 === 0 ? `${value / 60} min` : `${value} s`);
const flag = (on: boolean) => <StatusBadge tone={on ? "ok" : "neutral"}>{on ? "On" : "Off"}</StatusBadge>;

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-dim">{title}</h3>
      {children}
    </section>
  );
}

export function Rows({ rows }: { rows: Row[] }) {
  return (
    <dl className="divide-y divide-line/70 rounded-control border border-line/70">
      {rows.map(([label, value]) => (
        <div key={label} className="grid gap-0.5 px-3 py-2 sm:grid-cols-[12rem_1fr] sm:gap-3">
          <dt className="text-ink-dim">{label}</dt>
          <dd className="min-w-0 break-words font-medium text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-control border border-line bg-sunken/40 px-3 py-2.5">
      <p className="text-xs text-ink-dim">{label}</p>
      <div className="mt-1 text-base font-semibold tabular-nums text-ink">{children}</div>
    </div>
  );
}

/** Full, read-only details of one monitor in a centered modal; the body scrolls and the header stays put. */
export function MonitorDetailsDialog({ monitor, canManage, onClose }: { monitor: MonitorListItem; canManage: boolean; onClose: () => void }) {
  const { values: m, details: d, checks } = monitor;
  const kind = kindOfType(m.type);
  const target = m.type === "HEARTBEAT" ? "Inbound heartbeat (your job calls SignalHub)" : `${m.target}${m.port ? `:${m.port}` : ""}`;
  const latencies = checks.flatMap((check) => (check.latencyMs === null ? [] : [check.latencyMs]));
  const upCount = checks.filter((check) => check.ok).length;
  const ordered = checks.slice().reverse();

  const watching: Row[] = [
    ["Type", `${monitorTypeLabel(m.type)} (${m.type})`],
    ["Target", <span key="t" className="font-mono text-[0.8125rem]">{target}</span>],
    ["Component", monitor.componentName ?? "Not tied to a component"],
    ["Group", m.groupName ?? "Ungrouped"],
    ["Tags", m.tags.length ? <span key="g" className="flex flex-wrap gap-1.5">{m.tags.map((tag) => <span key={tag} className="rounded-chip border border-line bg-sunken px-2 py-0.5 text-xs">{tag}</span>)}</span> : "None"],
    ["Created", when(d.createdAt)],
  ];
  const schedule: Row[] = [
    ...(kind === "JOB" ? [] as Row[] : [["Check every", seconds(d.intervalSec)] as Row, ["Timeout", `${d.timeoutMs} ms`] as Row]),
    ...(kind === "JOB" ? [["Expected every", seconds(d.intervalSec)] as Row, ["Grace period", seconds(d.heartbeatGraceSec ?? 0)] as Row] : []),
    ["Down after", `${d.failThreshold} failed check${d.failThreshold === 1 ? "" : "s"} in a row`],
    ["Recovered after", `${d.recoverThreshold} good check${d.recoverThreshold === 1 ? "" : "s"} in a row`],
    ["Streak now", d.consecutiveFails > 0 ? `${d.consecutiveFails} failing` : `${d.consecutiveOks} passing`],
    ["Component on failure", COMPONENT_STATUS_LABEL[d.downStatus as ComponentStatus] ?? d.downStatus],
  ];
  const request: Row[] = kind === "WEBSITE" ? [
    ["Method", d.method],
    ["Expected status", d.expectedStatusRange],
    ["Body must contain", d.keywordMatch || "Not checked"],
    ["Body must not contain", d.keywordAbsent || "Not checked"],
    ["Authentication", AUTH_LABEL[d.authType] ?? d.authType],
    ["Custom headers", d.headerNames.length ? d.headerNames.join(", ") : "None"],
    ["Request body", d.hasBody ? "Sent with each check" : "None"],
    ["Proxy", d.usesProxy ? "Through a proxy" : "Direct"],
    ["IP family", IP_LABEL[d.ipFamily] ?? d.ipFamily],
    ["TLS errors", d.verifyTls ? "Rejected" : "Ignored"],
    ["Skip caches", flag(d.cacheBuster)],
    ["Save error response", flag(d.saveErrorResponse)],
    ["Upside-down mode", flag(d.upsideDown)],
  ] : kind === "DNS" ? [
    ["Record type", d.dnsRecordType ?? "A"],
    ["Expected value", d.dnsExpectedValue || "Only that the record exists"],
  ] : kind === "JOB" ? [
    ["Heartbeat URL", d.hasHeartbeatUrl ? "Created" : "Not created yet: open Edit and choose Create or rotate heartbeat URL"],
    ["Authentication", AUTH_LABEL[d.authType] ?? d.authType],
    ["Last heartbeat", when(d.lastHeartbeatAt)],
  ] : [
    ...(kind === "PORT" && m.type === "TLS" ? [["TLS errors", d.verifyTls ? "Rejected" : "Ignored"] as Row] : []),
    ["Upside-down mode", flag(d.upsideDown)],
    ["IP family", IP_LABEL[d.ipFamily] ?? d.ipFamily],
  ];
  const expiry: Row[] = kind === "JOB" ? [] : [
    ...(m.type === "HTTP" || m.type === "TLS" ? [["Certificate warning", d.certExpiryNotify || m.type === "TLS" ? `${d.sslWarnDays ?? "Organization default"}${d.sslWarnDays ? " days before" : ""}` : "Off"] as Row, ["Certificate expires", when(d.certExpiresAt)] as Row] : []),
    ["Domain expiry warning", flag(d.domainExpiryNotify)],
    ...(d.domainExpiryNotify ? [["Domain expires", when(d.domainExpiresAt)] as Row] : []),
  ];
  const automation: Row[] = [
    ["Flip component status", flag(d.actions.flipStatus)],
    ["Record response-time metric", flag(d.actions.recordMetric)],
    ["Auto open and close incident", flag(d.actions.autoIncident)],
    ["Notify subscribers", flag(d.actions.notify)],
  ];

  return createPortal(
    <Dialog open onOpenChange={onClose}>
      <DialogSurface className="flex max-h-[88dvh] max-w-3xl! flex-col overflow-hidden">
        <header className="-mx-6 -mt-6 flex items-start gap-3 border-b border-line bg-primary-soft/50 px-4 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="min-w-0 truncate text-lg font-semibold tracking-tight text-ink" title={m.name}>{m.name}</h2>
              <StatusBadge tone={STATE_TONE[monitor.state]} live={monitor.state === "up"}>{STATE_LABEL[monitor.state]}</StatusBadge>
            </div>
            <p className="mt-0.5 truncate font-mono text-xs text-ink-soft" title={target}>{target}</p>
          </div>
          {canManage && <Link href={`/organization/monitors/${m.id}/edit`} className={buttonVariants({ variant: "ghost", size: "icon", className: "size-8 shrink-0 [&_svg]:!text-primary-ink" })} aria-label={`Edit ${m.name}`} title="Edit"><Pencil aria-hidden size={16} /></Link>}
          <a href={monitor.pageHref} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "ghost", size: "icon", className: "size-8 shrink-0 [&_svg]:!text-ok-fg" })} aria-label="Open status page" title="Open status page"><ExternalLink aria-hidden size={16} /></a>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 shrink-0 place-items-center rounded-control text-ink-dim outline-none hover:bg-sunken hover:text-ink focus-visible:ring-4 focus-visible:ring-primary/25"><X aria-hidden size={18} /></button>
        </header>

        <div className="-mx-6 flex-1 space-y-6 overflow-y-auto px-4 py-5 text-sm leading-6 text-ink-soft sm:px-6">
          {monitor.lastError && (
            <p className="flex items-start gap-2 rounded-control border border-danger/25 bg-danger-bg px-3 py-2 text-danger-fg">
              <AlertTriangle aria-hidden size={16} className="mt-1 shrink-0" />
              <span className="min-w-0 break-words">{monitor.lastError}</span>
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label="Last latency">{monitor.lastLatencyMs === null ? "—" : `${monitor.lastLatencyMs} ms`}</Tile>
            <Tile label={`Uptime, last ${checks.length || 0}`}>{checks.length ? `${Math.round((upCount / checks.length) * 100)}%` : "—"}</Tile>
            <Tile label="Average latency">{latencies.length ? `${Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)} ms` : "—"}</Tile>
            <Tile label="Last checked">{monitor.lastCheckedAt ? when(monitor.lastCheckedAt) : "Never"}</Tile>
          </div>

          <Section title={`Recent checks${checks.length ? ` (${checks.length})` : ""}`}>
            {checks.length === 0 ? <p className="rounded-control border border-dashed border-line px-3 py-4 text-center text-ink-dim">No checks yet.</p> : (
              <>
                <div className="flex h-8 items-stretch gap-[2px]" role="img" aria-label={`${upCount} of ${checks.length} recent checks up`}>
                  {ordered.map((check) => <span key={check.id} aria-hidden className={cn("block min-w-[3px] flex-1 rounded-[1px]", check.ok ? "bg-ok" : "bg-danger")} />)}
                </div>
                <ul className="max-h-56 divide-y divide-line/70 overflow-y-auto rounded-control border border-line/70">
                  {checks.map((check) => (
                    <li key={check.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-1.5 text-xs">
                      <StatusBadge tone={check.ok ? "ok" : "danger"}>{check.ok ? "OK" : "Failed"}</StatusBadge>
                      <span className="tabular-nums text-ink">{new Date(check.checkedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" })}</span>
                      <span className="tabular-nums text-ink-dim">{check.latencyMs === null ? "" : `${check.latencyMs} ms`}</span>
                      {check.statusCode && <span className="text-ink-dim">HTTP {check.statusCode}</span>}
                      {check.error && <span className="min-w-0 basis-full break-words text-danger-fg sm:basis-auto">{check.error}</span>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Section>

          <Section title="What is watched"><Rows rows={watching} /></Section>
          <Section title="Schedule and thresholds"><Rows rows={schedule} /></Section>
          <Section title={kind === "WEBSITE" ? "Request and response" : kind === "DNS" ? "DNS check" : kind === "JOB" ? "Heartbeat" : "Connection"}><Rows rows={request} /></Section>
          {expiry.length > 0 && <Section title="Expiry monitoring"><Rows rows={expiry} /></Section>}
          <Section title="Automated actions"><Rows rows={automation} /></Section>
          <p className="text-xs text-ink-dim">Credentials, header values and request bodies are never shown here. Use Edit to change them.</p>
        </div>

        <footer className="-mx-6 -mb-6 flex justify-end border-t border-line px-4 py-3 sm:px-6">
          <button type="button" onClick={onClose} className="rounded-control px-3 py-1.5 text-sm font-semibold text-primary-ink outline-none hover:bg-primary-soft focus-visible:ring-4 focus-visible:ring-primary/25">Close</button>
        </footer>
      </DialogSurface>
    </Dialog>,
    document.body,
  );
}
