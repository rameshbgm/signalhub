import { requireSession } from "@/lib/require-session";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { addSubscriber, importSubscribersCsv, toggleQuarantine, removeSubscriber } from "./actions";
import { PageSelect } from "@/components/admin/PageSelect";

const CHANNELS = [
  { value: "EMAIL", label: "Email" },
  { value: "SMS", label: "SMS" },
  { value: "SLACK", label: "Slack" },
  { value: "MICROSOFT_TEAMS", label: "Microsoft Teams" },
  { value: "WEBHOOK", label: "Webhook" },
];

const CONTACT_PLACEHOLDER: Record<string, string> = {
  EMAIL: "customer@example.com",
  SMS: "+14155550100",
  SLACK: "https://hooks.slack.com/services/...",
  MICROSOFT_TEAMS: "https://outlook.office.com/webhook/...",
  WEBHOOK: "https://example.com/webhook-receiver",
};

export default async function SubscribersPage({ searchParams }: { searchParams: Promise<{ pageId?: string; channel?: string }> }) {
  const { org } = await requireSession();
  const { pageId: pageIdParam, channel: channelParam } = await searchParams;
  const pages = (await collections.pages().find({ orgId: oid(org.id), isHub: false }).sort({ createdAt: 1 }).toArray()).map(toId);
  const pageId = pageIdParam && pages.some((p) => p.id === pageIdParam) ? pageIdParam : pages[0]?.id;

  if (!pageId) return <p className="text-sm text-gray-400">Create a page first.</p>;

  const channel = CHANNELS.some((c) => c.value === channelParam) ? channelParam! : "EMAIL";

  const allForPage = (await collections.subscribers().find({ pageId: oid(pageId) }).toArray()).map(toId);
  const subscribers = allForPage.filter((s) => s.channel === channel);
  const countsByChannel = allForPage.reduce<Record<string, number>>((acc, s) => {
    acc[s.channel] = (acc[s.channel] ?? 0) + 1;
    return acc;
  }, {});

  const active = subscribers.filter((s) => s.verified && !s.quarantined).length;
  const quarantined = subscribers.filter((s) => s.quarantined).length;
  const unconfirmed = subscribers.filter((s) => !s.verified).length;

  const boundAdd = addSubscriber.bind(null, pageId);
  const boundImport = importSubscribersCsv.bind(null, pageId);
  const limit = 100;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Subscribers</h1>
          <p className="text-sm text-gray-400 mt-0.5">{allForPage.length} of {limit} subscribers</p>
        </div>
        <div className="w-56">
          <PageSelect pages={pages.map((p) => ({ id: p.id, name: p.name }))} basePath="/admin/subscribers" selected={pageId} />
        </div>
      </div>

      {/* Channel tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {CHANNELS.map((c) => (
          <a
            key={c.value}
            href={`/admin/subscribers?pageId=${pageId}&channel=${c.value}`}
            className={`px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              channel === c.value ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {c.label}
            {countsByChannel[c.value] ? <span className="ml-1.5 text-xs text-gray-400">{countsByChannel[c.value]}</span> : null}
          </a>
        ))}
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-6 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm">
        <span className="text-gray-500">
          {subscribers.length} total, {subscribers.filter((s) => {
            const d = new Date(s.createdAt);
            const now = new Date();
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
          }).length}{" "}
          added this month.
        </span>
        <span className="ml-auto flex items-center gap-2 font-medium text-blue-600">
          Active <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs">{active}</span>
        </span>
        <span className="flex items-center gap-2 font-medium text-gray-700">
          Quarantined <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">{quarantined}</span>
        </span>
        <span className="flex items-center gap-2 font-medium text-gray-700">
          Unconfirmed <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">{unconfirmed}</span>
        </span>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <form action={boundAdd} className="bg-white border rounded-lg p-4 space-y-2">
          <h2 className="font-semibold text-sm">Add Subscriber</h2>
          <select name="channel" defaultValue={channel} className="w-full border rounded-md px-3 py-2 text-sm">
            {CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <input name="contact" placeholder={CONTACT_PLACEHOLDER[channel]} className="w-full border rounded-md px-3 py-2 text-sm" required />
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
        {subscribers.length === 0 && (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-gray-600">No {CHANNELS.find((c) => c.value === channel)?.label.toLowerCase()} subscribers</p>
            <p className="text-xs text-gray-400 mt-1">Subscribers on this channel will appear here once added or confirmed.</p>
          </div>
        )}
      </div>
    </div>
  );
}
