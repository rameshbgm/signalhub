import { requireSession } from "@/lib/require-session";
import { FluentSelect } from "@/components/FluentSelect";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { addSubscriber, importSubscribersCsv, toggleQuarantine, removeSubscriber, retryNotificationJob } from "./actions";
import { PageSelect } from "@/components/admin/PageSelect";
import { HelpTip } from "@/components/HelpTip";
import { requireCapability, scopedPageFilter } from "@/lib/admin-guard";

const CHANNELS = [
  { value: "EMAIL", label: "Email" },
  { value: "SMS", label: "SMS" },
];

const CONTACT_PLACEHOLDER: Record<string, string> = {
  EMAIL: "customer@example.com",
  SMS: "+12025550123",
};

export default async function SubscribersPage({ searchParams }: { searchParams: Promise<{ pageId?: string; channel?: string }> }) {
  const { session, org } = await requireSession();
  await requireCapability("subscriber.manage");
  const { pageId: pageIdParam, channel: channelParam } = await searchParams;
  const pages = (await collections.pages().find(scopedPageFilter(session, org.id, { isHub: false })).sort({ createdAt: 1 }).toArray()).map(toId);
  const pageId = pageIdParam && pages.some((p) => p.id === pageIdParam) ? pageIdParam : pages[0]?.id;

  if (!pageId) return <p className="text-sm text-[var(--fg-dim)]">Create a page first.</p>;

  const channel = CHANNELS.some((c) => c.value === channelParam) ? channelParam! : "EMAIL";

  const allForPage = (await collections.subscribers().find({ pageId: oid(pageId) }).toArray()).map(toId);
  const subscribers = allForPage.filter((s) => s.channel === channel);
  const deliveryJobs = (
    await collections
      .notificationJobs()
      .find({ pageId: oid(pageId), channel })
      .sort({ updatedAt: -1 })
      .limit(20)
      .toArray()
  ).map(toId);
  const pendingDeliveryCount = deliveryJobs.filter((job) => ["PENDING", "PROCESSING"].includes(job.status)).length;
  const failedDeliveries = deliveryJobs.filter((job) => job.status === "DEAD_LETTER");
  const countsByChannel = allForPage.reduce<Record<string, number>>((acc, s) => {
    acc[s.channel] = (acc[s.channel] ?? 0) + 1;
    return acc;
  }, {});

  const active = subscribers.filter((s) => s.verified && !s.quarantined).length;
  const quarantined = subscribers.filter((s) => s.quarantined).length;
  const unconfirmed = subscribers.filter((s) => !s.verified).length;

  const boundAdd = addSubscriber.bind(null, pageId);
  const boundImport = importSubscribersCsv.bind(null, pageId);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-mono text-xl font-semibold text-[var(--fg)]">Subscribers</h1>
          <p className="mt-0.5 text-sm text-[var(--fg-soft)]">{allForPage.length} subscribers</p>
        </div>
        <div className="w-full sm:w-56">
          <PageSelect pages={pages.map((p) => ({ id: p.id, name: p.name }))} basePath="/organization/subscribers" selected={pageId} />
        </div>
      </div>

      {/* Channel tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-[var(--line)]">
        {CHANNELS.map((c) => (
          <a
            key={c.value}
            href={`/organization/subscribers?pageId=${pageId}&channel=${c.value}`}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors ${
              channel === c.value ? "border-[var(--cyan)] text-[var(--cyan)]" : "border-transparent text-[var(--fg-soft)] hover:text-[var(--fg)]"
            }`}
          >
            {c.label}
            {countsByChannel[c.value] ? <span className="ml-1.5 text-xs text-[var(--fg-dim)]">{countsByChannel[c.value]}</span> : null}
          </a>
        ))}
      </div>

      {/* Status bar */}
      <div className="flex flex-wrap items-center gap-4 sm:gap-6 border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm">
        <span className="text-[var(--fg-soft)]">
          {subscribers.length} total, {subscribers.filter((s) => {
            const d = new Date(s.createdAt);
            const now = new Date();
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
          }).length}{" "}
          added this month.
        </span>
        <span className="flex items-center gap-2 font-medium text-[var(--cyan)] sm:ml-auto">
          Active <span className="bg-[var(--cyan-soft)] px-2 py-0.5 text-xs">{active}</span>
        </span>
        <span className="flex items-center gap-2 font-medium text-[var(--fg-soft)]">
          Quarantined <span className="bg-[var(--surface-raised)] px-2 py-0.5 text-xs">{quarantined}</span>
        </span>
        <span className="flex items-center gap-2 font-medium text-[var(--fg-soft)]">
          Unconfirmed <span className="bg-[var(--surface-raised)] px-2 py-0.5 text-xs">{unconfirmed}</span>
        </span>
      </div>

      {(pendingDeliveryCount > 0 || failedDeliveries.length > 0) && (
        <section aria-labelledby="delivery-state-title" className="border border-[var(--line)] bg-[var(--surface)] p-4">
          <h2 id="delivery-state-title" className="font-mono text-sm font-semibold text-[var(--fg)]">Delivery state</h2>
          <p className="mt-1 text-xs text-[var(--fg-soft)]">
            {pendingDeliveryCount} queued or processing · {failedDeliveries.length} recently failed
          </p>
          {failedDeliveries.length > 0 && (
            <ul className="mt-3 space-y-2">
              {failedDeliveries.slice(0, 5).map((job) => (
                <li key={job.id} className="border-l-2 border-[var(--red)] pl-3 text-xs">
                  <span className="font-medium text-[var(--fg)]">{job.contact}</span>
                  <span className="ml-2 text-[var(--red)]">{job.lastError ?? "Delivery failed"}</span>
                  <span className="ml-2 text-[var(--fg-dim)]">attempt {job.attempts}/{job.maxAttempts}</span>
                  <form action={retryNotificationJob.bind(null, job.id)} className="mt-1">
                    <button className="border border-[var(--line)] px-2 py-1 text-[10px] font-semibold text-[var(--fg-soft)]">
                      Retry now
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <form action={boundAdd} className="space-y-2 border border-[var(--line)] bg-[var(--surface)] p-4">
          <h2 className="font-mono text-sm font-semibold text-[var(--fg)]">Add Subscriber</h2>
          <FluentSelect
            name="channel"
            defaultValue={channel}
            className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] outline-none focus:border-[var(--cyan)]"
          >
            {CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </FluentSelect>
          <input
            name="contact"
            placeholder={CONTACT_PLACEHOLDER[channel]}
            className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] outline-none placeholder:text-[var(--fg-dim)] focus:border-[var(--cyan)]"
            required
          />
          <button className="bg-[var(--cyan)] px-4 py-2 text-sm font-medium text-[var(--on-cyan)] transition-opacity hover:opacity-90">Add</button>
        </form>

        <form action={boundImport} className="space-y-2 border border-[var(--line)] bg-[var(--surface)] p-4">
          <div className="flex items-center gap-1.5">
            <h2 className="font-mono text-sm font-semibold text-[var(--fg)]">Bulk Import (CSV)</h2>
            <HelpTip text="Paste comma or newline separated email addresses; administrator imports are treated as verified." />
          </div>
          <FluentSelect
            name="channel"
            className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] outline-none focus:border-[var(--cyan)]"
          >
            <option value="EMAIL">Email</option>
          </FluentSelect>
          <textarea
            name="csv"
            rows={3}
            placeholder="one@example.com, two@example.com"
            className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] outline-none placeholder:text-[var(--fg-dim)] focus:border-[var(--cyan)]"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button className="bg-[var(--surface-raised)] border border-[var(--line-bright)] px-4 py-2 text-sm font-medium text-[var(--fg)] transition-colors hover:border-[var(--cyan)]">
              Import
            </button>
            <a href={`/organization/subscribers/export?pageId=${pageId}`} className="text-xs text-[var(--cyan)] hover:underline">
              Export CSV
            </a>
          </div>
        </form>
      </div>

      <div className="divide-y divide-[var(--line)] border border-[var(--line)] bg-[var(--surface)]">
        {subscribers.map((s) => (
          <div key={s.id} className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="font-medium text-[var(--fg)]">{s.contact}</span>
              {!s.verified && (
                <span className="ml-2 bg-[var(--amber-soft)] px-1.5 py-0.5 text-xs text-[var(--amber)]">pending verification</span>
              )}
              {s.quarantined && <span className="ml-2 bg-[var(--red-soft)] px-1.5 py-0.5 text-xs text-[var(--red)]">quarantined</span>}
            </div>
            <div className="flex gap-3">
              <form action={toggleQuarantine.bind(null, s.id)}>
                <button className="border border-[var(--amber)]/30 px-2.5 py-1 text-xs font-semibold text-[var(--amber)] transition-colors hover:bg-[var(--amber-soft)]">{s.quarantined ? "Unquarantine" : "Quarantine"}</button>
              </form>
              <form action={removeSubscriber.bind(null, s.id)}>
                <button className="border border-[var(--red)]/30 px-2.5 py-1 text-xs font-semibold text-[var(--red)] transition-colors hover:bg-[var(--red-soft)]">Remove</button>
              </form>
            </div>
          </div>
        ))}
        {subscribers.length === 0 && (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-[var(--fg-soft)]">No {CHANNELS.find((c) => c.value === channel)?.label.toLowerCase()} subscribers</p>
            <p className="mt-1 text-xs text-[var(--fg-dim)]">Subscribers on this channel will appear here once added or confirmed.</p>
          </div>
        )}
      </div>
    </div>
  );
}
