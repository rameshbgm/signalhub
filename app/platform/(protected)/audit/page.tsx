import { collections } from "@/lib/db";
import { FluentSelect } from "@/components/FluentSelect";
import { requirePlatformCapability } from "@/lib/admin-guard";
import Link from "next/link";
import { hasPlatformCapability } from "@/lib/platform-policy";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { createAuditSink, setAuditSinkEnabled } from "./actions";

export default async function PlatformAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; action?: string }>;
}) {
  const session = await requirePlatformCapability("audit.read");
  const parameters = await searchParams;
  const query = parameters.q?.trim() ?? "";
  const action = parameters.action?.trim() ?? "";
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const entries = await collections
    .platformAuditLogs()
    .find({
      ...(query
        ? {
            $or: [
              { actorEmail: { $regex: escaped, $options: "i" } },
              { targetId: { $regex: escaped, $options: "i" } },
              { reason: { $regex: escaped, $options: "i" } },
            ],
          }
        : {}),
      ...(action ? { action } : {}),
    })
    .sort({ createdAt: -1 })
    .limit(300)
    .toArray();
  const organizations = await collections
    .organizations()
    .find({
      _id: {
        $in: entries
          .map((entry) => entry.organizationId)
          .filter((value): value is NonNullable<typeof value> => Boolean(value)),
      },
    })
    .toArray();
  const organizationNames = new Map(
    organizations.map((organization) => [organization._id.toHexString(), organization.name])
  );
  const actions = await collections.platformAuditLogs().distinct("action");
  const [sinks, sinkOrganizations, deadLetterCounts] = await Promise.all([
    collections.auditSinks().find({}).sort({ createdAt: -1 }).toArray(),
    collections.organizations().find({}, { projection: { name: 1 } }).sort({ name: 1 }).toArray(),
    collections.auditDeliveryJobs().aggregate<{ _id: string; count: number }>([
      { $match: { status: "DEAD_LETTER" } },
      { $group: { _id: { $toString: "$sinkId" }, count: { $sum: 1 } } },
    ]).toArray(),
  ]);
  const canManage = hasPlatformCapability(session.role, "audit.manage");
  const sinkOrgNames = new Map(sinkOrganizations.map((org) => [org._id.toHexString(), org.name]));
  const deadLetters = new Map(deadLetterCounts.map((entry) => [entry._id, entry.count]));

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="font-mono text-2xl font-semibold text-[var(--fg)]">Platform audit</h1>
        <p className="mt-1 text-sm text-[var(--fg-soft)]">
          Append-only operator, authentication, support, lifecycle, and worker job evidence.
        </p>
        <div className="mt-2 flex gap-3 text-xs">
          <Link href="/api/platform/audit/export?format=csv" className="text-[var(--cyan)]">Export CSV</Link>
          <Link href="/api/platform/audit/export?format=json" className="text-[var(--cyan)]">Export JSON</Link>
        </div>
      </div>
      <form className="grid gap-2 border border-[var(--line)] bg-[var(--surface)] p-3 sm:grid-cols-[1fr_16rem_auto]">
        <input
          name="q"
          defaultValue={query}
          placeholder="Actor, target ID, or reason"
          aria-label="Search audit"
          className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs"
        />
        <FluentSelect
          name="action"
          defaultValue={action}
          aria-label="Filter by action"
          className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs"
        >
          <option value="">All actions</option>
          {actions.sort().map((value) => <option key={value} value={value}>{value}</option>)}
        </FluentSelect>
        <button className="border border-[var(--cyan)]/40 px-4 py-2 text-xs font-semibold text-[var(--cyan)]">Filter</button>
      </form>

      <section className="space-y-3 border border-[var(--line)] bg-[var(--surface)] p-4">
        <div>
          <h2 className="font-mono text-sm font-semibold">External SIEM sinks</h2>
          <p className="mt-1 text-xs text-[var(--fg-dim)]">
            Sealed audit entries are delivered by the worker over signed HTTPS with retries and dead-letter visibility.
          </p>
        </div>
        {canManage && (
          <PlatformActionForm action={createAuditSink} successMessage="Audit sink created" className="grid gap-2 sm:grid-cols-2">
            <input name="name" placeholder="Sink name" required className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs" />
            <input name="url" type="url" placeholder="https://siem.example/events" required className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs" />
            <input name="secret" type="password" minLength={32} placeholder="HMAC signing secret (32+ characters)" required className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs" />
            <FluentSelect name="orgId" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs">
              <option value="">Platform audit</option>
              {sinkOrganizations.map((org) => <option key={org._id.toHexString()} value={org._id.toHexString()}>{org.name}</option>)}
            </FluentSelect>
            <button className="bg-[var(--cyan)] px-3 py-2 text-xs font-semibold text-[var(--on-cyan)] sm:col-span-2">Add sink</button>
          </PlatformActionForm>
        )}
        <div className="divide-y divide-[var(--line)] border border-[var(--line)]">
          {sinks.map((sink) => (
            <div key={sink._id.toHexString()} className="flex flex-wrap items-center justify-between gap-3 p-3 text-xs">
              <div>
                <p className="font-semibold">{sink.name} · {sink.enabled ? "Enabled" : "Disabled"}</p>
                <p className="mt-1 text-[var(--fg-dim)]">{sink.orgId ? sinkOrgNames.get(sink.orgId.toHexString()) ?? "Purged organization" : "Platform"} · {new URL(sink.url).host}</p>
                {deadLetters.get(sink._id.toHexString()) ? <p className="mt-1 text-[var(--red)]">{deadLetters.get(sink._id.toHexString())} dead-letter deliveries</p> : null}
              </div>
              {canManage && (
                <PlatformActionForm action={setAuditSinkEnabled.bind(null, sink._id.toHexString())} successMessage={sink.enabled ? "Sink disabled" : "Sink enabled"}>
                  <input type="hidden" name="enabled" value={String(!sink.enabled)} />
                  <button className="border border-[var(--line)] px-2.5 py-1">{sink.enabled ? "Disable" : "Enable"}</button>
                </PlatformActionForm>
              )}
            </div>
          ))}
          {!sinks.length && <p className="p-3 text-xs text-[var(--fg-dim)]">No external audit sinks configured.</p>}
        </div>
      </section>

      <div className="space-y-2">
        {entries.map((entry) => (
          <article key={entry._id.toHexString()} className="border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-mono text-sm font-semibold text-[var(--fg)]">{entry.action}</h2>
                  <span className="bg-[var(--bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--fg-soft)]">{entry.actorRole}</span>
                </div>
                <p className="mt-1 text-xs text-[var(--fg-soft)]">
                  {entry.actorEmail} → {entry.targetType}:{entry.targetId}
                </p>
                {entry.organizationId && (
                  <p className="mt-1 text-xs text-[var(--fg-dim)]">
                    Organization: {organizationNames.get(entry.organizationId.toHexString()) ?? `${entry.organizationId.toHexString()} (purged)`}
                  </p>
                )}
                {entry.reason && <p className="mt-2 text-sm text-[var(--fg)]">{entry.reason}</p>}
                {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-[var(--cyan)]">Metadata</summary>
                    <pre className="mt-2 max-h-56 overflow-auto border border-[var(--line)] bg-[var(--bg)] p-2 text-[10px] text-[var(--fg-soft)]">
                      {JSON.stringify(entry.metadata, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
              <time className="shrink-0 text-xs text-[var(--fg-dim)]">{entry.createdAt.toLocaleString()}</time>
            </div>
          </article>
        ))}
        {entries.length === 0 && (
          <p className="border border-[var(--line)] bg-[var(--surface)] p-4 text-sm text-[var(--fg-dim)]">
            No audit entries match these filters.
          </p>
        )}
      </div>
    </div>
  );
}
