import { Info, MonitorDot } from "lucide-react";
import { sql } from "kysely";
import { requireSession } from "@/lib/require-session";
import { database } from "@/lib/postgres/client";
import type { MonitorRow } from "@/lib/postgres/schema";
import { createMonitor, toggleMonitorEnabled, deleteMonitor, runMonitorNow, updateMonitor } from "./actions";
import type { MonitorFormValues } from "@/components/admin/MonitorForm";
import { MonitorDrawer } from "@/components/admin/MonitorDrawer";
import { MonitorList, type MonitorListItem } from "@/components/admin/MonitorList";
import { PageSelect } from "@/components/admin/PageSelect";
import { NoPagesState } from "@/components/admin/operate-ui";
import { getScopedPages, sessionHasCapability } from "@/lib/admin-guard";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

/** Only the fields the edit form needs; stored secrets and token hashes stay on the server. */
function formValues(m: MonitorRow): MonitorFormValues {
  return {
    id: m.id, name: m.name, type: m.type, target: m.target, port: m.port, componentId: m.componentId,
    method: m.method, expectedStatusRange: m.expectedStatusRange, timeoutMs: m.timeoutMs,
    requestHeaders: m.requestHeaders, requestBody: m.requestBody, keywordMatch: m.keywordMatch,
    keywordAbsent: m.keywordAbsent, sslWarnDays: m.sslWarnDays, dnsRecordType: m.dnsRecordType,
    dnsExpectedValue: m.dnsExpectedValue, heartbeatGraceSec: m.heartbeatGraceSec, verifyTls: m.verifyTls,
    authType: m.authType, authUsername: m.authUsername, authHeaderName: m.authHeaderName,
    intervalSec: m.intervalSec, failThreshold: m.failThreshold, recoverThreshold: m.recoverThreshold,
    downStatus: m.downStatus, groupName: m.groupName, tags: m.tags ?? [],
    actionFlipStatus: m.actionFlipStatus, actionRecordMetric: m.actionRecordMetric,
    actionAutoIncident: m.actionAutoIncident, actionNotify: m.actionNotify,
    hasAuthSecret: Boolean(m.authSecret),
  };
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
        .where("rank", "<=", 30).execute()
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
  const componentOptions = components.map((c) => ({ id: c.id, name: c.name }));
  const items: MonitorListItem[] = monitors.map((m) => ({
    values: formValues(m),
    enabled: m.enabled,
    state: !m.enabled ? "paused" : m.lastOk === null ? "pending" : m.isDown ? "down" : "up",
    componentName: m.componentId ? componentsById.get(m.componentId) ?? "unknown component" : null,
    lastError: m.lastError,
    lastCheckedAt: m.lastCheckedAt?.toISOString() ?? null,
    lastLatencyMs: m.lastLatencyMs,
    checks: (checksByMonitor.get(m.id) ?? []).map((check) => ({
      id: check.id, checkedAt: new Date(check.checkedAt).toISOString(), ok: check.ok,
      statusCode: check.statusCode, latencyMs: check.latencyMs, error: check.error,
    })),
    actions: {
      run: runMonitorNow.bind(null, m.id),
      toggle: toggleMonitorEnabled.bind(null, m.id),
      remove: deleteMonitor.bind(null, m.id),
      update: updateMonitor.bind(null, m.id),
    },
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monitors"
        icon={MonitorDot}
        hue="sky"
        description="Check your services on a schedule and keep component status up to date."
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <div className="w-full sm:w-60">
              <PageSelect pages={pages.map((p) => ({ id: p.id, name: p.name }))} basePath="/organization/monitors" selected={pageId} />
            </div>
            {canManage && <MonitorDrawer action={createMonitor.bind(null, pageId)} components={componentOptions} />}
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

      {monitors.length === 0 ? (
        <EmptyState
          icon={MonitorDot}
          hue="sky"
          title="No monitors yet"
          description="Monitors check a service on a schedule and update its component when it goes down. Use Add monitor to create the first one."
          className="py-20"
        />
      ) : (
        <MonitorList monitors={items} components={componentOptions} canManage={canManage} now={renderedAt} />
      )}

      <p className="flex items-start gap-2 text-xs leading-5 text-ink-dim">
        <Info aria-hidden size={14} className="mt-0.5 shrink-0" />
        Checks run in the compiled TypeScript worker with PostgreSQL-backed leases. Docker Compose supervises it separately from the web process,
        so multiple worker replicas can safely share the queue.
      </p>
    </div>
  );
}
