import { requireSession } from "@/lib/require-session";
import { FluentSelect } from "@/components/FluentSelect";
import { collections } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";
import { requireCapability } from "@/lib/admin-guard";
import Link from "next/link";
import { auditRetentionCutoff } from "@/lib/audit-retention";
import { AuditLogList } from "@/components/admin/AuditLogList";

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; action?: string; page?: string }>;
}) {
  const { org } = await requireSession();
  await requireCapability("audit.view");
  const parameters = await searchParams;
  const query = parameters.q?.trim() ?? "";
  const action = parameters.action?.trim() ?? "";
  const page = Math.max(1, Number(parameters.page ?? 1));
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const filter = {
    orgId: oid(org.id),
    createdAt: { $gte: auditRetentionCutoff() },
    ...(query ? { $or: [
      { actor: { $regex: escaped, $options: "i" } },
      { target: { $regex: escaped, $options: "i" } },
    ] } : {}),
    ...(action ? { action } : {}),
  };
  const pageSize = 100;
  const logs = (
    await collections.auditLogs().find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray()
  ).map((entry) => ({
    id: entry._id.toHexString(), actor: entry.actor, action: entry.action,
    target: entry.target, createdAt: entry.createdAt.toISOString(),
    metadata: entry.metadata ? JSON.parse(JSON.stringify(entry.metadata)) as Record<string, unknown> : null,
  }));
  const [total, actions] = await Promise.all([
    collections.auditLogs().countDocuments(filter),
    collections.auditLogs().distinct("action", { orgId: oid(org.id), createdAt: { $gte: auditRetentionCutoff() } }),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-mono text-xl font-semibold text-[var(--fg)]">Audit Log</h1>
        <div className="flex gap-2 text-xs">
          <Link href="/api/admin/audit/export?format=csv" className="text-[var(--cyan)]">Export CSV</Link>
          <Link href="/api/admin/audit/export?format=json" className="text-[var(--cyan)]">Export JSON</Link>
        </div>
      </div>
      <form className="grid gap-2 border border-[var(--line)] bg-[var(--surface)] p-3 sm:grid-cols-[1fr_14rem_auto]">
        <input name="q" defaultValue={query} placeholder="Actor or target" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs" />
        <FluentSelect aria-label="Filter by action" name="action" defaultValue={action} className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs">
          <option value="">All actions</option>
          {actions.sort().map((value) => <option key={value} value={value}>{value}</option>)}
        </FluentSelect>
        <button className="border border-[var(--cyan)]/40 px-3 py-2 text-xs font-semibold text-[var(--cyan)]">Filter</button>
      </form>
      <AuditLogList logs={logs} />
      <div className="flex items-center justify-between text-xs text-[var(--fg-dim)]">
        <span>{total} entries</span>
        <div className="flex gap-3">
          {page > 1 && <Link href={`?q=${encodeURIComponent(query)}&action=${encodeURIComponent(action)}&page=${page - 1}`} className="text-[var(--cyan)]">Previous</Link>}
          {page * pageSize < total && <Link href={`?q=${encodeURIComponent(query)}&action=${encodeURIComponent(action)}&page=${page + 1}`} className="text-[var(--cyan)]">Next</Link>}
        </div>
      </div>
    </div>
  );
}
