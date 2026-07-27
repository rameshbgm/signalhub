import { requireSession } from "@/lib/require-session";
import { FluentSelect } from "@/components/FluentSelect";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { addMonitorTemplate, removeMonitorTemplate, toggleMonitorEnabled, deleteMonitor, runMonitorNow, updateMonitor } from "./actions";
import { PageSelect } from "@/components/admin/PageSelect";
import { HeartbeatTokenManager } from "@/components/admin/HeartbeatTokenManager";
import { scopedPageFilter, sessionHasCapability } from "@/lib/admin-guard";

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
  const pages = (await collections.pages().find(scopedPageFilter(session, org.id, { isHub: false })).sort({ createdAt: 1 }).toArray()).map(toId);
  const pageId = pageIdParam && pages.some((p) => p.id === pageIdParam) ? pageIdParam : pages[0]?.id;
  if (!pageId) return <p className="text-sm text-[var(--fg-dim)]">Create a page first.</p>;

  const monitorDocs = await collections.monitors().find({ pageId: oid(pageId) }).sort({ createdAt: -1 }).toArray();
  const monitors = monitorDocs.map(toId);
  const templates = (await collections.monitorTemplates().find({ enabled: true }).sort({ category: 1, name: 1 }).toArray()).map(toId);
  const attachedByTemplate = new Map<string, (typeof monitors)[number]>(
    monitors.filter((monitor) => monitor.templateId).map((monitor) => [String(monitor.templateId), monitor])
  );
  const checkRows = await Promise.all(
    monitorDocs.map((monitor) =>
      collections.monitorChecks().find({ monitorId: monitor._id }).sort({ checkedAt: -1 }).limit(10).toArray()
    )
  );
  const checksByMonitor = new Map(
    monitorDocs.map((monitor, index) => [monitor._id.toHexString(), checkRows[index]])
  );
  const components = (await collections.components().find({ pageId: oid(pageId) }).toArray()).map(toId);
  const componentsById = new Map(components.map((c) => [c.id, c.name]));
  const latestHeartbeat = await collections.workerHeartbeats().find().sort({ lastSeenAt: -1 }).limit(1).next();
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

      <section className="space-y-3 border border-[var(--line)] bg-[var(--surface)] p-4">
        <div>
          <h2 className="font-mono text-base font-semibold text-[var(--fg)]">Global monitor templates</h2>
          <p className="mt-1 text-sm text-[var(--fg-soft)]">The platform catalog is the read-only master. Add a monitor to show it on this page, or remove it without changing the global template.</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {templates.map((template) => {
            const attached = attachedByTemplate.get(template.id);
            return (
              <article key={template.id} className="border border-[var(--line)] bg-[var(--bg)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-[var(--fg)]">{template.name}</h3>
                    <p className="mt-1 text-xs text-[var(--fg-dim)]">{template.category} · {template.type}</p>
                    <p className="mt-2 text-xs text-[var(--fg-soft)]">{template.description}</p>
                  </div>
                  <span className={`shrink-0 px-2 py-1 font-mono text-[10px] uppercase ${attached ? "bg-[var(--green-soft)] text-[var(--green)]" : "bg-[var(--surface-raised)] text-[var(--fg-dim)]"}`}>{attached ? "Shown" : "Available"}</span>
                </div>
                {canManage && (attached ? (
                  <form action={removeMonitorTemplate.bind(null, attached.id)} className="mt-3">
                    <button className="border border-[var(--red)]/30 px-3 py-1.5 text-xs font-semibold text-[var(--red)] hover:bg-[var(--red-soft)]">Remove from page</button>
                  </form>
                ) : (
                  <form action={addMonitorTemplate.bind(null, pageId, template.id)} className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <FluentSelect name="componentId" aria-label={`Component for ${template.name}`} className="min-w-0 flex-1 border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-xs">
                      <option value="">Page-wide monitor</option>
                      {components.map((component) => <option key={component.id} value={component.id}>{component.name}</option>)}
                    </FluentSelect>
                    <button className="bg-[var(--cyan)] px-3 py-1.5 text-xs font-semibold text-[var(--on-cyan)]">Add to page</button>
                  </form>
                ))}
              </article>
            );
          })}
        </div>
      </section>

      {!canManage && (
        <div className="border border-[var(--line)] bg-[var(--surface)] p-3 text-sm text-[var(--fg-soft)]">
          Read-only monitor access. A responder or administrator can add or remove global monitors.
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
                  {m.templateId && <span className="ml-2 bg-[var(--cyan-soft)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--cyan)]">Global master</span>}
                  {m.componentId && (
                    <span className="ml-2 text-xs text-[var(--fg-dim)]">→ {componentsById.get(m.componentId) ?? "unknown component"}</span>
                  )}
                </div>
                {canManage && <div className="flex flex-wrap gap-3">
                  <form action={runMonitorNow.bind(null, m.id)}>
                    <button className="border border-[var(--cyan)]/30 px-2.5 py-1 text-xs font-semibold text-[var(--cyan)] transition-colors hover:bg-[var(--cyan-soft)]">Check on next poll</button>
                  </form>
                  {m.templateId ? (
                    <form action={removeMonitorTemplate.bind(null, m.id)}><button className="border border-[var(--red)]/30 px-2.5 py-1 text-xs font-semibold text-[var(--red)] hover:bg-[var(--red-soft)]">Remove from page</button></form>
                  ) : <>
                    <form action={toggleMonitorEnabled.bind(null, m.id)}><button className="border border-[var(--cyan)]/30 px-2.5 py-1 text-xs font-semibold text-[var(--cyan)] transition-colors hover:bg-[var(--cyan-soft)]">{m.enabled ? "Disable" : "Enable"}</button></form>
                    <form action={deleteMonitor.bind(null, m.id)}><button className="border border-[var(--red)]/30 px-2.5 py-1 text-xs font-semibold text-[var(--red)] transition-colors hover:bg-[var(--red-soft)]">Delete</button></form>
                  </>}
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
              {canManage && !m.templateId && (
                <details className="mt-3 border-t border-[var(--line)] pt-3">
                  <summary className="cursor-pointer text-xs font-medium text-[var(--fg-soft)]">
                    Edit monitor
                  </summary>
                  <form action={updateMonitor.bind(null, m.id)} className="mt-3 grid gap-2 sm:grid-cols-2">
                    <input name="name" defaultValue={m.name} aria-label="Monitor name" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs" required />
                    <input name="target" defaultValue={m.target} aria-label="Monitor target" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs" required />
                    <FluentSelect name="componentId" defaultValue={m.componentId ?? ""} aria-label="Linked component" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs">
                      <option value="">No linked component</option>
                      {components.map((component) => <option key={component.id} value={component.id}>{component.name}</option>)}
                    </FluentSelect>
                    <input name="groupName" defaultValue={m.groupName ?? ""} placeholder="Group" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs" />
                    <input name="intervalSec" type="number" min={10} max={86400} defaultValue={m.intervalSec} aria-label="Interval seconds" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs" />
                    <input name="timeoutMs" type="number" min={100} max={60000} defaultValue={m.timeoutMs} aria-label="Timeout milliseconds" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs" />
                    <input name="failThreshold" type="number" min={1} max={20} defaultValue={m.failThreshold} aria-label="Failure threshold" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs" />
                    <input name="recoverThreshold" type="number" min={1} max={20} defaultValue={m.recoverThreshold} aria-label="Recovery threshold" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs" />
                    <input name="tags" defaultValue={m.tags?.join(", ") ?? ""} placeholder="Tags, comma separated" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs sm:col-span-2" />
                    <button className="bg-[var(--cyan)] px-3 py-2 text-xs font-semibold text-[var(--on-cyan)] sm:col-span-2">Save monitor</button>
                  </form>
                </details>
              )}
              <details className="mt-3 border-t border-[var(--line)] pt-3">
                <summary className="cursor-pointer text-xs font-medium text-[var(--fg-soft)]">
                  Recent check history
                </summary>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[32rem] text-left text-xs">
                    <thead className="text-[var(--fg-dim)]">
                      <tr><th className="py-1">Checked</th><th>Result</th><th>Latency</th><th>Response</th></tr>
                    </thead>
                    <tbody>
                      {(checksByMonitor.get(m.id) ?? []).map((check) => (
                        <tr key={check._id.toHexString()} className="border-t border-[var(--line)]">
                          <td className="py-1.5 font-mono">{new Date(check.checkedAt).toLocaleString()}</td>
                          <td className={check.ok ? "text-[var(--green)]" : "text-[var(--red)]"}>{check.ok ? "Up" : "Down"}</td>
                          <td>{check.latencyMs === null ? "—" : `${check.latencyMs} ms`}</td>
                          <td className="max-w-64 truncate">{check.error ?? (check.statusCode ? `HTTP ${check.statusCode}` : "OK")}</td>
                        </tr>
                      ))}
                      {!checksByMonitor.get(m.id)?.length && (
                        <tr><td colSpan={4} className="py-2 text-[var(--fg-dim)]">No checks have run yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          );
        })}
        {monitors.length === 0 && <p className="text-sm text-[var(--fg-dim)]">No monitors yet.</p>}
      </div>

      <p className="text-xs text-[var(--fg-dim)]">
        Checks run in the compiled TypeScript worker with Mongo-backed leases. Docker Compose supervises it separately from the web process,
        so multiple worker replicas can safely share the queue.
      </p>
    </div>
  );
}
