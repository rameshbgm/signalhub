import Link from "next/link";
import {
  IMPACT_COLOR,
  IMPACT_LABEL,
  INCIDENT_STATUS_LABEL,
  MAINTENANCE_STATUS_LABEL,
  type Impact,
  type IncidentStatus,
  type MaintenanceStatus,
} from "@/lib/status";

export type IncidentUpdateRow = { id: string; status: string; body: string; createdAt: Date };
export type IncidentRow = {
  id: string;
  name: string;
  status: string;
  impact: string;
  isMaintenance: boolean;
  maintenanceStatus: string | null;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  createdAt: Date;
  resolvedAt: Date | null;
  postmortemPublishedAt: Date | null;
  postmortemBody?: string | null;
  updates: IncidentUpdateRow[];
  components: { component: { name: string } }[];
  linkSlug?: string;
};

function fmt(d: Date) {
  return new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function IncidentCard({ incident, pageSlug, linkPermalink = true }: { incident: IncidentRow; pageSlug: string; linkPermalink?: boolean }) {
  const impact = incident.impact as Impact;
  const label = incident.isMaintenance
    ? MAINTENANCE_STATUS_LABEL[(incident.maintenanceStatus as MaintenanceStatus) ?? "SCHEDULED"]
    : INCIDENT_STATUS_LABEL[incident.status as IncidentStatus];

  return (
    <div className="border border-gray-200 rounded-xl p-5 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display font-semibold text-sm text-gray-900">
          {linkPermalink ? (
            <Link href={`/${incident.linkSlug ?? pageSlug}/incidents/${incident.id}`} className="hover:underline underline-offset-2">
              {incident.name}
            </Link>
          ) : (
            incident.name
          )}
        </h3>
        {!incident.isMaintenance && (
          <span className="text-xs font-medium px-2.5 py-1 rounded-full text-white shrink-0" style={{ backgroundColor: IMPACT_COLOR[impact] }}>
            {IMPACT_LABEL[impact]}
          </span>
        )}
      </div>
      {incident.components.length > 0 && (
        <p className="text-xs text-gray-400 mt-1.5">Affects: {incident.components.map((c) => c.component.name).join(", ")}</p>
      )}
      {incident.isMaintenance && incident.scheduledStart && (
        <p className="text-xs text-gray-500 mt-1.5">
          Window: {fmt(incident.scheduledStart)} — {incident.scheduledEnd ? fmt(incident.scheduledEnd) : "TBD"}
        </p>
      )}
      <div className="mt-4 space-y-4 border-l-2 border-gray-100 pl-4">
        {incident.updates.map((u) => (
          <div key={u.id} className="text-sm">
            <span className="font-medium text-gray-900">{incident.isMaintenance ? label : INCIDENT_STATUS_LABEL[u.status as IncidentStatus]}</span>
            <span className="text-gray-400 text-xs ml-2">{fmt(u.createdAt)}</span>
            <p className="text-gray-600 mt-1 whitespace-pre-wrap leading-relaxed">{u.body}</p>
          </div>
        ))}
      </div>
      {incident.postmortemPublishedAt && incident.postmortemBody && (
        <Link
          href={`/${incident.linkSlug ?? pageSlug}/incidents/${incident.id}`}
          className="inline-block mt-4 text-xs text-blue-600 underline underline-offset-2 hover:text-blue-700"
        >
          Read postmortem
        </Link>
      )}
    </div>
  );
}

export function PastIncidentsByDay({ incidents, pageSlug, days = 14 }: { incidents: IncidentRow[]; pageSlug: string; days?: number }) {
  const buckets: { date: string; label: string; incidents: IncidentRow[] }[] = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    buckets.push({
      date: key,
      label: d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
      incidents: incidents.filter((inc) => new Date(inc.createdAt).toISOString().slice(0, 10) === key),
    });
  }

  return (
    <div className="space-y-6">
      {buckets.map((b) => (
        <div key={b.date}>
          <h4 className="text-sm font-semibold text-gray-500 mb-2.5">{b.label}</h4>
          {b.incidents.length === 0 ? (
            <p className="text-sm text-gray-400">No incidents reported.</p>
          ) : (
            <div className="space-y-3">
              {b.incidents.map((inc) => (
                <IncidentCard key={inc.id} incident={inc} pageSlug={pageSlug} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
