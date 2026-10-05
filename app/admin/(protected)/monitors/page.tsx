import { requireSession } from "@/lib/require-session";
import { sql } from "kysely";
import { Select } from "@/components/ui/select";
import { database } from "@/lib/postgres/client";
import { toggleMonitorEnabled, deleteMonitor, runMonitorNow, updateMonitor } from "./actions";
import { PageSelect } from "@/components/admin/PageSelect";
import { HeartbeatTokenManager } from "@/components/admin/HeartbeatTokenManager";
import { getScopedPages, sessionHasCapability } from "@/lib/admin-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function relativeTime(date: Date | null): string {
  if (!date) return "never";
  const diffSec = Math.round((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
  return `${Math.round(diffSec / 86400)}d ago`;
}

export default async function MonitorsPage({ searchParams }: { searchParams: Promise<{ pageId?: string }> }) {
  const { session, org } = await requireSession();
  const { pageId: pageIdParam } = await searchParams;
  const pages = await getScopedPages(session, org.id, { isHub: false });
  const pageId = pageIdParam && pages.some((p) => p.id === pageIdParam) ? pageIdParam : pages[0]?.id;
  if (!pageId) return <p className="text-sm text-[var(--fg-dim)]">Create a page first.</p>;

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

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-mono text-xl font-semibold text-[var(--fg)]">Monitors</h1>
        <div className="w-full sm:w-56">
          <PageSelect pages={pages.map((p) => ({ id: p.id, name: p.name }))} basePath="/organization/monitors" selected={pageId} />
        </div>
      </div>

      {!workerOnline && (
        <div role="alert" className="border border-[var(--amber)]/40 bg-[var(--amber-soft)] p-3 text-sm text-[var(--amber)]">
          The worker is offline or stale. Checks, scheduled transitions, and notification delivery are paused.
        </div>
      )}

      {!canManage && (
        <div className="border border-[var(--line)] bg-[var(--surface)] p-3 text-sm text-[var(--fg-soft)]">
          Read-only monitor access. A responder or administrator can manage monitors.
        </div>
      )}

      <div className="space-y-2">
        {monitors.map((m) => {
          const isDown = m.isDown;
          const statusLabel = !m.enabled ? "disabled" : m.lastOk === null ? "pending" : isDown ? "down" : "up";
          const statusColor =
            statusLabel === "up"
              ? "bg-[var(--green-soft)] text-[var(--green)]"
              : statusLabel === "down"
                ? "bg-[var(--red-soft)] text-[var(--red)]"
                : "bg-[var(--surface-raised)] text-[var(--fg-soft)]";

          return (
            <div key={m.id} className="border border-[var(--line)] bg-[var(--surface)] p-4 text-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <span className="font-medium text-[var(--fg)]">{m.name}</span>
                  <span className="ml-2 text-xs text-[var(--fg-dim)]">
                    {m.type} · {m.target}
                    {m.port ? `:${m.port}` : ""}
                  </span>
                  <span className={`ml-2 px-1.5 py-0.5 text-xs uppercase tracking-wide ${statusColor}`}>{statusLabel}</span>
                  {m.componentId && (
                    <span className="ml-2 text-xs text-[var(--fg-dim)]">→ {componentsById.get(m.componentId) ?? "unknown component"}</span>
                  )}
                </div>
                {canManage && <div className="flex flex-wrap gap-3">
                  <form action={runMonitorNow.bind(null, m.id)}>
                    <Button type="submit" variant="outline" size="sm" className="text-[var(--cyan)]">Check on next poll</Button>
                  </form>
                  <form action={toggleMonitorEnabled.bind(null, m.id)}><Button type="submit" variant="outline" size="sm" className="text-[var(--cyan)]">{m.enabled ? "Disable" : "Enable"}</Button></form>
                  <form action={deleteMonitor.bind(null, m.id)}><Button type="submit" variant="destructive" size="sm">Delete</Button></form>
                </div>}
              </div>
              <p className="mt-2 text-xs text-[var(--fg-dim)]">
                last checked {relativeTime(m.lastCheckedAt)}
                {m.lastLatencyMs !== null && ` · ${m.lastLatencyMs}ms`}
                {m.lastError && ` · ${m.lastError}`}
                {` · every ${m.intervalSec}s`}
              </p>
              {(m.groupName || m.tags?.length) && (
                <p className="mt-1 text-xs text-[var(--fg-dim)]">
                  {m.groupName && <span className="mr-2">Group: {m.groupName}</span>}
                  {m.tags?.map((tag) => <span key={tag} className="mr-1 bg-[var(--surface-raised)] px-1.5 py-0.5">{tag}</span>)}
                </p>
              )}
              {m.type === "HEARTBEAT" && canManage && <HeartbeatTokenManager monitorId={m.id} />}
              {canManage && (
                <details className="mt-3 border-t border-[var(--line)] pt-3">
                  <summary className="cursor-pointer text-xs font-medium text-[var(--fg-soft)]">
                    Edit monitor
                  </summary>
                  <form action={updateMonitor.bind(null, m.id)} className="mt-3 grid gap-2 sm:grid-cols-2">
                    <Input name="name" defaultValue={m.name} aria-label="Monitor name" className="text-xs" required />
                    <Input name="target" defaultValue={m.target} aria-label="Monitor target" className="text-xs" required />
                    <Select name="componentId" defaultValue={m.componentId ?? ""} aria-label="Linked component" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs">
                      <option value="">No linked component</option>
                      {components.map((component) => <option key={component.id} value={component.id}>{component.name}</option>)}
                    </Select>
                    <Input name="groupName" defaultValue={m.groupName ?? ""} placeholder="Group" className="text-xs" />
                    <Input name="intervalSec" type="number" min={10} max={86400} defaultValue={m.intervalSec} aria-label="Interval seconds" className="text-xs" />
                    <Input name="timeoutMs" type="number" min={100} max={60000} defaultValue={m.timeoutMs} aria-label="Timeout milliseconds" className="text-xs" />
                    <Input name="failThreshold" type="number" min={1} max={20} defaultValue={m.failThreshold} aria-label="Failure threshold" className="text-xs" />
                    <Input name="recoverThreshold" type="number" min={1} max={20} defaultValue={m.recoverThreshold} aria-label="Recovery threshold" className="text-xs" />
                    <Input name="tags" defaultValue={m.tags?.join(", ") ?? ""} placeholder="Tags, comma separated" className="text-xs sm:col-span-2" />
                    <Button type="submit" className="sm:col-span-2">Save monitor</Button>
                  </form>
                </details>
              )}
              <details className="mt-3 border-t border-[var(--line)] pt-3">
                <summary className="cursor-pointer text-xs font-medium text-[var(--fg-soft)]">
                  Recent check history
                </summary>
                <div className="mt-2 overflow-x-auto">
                  <Table className="min-w-[32rem] text-left text-xs">
                    <TableHeader className="text-[var(--fg-dim)]">
                      <TableRow><TableHead className="py-1">Checked</TableHead><TableHead>Result</TableHead><TableHead>Latency</TableHead><TableHead>Response</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {(checksByMonitor.get(m.id) ?? []).map((check) => (
                        <TableRow key={check.id} className="border-t border-[var(--line)]">
                          <TableCell className="py-1.5 font-mono">{new Date(check.checkedAt).toLocaleString()}</TableCell>
                          <TableCell className={check.ok ? "text-[var(--green)]" : "text-[var(--red)]"}>{check.ok ? "Up" : "Down"}</TableCell>
                          <TableCell>{check.latencyMs === null ? "—" : `${check.latencyMs} ms`}</TableCell>
                          <TableCell className="max-w-64 truncate">{check.error ?? (check.statusCode ? `HTTP ${check.statusCode}` : "OK")}</TableCell>
                        </TableRow>
                      ))}
                      {!checksByMonitor.get(m.id)?.length && (
                        <TableRow><TableCell colSpan={4} className="py-2 text-[var(--fg-dim)]">No checks have run yet.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </details>
            </div>
          );
        })}
        {monitors.length === 0 && <p className="text-sm text-[var(--fg-dim)]">No monitors yet.</p>}
      </div>

      <p className="text-xs text-[var(--fg-dim)]">
        Checks run in the compiled TypeScript worker with PostgreSQL-backed leases. Docker Compose supervises it separately from the web process,
        so multiple worker replicas can safely share the queue.
      </p>
    </div>
  );
}
