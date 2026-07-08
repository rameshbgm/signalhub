import { requireSession } from "@/lib/require-session";
import { prisma } from "@/lib/db";
import { addSubscriber, importSubscribersCsv, toggleQuarantine, removeSubscriber } from "./actions";
import { PageSelect } from "@/components/admin/PageSelect";

export default async function SubscribersPage({ searchParams }: { searchParams: Promise<{ pageId?: string; channel?: string }> }) {
  const { org } = await requireSession();
  const { pageId: pageIdParam, channel } = await searchParams;
  const pages = await prisma.page.findMany({ where: { orgId: org.id, isHub: false }, orderBy: { createdAt: "asc" } });
  const pageId = pageIdParam && pages.some((p) => p.id === pageIdParam) ? pageIdParam : pages[0]?.id;

  if (!pageId) return <p className="text-sm text-gray-400">Create a page first.</p>;

  const subscribers = await prisma.subscriber.findMany({
    where: { pageId, ...(channel ? { channel } : {}) },
    orderBy: { createdAt: "desc" },
  });
  const counts = await prisma.subscriber.groupBy({ by: ["channel"], where: { pageId }, _count: true });
  const quarantinedCount = subscribers.filter((s) => s.quarantined).length;
  const boundAdd = addSubscriber.bind(null, pageId);
  const boundImport = importSubscribersCsv.bind(null, pageId);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Subscribers</h1>
        <div className="w-56">
          <PageSelect pages={pages.map((p) => ({ id: p.id, name: p.name }))} basePath="/admin/subscribers" selected={pageId} />
        </div>
      </div>

      <div className="grid sm:grid-cols-4 gap-4">
        {counts.map((c) => (
          <div key={c.channel} className="bg-white border rounded-lg p-4">
            <p className="text-2xl font-semibold">{c._count}</p>
            <p className="text-xs text-gray-400">{c.channel}</p>
          </div>
        ))}
        <div className="bg-white border rounded-lg p-4">
          <p className="text-2xl font-semibold text-red-600">{quarantinedCount}</p>
          <p className="text-xs text-gray-400">Quarantined</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <form action={boundAdd} className="bg-white border rounded-lg p-4 space-y-2">
          <h2 className="font-semibold text-sm">Add Subscriber</h2>
          <select name="channel" className="w-full border rounded-md px-3 py-2 text-sm">
            <option value="EMAIL">Email</option>
            <option value="SMS">SMS</option>
            <option value="WEBHOOK">Webhook</option>
            <option value="SLACK">Slack</option>
          </select>
          <input name="contact" placeholder="Email, phone, or URL" className="w-full border rounded-md px-3 py-2 text-sm" required />
          <button className="bg-blue-600 text-white rounded-md px-4 py-2 text-sm font-medium">Add</button>
        </form>

        <form action={boundImport} className="bg-white border rounded-lg p-4 space-y-2">
          <h2 className="font-semibold text-sm">Bulk Import (CSV)</h2>
          <select name="channel" className="w-full border rounded-md px-3 py-2 text-sm">
            <option value="EMAIL">Email</option>
            <option value="SMS">SMS</option>
          </select>
          <textarea name="csv" rows={3} placeholder="one@example.com, two@example.com" className="w-full border rounded-md px-3 py-2 text-sm" />
          <div className="flex justify-between items-center">
            <button className="bg-gray-800 text-white rounded-md px-4 py-2 text-sm font-medium">Import</button>
            <a href={`/admin/subscribers/export?pageId=${pageId}`} className="text-xs text-blue-600 hover:underline">
              Export CSV
            </a>
          </div>
        </form>
      </div>

      <div className="bg-white border rounded-lg divide-y">
        {subscribers.map((s) => (
          <div key={s.id} className="flex items-center justify-between p-3 text-sm">
            <div>
              <span className="font-medium">{s.contact}</span>
              <span className="text-xs text-gray-400 ml-2">{s.channel}</span>
              {!s.verified && <span className="text-xs bg-yellow-100 text-yellow-700 rounded px-1.5 py-0.5 ml-2">pending verification</span>}
              {s.quarantined && <span className="text-xs bg-red-100 text-red-700 rounded px-1.5 py-0.5 ml-2">quarantined</span>}
            </div>
            <div className="flex gap-3">
              <form action={toggleQuarantine.bind(null, s.id)}>
                <button className="text-xs text-yellow-700 hover:underline">{s.quarantined ? "Unquarantine" : "Quarantine"}</button>
              </form>
              <form action={removeSubscriber.bind(null, s.id)}>
                <button className="text-xs text-red-600 hover:underline">Remove</button>
              </form>
            </div>
          </div>
        ))}
        {subscribers.length === 0 && <p className="p-3 text-sm text-gray-400">No subscribers yet.</p>}
      </div>
    </div>
  );
}
