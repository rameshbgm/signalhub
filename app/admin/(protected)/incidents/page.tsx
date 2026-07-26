import Link from "next/link";
import { requireSession } from "@/lib/require-session";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { INCIDENT_STATUS_LABEL, IMPACT_LABEL, type IncidentStatus, type Impact } from "@/lib/status";
import { scopedPageFilter, sessionHasCapability } from "@/lib/admin-guard";

export default async function IncidentsListPage() {
  const { session, org } = await requireSession();
  const pages = (await collections.pages().find(scopedPageFilter(session, org.id)).toArray()).map(toId);
  const pageIds = pages.map((p) => oid(p.id));
  const pageNameById = Object.fromEntries(pages.map((p) => [p.id, p.name]));
  const canDeclare = sessionHasCapability(session, "incident.manage");

  const incidents = (
    await collections
      .incidents()
      .find({ pageId: { $in: pageIds }, isMaintenance: false })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray()
  ).map(toId);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="font-mono text-xl font-semibold text-[var(--fg)]">Incidents</h1>
        {canDeclare && <Link
          href="/organization/incidents/new"
          className="bg-[var(--cyan)] text-[var(--on-cyan)] px-4 py-2 text-sm font-mono font-semibold text-center"
        >
          Declare Incident
        </Link>}
      </div>
      <div className="space-y-2">
        {incidents.map((inc) => (
          <Link
            key={inc.id}
            href={`/organization/incidents/${inc.id}`}
            className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border border-[var(--line)] bg-[var(--surface)] p-3 text-sm hover:border-[var(--line-bright)]"
          >
            <div>
              <span className="font-medium text-[var(--fg)]">{inc.name}</span>
              <span className="text-xs text-[var(--fg-dim)] ml-2">{pageNameById[inc.pageId]}</span>
              {inc.backfilled && (
                <span className="text-[10px] uppercase tracking-wide bg-[var(--surface-raised)] text-[var(--fg-dim)] px-1.5 py-0.5 ml-2">
                  backfilled
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <span className="text-[10px] uppercase tracking-wide font-semibold bg-[var(--surface-raised)] text-[var(--fg-soft)] px-1.5 py-0.5">
                {IMPACT_LABEL[inc.impact as Impact]}
              </span>
              <span
                className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 ${
                  inc.status === "RESOLVED" ? "bg-[var(--green-soft)] text-[var(--green)]" : "bg-[var(--amber-soft)] text-[var(--amber)]"
                }`}
              >
                {INCIDENT_STATUS_LABEL[inc.status as IncidentStatus]}
              </span>
            </div>
          </Link>
        ))}
        {incidents.length === 0 && <p className="text-sm text-[var(--fg-dim)]">No incidents yet.</p>}
      </div>
    </div>
  );
}
