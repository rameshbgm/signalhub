import Link from "next/link";
import { Info, MonitorDot } from "lucide-react";
import { requireSession } from "@/lib/require-session";
import { database } from "@/lib/postgres/client";
import { latestChecksByMonitor } from "@/lib/monitor-checks";
import { bulkMonitorAction, toggleMonitorEnabled, deleteMonitor, runMonitorNow } from "./actions";
import { MonitorList, type MonitorListItem } from "@/components/admin/MonitorList";
import { PageSelect } from "@/components/admin/PageSelect";
import { NoPagesState } from "@/components/admin/operate-ui";
import { getScopedPages, sessionHasCapability } from "@/lib/admin-guard";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { publicPagePath } from "@/lib/public-path";
import { PageHeader } from "@/components/ui/page-header";

/** Names only: header values often carry API keys and never leave the server. */
function headerNames(json: string) {
  try {
    const parsed: unknown = JSON.parse(json || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? Object.keys(parsed) : [];
  } catch {
    return [];
  }
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
  const checksByMonitor = await latestChecksByMonitor(monitorIds, 30);
  const components = await database.selectFrom("components").select(["id", "name"]).where("pageId", "=", pageId).execute();
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
  const pageHref = publicPagePath(pages.find((p) => p.id === pageId)!);
  const items: MonitorListItem[] = monitors.map((m) => ({
    values: { id: m.id, name: m.name, type: m.type, target: m.target, port: m.port, tags: m.tags ?? [], groupName: m.groupName },
    enabled: m.enabled,
    state: !m.enabled ? "paused" : m.lastOk === null ? "pending" : m.isDown ? "down" : "up",
    componentName: m.componentId ? componentsById.get(m.componentId) ?? "unknown component" : null,
    lastError: m.lastError,
    lastCheckedAt: m.lastCheckedAt?.toISOString() ?? null,
    lastLatencyMs: m.lastLatencyMs,
    checks: checksByMonitor.get(m.id) ?? [],
    pageHref,
    details: {
      createdAt: m.createdAt.toISOString(),
      intervalSec: m.intervalSec,
      timeoutMs: m.timeoutMs,
      failThreshold: m.failThreshold,
      recoverThreshold: m.recoverThreshold,
      downStatus: m.downStatus,
      consecutiveFails: m.consecutiveFails,
      consecutiveOks: m.consecutiveOks,
      method: m.method,
      expectedStatusRange: m.expectedStatusRange,
      keywordMatch: m.keywordMatch,
      keywordAbsent: m.keywordAbsent,
      verifyTls: m.verifyTls,
      cacheBuster: m.cacheBuster,
      saveErrorResponse: m.saveErrorResponse,
      upsideDown: m.upsideDown,
      ipFamily: m.ipFamily,
      authType: m.authType,
      headerNames: headerNames(m.requestHeaders),
      hasBody: Boolean(m.requestBody),
      usesProxy: m.proxyId !== null,
      dnsRecordType: m.dnsRecordType,
      dnsExpectedValue: m.dnsExpectedValue,
      heartbeatGraceSec: m.heartbeatGraceSec,
      hasHeartbeatUrl: m.heartbeatTokenHash !== null,
      lastHeartbeatAt: m.lastHeartbeatAt?.toISOString() ?? null,
      certExpiryNotify: m.certExpiryNotify,
      domainExpiryNotify: m.domainExpiryNotify,
      sslWarnDays: m.sslWarnDays,
      certExpiresAt: m.certExpiresAt?.toISOString() ?? null,
      domainExpiresAt: m.domainExpiresAt?.toISOString() ?? null,
      actions: { flipStatus: m.actionFlipStatus, recordMetric: m.actionRecordMetric, autoIncident: m.actionAutoIncident, notify: m.actionNotify },
    },
    actions: {
      run: runMonitorNow.bind(null, m.id),
      toggle: toggleMonitorEnabled.bind(null, m.id),
      remove: deleteMonitor.bind(null, m.id),
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
            {canManage && (
              <Link href={`/organization/monitors/new?pageId=${pageId}`} className={buttonVariants()}>
                Add monitor
              </Link>
            )}
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
        <MonitorList monitors={items} canManage={canManage} now={renderedAt} bulkAction={bulkMonitorAction.bind(null, pageId)} viewsKey={pageId} />
      )}

      <p className="flex items-start gap-2 text-xs leading-5 text-ink-dim">
        <Info aria-hidden size={14} className="mt-0.5 shrink-0" />
        Checks run in the compiled TypeScript worker with PostgreSQL-backed leases. Docker Compose supervises it separately from the web process,
        so multiple worker replicas can safely share the queue.
      </p>
    </div>
  );
}
