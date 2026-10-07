import { PageSubmitButton } from "@/components/admin/PageSubmitButton";
import type { ReactNode } from "react";
import { AlertTriangle, ChevronDown, History, Info, Link2, MonitorDot, Pause, Pencil, Play, Plus, RefreshCw, Trash2, type LucideIcon } from "lucide-react";
import { requireSession } from "@/lib/require-session";
import { sql } from "kysely";
import { database } from "@/lib/postgres/client";
import { createMonitor, toggleMonitorEnabled, deleteMonitor, runMonitorNow, updateMonitor } from "./actions";
import { MonitorForm } from "@/components/admin/MonitorForm";
import { PageSelect } from "@/components/admin/PageSelect";
import { HeartbeatTokenManager } from "@/components/admin/HeartbeatTokenManager";
import { NoPagesState } from "@/components/admin/operate-ui";
import { getScopedPages, sessionHasCapability } from "@/lib/admin-guard";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActionRow, InlineActionForm } from "@/components/InlineActionForm";

function relativeTime(date: Date | null): string {
  if (!date) return "never";
  const diffSec = Math.round((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
  return `${Math.round(diffSec / 86400)}d ago`;
}

const MONITOR_STATE = {
  up: { label: "Up", tone: "ok" },
  down: { label: "Down", tone: "danger" },
  pending: { label: "Pending", tone: "neutral" },
  disabled: { label: "Disabled", tone: "neutral" },
} as const;

/** A collapsible section inside a monitor card, built on the native <details> element. */
function Disclosure({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <details className="group rounded-control border border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-control px-3.5 py-2.5 text-sm font-medium text-ink-soft outline-none transition-colors duration-200 hover:bg-sunken focus-visible:ring-4 focus-visible:ring-primary/25 [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          <Icon aria-hidden size={16} className="text-primary" />
          {title}
        </span>
        <ChevronDown aria-hidden size={16} className="text-primary transition-transform duration-200 ease-soft group-open:rotate-180" />
      </summary>
      <div className="border-t border-line">{children}</div>
    </details>
  );
}

export default async function MonitorsPage({ searchParams }: { searchParams: Promise<{ pageId?: string }> }) {
  const { session, org } = await requireSession();
  const { pageId: pageIdParam } = await searchParams;
  const pages = await getScopedPages(session, org.id, { isHub: false });
  const pageId = pageIdParam && pages.some((p) => p.id === pageIdParam) ? pageIdParam : pages[0]?.id;
  if (!pageId) {
    return (
      <div className="space-y-8">
        <PageHeader title="Monitors" icon={MonitorDot} hue="sky" description="Check your services on a schedule and keep component status up to date." />
        <NoPagesState description="Monitors belong to a status page. Create one before you add monitors." canCreate={sessionHasCapability(session, "page.configure")} />
      </div>
    );
  }

  const monitors = await database.selectFrom("monitors").selectAll()
    .where("pageId", "=", pageId).orderBy("createdAt", "desc").execute();
  const monitorIds = monitors.map((monitor) => monitor.id);
  const rankedChecks = database.selectFrom("monitorChecks").selectAll()
    .select(sql<number>`row_number() over (partition by monitor_id order by checked_at desc)`.as("rank"))
    .$if(monitorIds.length > 0, (query) => query.where("monitorId", "in", monitorIds));
  const checks = monitorIds.length
    ? await database.selectFrom(rankedChecks.as("rankedChecks")).selectAll()
        .where("rank", "<=", 10).execute()
    : [];
  const checksByMonitor = new Map(monitors.map((monitor) => [
    monitor.id,
    checks.filter((check) => check.monitorId === monitor.id),
  ]));
  const components = await database.selectFrom("components").selectAll().where("pageId", "=", pageId).execute();
  const componentsById = new Map(components.map((c) => [c.id, c.name]));
  const latestHeartbeat = await database.selectFrom("workerHeartbeats").selectAll()
    .orderBy("lastSeenAt", "desc").executeTakeFirst();
  // Server-render timestamp used only to classify a persisted heartbeat.
  // eslint-disable-next-line react-hooks/purity
  const renderedAt = Date.now();
  const workerOnline = Boolean(
    latestHeartbeat &&
      latestHeartbeat.status === "READY" &&
      latestHeartbeat.lastSeenAt > new Date(renderedAt - 30_000)
  );
  const canManage = sessionHasCapability(session, "monitor.manage");
  const stateOf = (m: (typeof monitors)[number]) => (!m.enabled ? "disabled" : m.lastOk === null ? "pending" : m.isDown ? "down" : "up") as keyof typeof MONITOR_STATE;
  const counts = { up: 0, down: 0, other: 0 };
  for (const m of monitors) {
    const state = stateOf(m);
    if (state === "up" || state === "down") counts[state] += 1;
    else counts.other += 1;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Monitors"
        icon={MonitorDot}
        hue="sky"
        description="Check your services on a schedule and keep component status up to date."
        actions={
          <div className="w-full sm:w-60">
            <PageSelect pages={pages.map((p) => ({ id: p.id, name: p.name }))} basePath="/organization/monitors" selected={pageId} />
          </div>
        }
      />

      {!workerOnline && (
        <Alert tone="warn">
          The worker is offline or stale. Checks, scheduled transitions, and notification delivery are paused.
        </Alert>
      )}

      {!canManage && (
        <Alert tone="info">
          Read-only monitor access. A responder or administrator can manage monitors.
        </Alert>
      )}

      {canManage && (
        <details className="group rounded-card border border-line bg-surface shadow-card" open={monitors.length === 0}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-card px-5 py-4 outline-none focus-visible:ring-4 focus-visible:ring-primary/25">
            <span className="inline-flex items-center gap-2 text-base font-semibold text-ink">
              <Plus aria-hidden size={18} className="text-primary" />
              Add a monitor
            </span>
            <ChevronDown aria-hidden size={18} className="text-primary transition-transform duration-200 ease-soft group-open:rotate-180" />
          </summary>
          <div className="border-t border-line p-5">
            <MonitorForm action={createMonitor.bind(null, pageId)} components={components.map((c) => ({ id: c.id, name: c.name }))} />
          </div>
        </details>
      )}

      {monitors.length === 0 ? (
        <EmptyState
          icon={MonitorDot}
          hue="sky"
          title="No monitors yet"
          description="Monitors check a service on a schedule and update its component when it goes down. Monitors for this page appear here."
          className="py-20"
        />
      ) : (
        <section aria-label="Monitors" className="space-y-5">
          <div className="flex flex-wrap items-center gap-2" aria-label="Monitor status summary">
            <StatusBadge tone="ok">{counts.up} up</StatusBadge>
            <StatusBadge tone="danger">{counts.down} down</StatusBadge>
            {counts.other > 0 && <StatusBadge tone="neutral">{counts.other} pending or disabled</StatusBadge>}
          </div>

          {monitors.map((m) => {
            const state = MONITOR_STATE[stateOf(m)];
            const history = checksByMonitor.get(m.id) ?? [];

            return (
              <Card key={m.id}>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="min-w-0 truncate text-base font-semibold tracking-tight text-ink">{m.name}</h2>
                        <StatusBadge tone={state.tone} live={state.label === "Up"}>{state.label}</StatusBadge>
                      </div>
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-dim">
                        <Badge>{m.type}</Badge>
                        <span className="min-w-0 break-all font-mono">
                          {m.target}
                          {m.port ? `:${m.port}` : ""}
                        </span>
                        {m.componentId && (
                          <span className="inline-flex items-center gap-1">
                            <Link2 aria-hidden size={13} />
                            {componentsById.get(m.componentId) ?? "unknown component"}
                          </span>
                        )}
                      </p>
                    </div>
                    {canManage && (
                      <ActionRow className="flex flex-wrap items-center gap-2">
                        <InlineActionForm action={runMonitorNow.bind(null, m.id)}>
                          <Button type="submit" variant="secondary" size="sm"><RefreshCw aria-hidden size={14} />Check on next poll</Button>
                        </InlineActionForm>
                        <InlineActionForm action={toggleMonitorEnabled.bind(null, m.id)}>
                          <Button type="submit" variant="outline" size="sm">
                            {m.enabled ? <Pause aria-hidden size={14} /> : <Play aria-hidden size={14} />}
                            {m.enabled ? "Disable" : "Enable"}
                          </Button>
                        </InlineActionForm>
                        <InlineActionForm action={deleteMonitor.bind(null, m.id)}>
                          <PageSubmitButton variant="ghost" size="sm" pendingLabel="Deleting…" confirmMessage={`Delete the monitor ${m.name} and its check history? This cannot be undone.`} className="hover:bg-danger-bg hover:text-danger-fg [&_svg]:!text-ink-dim hover:[&_svg]:!text-danger-fg">
                            <Trash2 aria-hidden size={14} />
                            Delete
                          </PageSubmitButton>
                        </InlineActionForm>
                      </ActionRow>
                    )}
                  </div>

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
                    <div className="min-w-0">
                      <dt className="text-xs text-ink-dim">Last checked</dt>
                      <dd className="mt-0.5 font-medium text-ink">{relativeTime(m.lastCheckedAt)}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs text-ink-dim">Latency</dt>
                      <dd className="mt-0.5 font-medium tabular-nums text-ink">{m.lastLatencyMs === null ? "—" : `${m.lastLatencyMs} ms`}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs text-ink-dim">Interval</dt>
                      <dd className="mt-0.5 font-medium tabular-nums text-ink">Every {m.intervalSec}s</dd>
                    </div>
                    {m.groupName && (
                      <div className="min-w-0">
                        <dt className="text-xs text-ink-dim">Group</dt>
                        <dd className="mt-0.5 truncate font-medium text-ink">{m.groupName}</dd>
                      </div>
                    )}
                  </dl>

                  {m.lastError && (
                    <p className="flex items-start gap-2 rounded-control bg-danger-bg px-3 py-2 text-xs leading-5 text-danger-fg">
                      <AlertTriangle aria-hidden size={14} className="mt-0.5 shrink-0" />
                      <span className="min-w-0 break-words">{m.lastError}</span>
                    </p>
                  )}

                  {m.tags && m.tags.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
                      {m.tags.map((tag) => <li key={tag}><Badge>{tag}</Badge></li>)}
                    </ul>
                  )}

                  {m.type === "HEARTBEAT" && canManage && <HeartbeatTokenManager monitorId={m.id} />}

                  {canManage && (
                    <Disclosure icon={Pencil} title="Edit monitor">
                      <div className="p-4"><MonitorForm action={updateMonitor.bind(null, m.id)} components={components.map((c) => ({ id: c.id, name: c.name }))} monitor={m} /></div>
                    </Disclosure>
                  )}

                  <Disclosure icon={History} title="Recent check history">
                    <Table className="min-w-[32rem]">
                      <TableHeader>
                        <TableRow><TableHead>Checked</TableHead><TableHead>Result</TableHead><TableHead>Latency</TableHead><TableHead>Response</TableHead></TableRow>
                      </TableHeader>
                      <TableBody>
                        {history.map((check) => (
                          <TableRow key={check.id}>
                            <TableCell className="whitespace-nowrap px-4 py-2.5 tabular-nums">{new Date(check.checkedAt).toLocaleString()}</TableCell>
                            <TableCell className="px-4 py-2.5"><StatusBadge tone={check.ok ? "ok" : "danger"}>{check.ok ? "Up" : "Down"}</StatusBadge></TableCell>
                            <TableCell className="px-4 py-2.5 tabular-nums">{check.latencyMs === null ? "—" : `${check.latencyMs} ms`}</TableCell>
                            <TableCell className="max-w-64 truncate px-4 py-2.5">{check.error ?? (check.statusCode ? `HTTP ${check.statusCode}` : "OK")}</TableCell>
                          </TableRow>
                        ))}
                        {history.length === 0 && (
                          <TableRow><TableCell colSpan={4} className="px-4 py-6 text-center text-ink-dim">No checks have run yet.</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </Disclosure>
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}

      <p className="flex items-start gap-2 text-xs leading-5 text-ink-dim">
        <Info aria-hidden size={14} className="mt-0.5 shrink-0" />
        Checks run in the compiled TypeScript worker with PostgreSQL-backed leases. Docker Compose supervises it separately from the web process,
        so multiple worker replicas can safely share the queue.
      </p>
    </div>
  );
}
