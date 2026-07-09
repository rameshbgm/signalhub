import { requireSession } from "@/lib/require-session";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { createMonitor, toggleMonitorEnabled, deleteMonitor, runMonitorNow } from "./actions";
import { PageSelect } from "@/components/admin/PageSelect";
import { MonitorForm } from "@/components/admin/MonitorForm";

function relativeTime(date: Date | null): string {
  if (!date) return "never";
  const diffSec = Math.round((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
  return `${Math.round(diffSec / 86400)}d ago`;
}

export default async function MonitorsPage({ searchParams }: { searchParams: Promise<{ pageId?: string }> }) {
  const { org } = await requireSession();
  const { pageId: pageIdParam } = await searchParams;
  const pages = (await collections.pages().find({ orgId: oid(org.id), isHub: false }).sort({ createdAt: 1 }).toArray()).map(toId);
  const pageId = pageIdParam && pages.some((p) => p.id === pageIdParam) ? pageIdParam : pages[0]?.id;
  if (!pageId) return <p className="text-sm text-gray-400">Create a page first.</p>;

  const monitorDocs = await collections.monitors().find({ pageId: oid(pageId) }).sort({ createdAt: -1 }).toArray();
  const monitors = monitorDocs.map(toId);
  const components = (await collections.components().find({ pageId: oid(pageId) }).toArray()).map(toId);
  const componentsById = new Map(components.map((c) => [c.id, c.name]));

  const boundCreate = createMonitor.bind(null, pageId);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Monitors</h1>
        <div className="w-56">
          <PageSelect pages={pages.map((p) => ({ id: p.id, name: p.name }))} basePath="/admin/monitors" selected={pageId} />
        </div>
      </div>

      <MonitorForm action={boundCreate} components={components.map((c) => ({ id: c.id, name: c.name }))} />

      <div className="space-y-2">
        {monitors.map((m) => {
          const isDown = m.consecutiveFails >= m.failThreshold;
          const statusLabel = !m.enabled ? "disabled" : m.lastOk === null ? "pending" : isDown ? "down" : "up";
          const statusColor =
            statusLabel === "up" ? "bg-green-100 text-green-700" : statusLabel === "down" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500";

          return (
            <div key={m.id} className="bg-white border rounded-lg p-4 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium">{m.name}</span>
                  <span className="text-xs text-gray-400 ml-2">
                    {m.type} · {m.target}
                    {m.port ? `:${m.port}` : ""}
                  </span>
                  <span className={`text-xs rounded px-1.5 py-0.5 ml-2 ${statusColor}`}>{statusLabel}</span>
                  {m.componentId && <span className="text-xs text-gray-400 ml-2">→ {componentsById.get(m.componentId) ?? "unknown component"}</span>}
                </div>
                <div className="flex gap-3">
                  <form action={runMonitorNow.bind(null, m.id)}>
                    <button className="text-xs text-blue-600 hover:underline">Check on next poll</button>
                  </form>
                  <form action={toggleMonitorEnabled.bind(null, m.id)}>
                    <button className="text-xs text-blue-600 hover:underline">{m.enabled ? "Disable" : "Enable"}</button>
                  </form>
                  <form action={deleteMonitor.bind(null, m.id)}>
                    <button className="text-xs text-red-600 hover:underline">Delete</button>
                  </form>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                last checked {relativeTime(m.lastCheckedAt)}
                {m.lastLatencyMs !== null && ` · ${m.lastLatencyMs}ms`}
                {m.lastError && ` · ${m.lastError}`}
                {` · every ${m.intervalSec}s`}
              </p>
            </div>
          );
        })}
        {monitors.length === 0 && <p className="text-sm text-gray-400">No monitors yet.</p>}
      </div>

      <p className="text-xs text-gray-400">
        Checks run in the standalone <code className="bg-gray-100 px-1 rounded">monitor-service</code> Python process, which polls this database directly.
        Start it with <code className="bg-gray-100 px-1 rounded">python main.py</code> in <code className="bg-gray-100 px-1 rounded">monitor-service/</code>.
      </p>
    </div>
  );
}
