import { requireSession } from "@/lib/require-session";
import { prisma } from "@/lib/db";
import { createMetric, pushMetricPoint, toggleMetricVisible, deleteMetric } from "./actions";
import { PageSelect } from "@/components/admin/PageSelect";

export default async function MetricsPage({ searchParams }: { searchParams: Promise<{ pageId?: string }> }) {
  const { org } = await requireSession();
  const { pageId: pageIdParam } = await searchParams;
  const pages = await prisma.page.findMany({ where: { orgId: org.id, isHub: false }, orderBy: { createdAt: "asc" } });
  const pageId = pageIdParam && pages.some((p) => p.id === pageIdParam) ? pageIdParam : pages[0]?.id;
  if (!pageId) return <p className="text-sm text-gray-400">Create a page first.</p>;

  const metrics = await prisma.metric.findMany({ where: { pageId }, include: { points: { orderBy: { timestamp: "desc" }, take: 1 } } });
  const components = await prisma.component.findMany({ where: { pageId } });
  const boundCreate = createMetric.bind(null, pageId);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Metrics</h1>
        <div className="w-56">
          <PageSelect pages={pages.map((p) => ({ id: p.id, name: p.name }))} basePath="/admin/metrics" selected={pageId} />
        </div>
      </div>

      <form action={boundCreate} className="bg-white border rounded-lg p-4 grid sm:grid-cols-2 gap-3">
        <input name="name" placeholder="Metric name (e.g. API Response Time)" className="border rounded-md px-3 py-2 text-sm" required />
        <input name="suffix" placeholder="Unit suffix (e.g. ms, %)" className="border rounded-md px-3 py-2 text-sm" />
        <input name="description" placeholder="Description (optional)" className="border rounded-md px-3 py-2 text-sm sm:col-span-2" />
        <select name="componentId" className="border rounded-md px-3 py-2 text-sm">
          <option value="">Not tied to a component</option>
          {components.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button className="bg-blue-600 text-white rounded-md px-4 py-2 text-sm font-medium sm:col-span-2">Add Metric</button>
      </form>

      <div className="space-y-2">
        {metrics.map((m) => (
          <div key={m.id} className="bg-white border rounded-lg p-4 text-sm">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium">{m.name}</span>
                <span className="text-xs text-gray-400 ml-2">
                  latest: {m.points[0] ? `${m.points[0].value}${m.suffix}` : "—"}
                </span>
                {!m.visible && <span className="text-xs bg-gray-100 rounded px-1.5 py-0.5 ml-2">hidden</span>}
              </div>
              <div className="flex gap-3">
                <form action={toggleMetricVisible.bind(null, m.id)}>
                  <button className="text-xs text-blue-600 hover:underline">{m.visible ? "Hide" : "Show"}</button>
                </form>
                <form action={deleteMetric.bind(null, m.id)}>
                  <button className="text-xs text-red-600 hover:underline">Delete</button>
                </form>
              </div>
            </div>
            <form action={pushMetricPoint.bind(null, m.id)} className="flex gap-2 mt-3">
              <input name="value" type="number" step="any" placeholder="Push a data point" className="flex-1 border rounded-md px-3 py-2 text-xs" required />
              <button className="bg-gray-800 text-white rounded-md px-3 py-2 text-xs">Push</button>
            </form>
            <p className="text-xs text-gray-400 mt-2">
              Or push programmatically: <code className="bg-gray-100 px-1 rounded">POST /api/v1/manage/metrics/{m.id}/points</code>
            </p>
          </div>
        ))}
        {metrics.length === 0 && <p className="text-sm text-gray-400">No metrics yet.</p>}
      </div>
    </div>
  );
}
