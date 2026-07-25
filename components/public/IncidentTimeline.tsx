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
import { formatPageDate, pageDateKey } from "@/lib/page-locale";

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

function fmt(d: Date, locale: string, timeZone: string) {
  return formatPageDate(d, {
    language: locale,
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function IncidentCard({
  incident,
  pageSlug,
  linkPermalink = true,
  locale = "en",
  timeZone = "UTC",
}: {
  incident: IncidentRow;
  pageSlug: string;
  linkPermalink?: boolean;
  locale?: string;
  timeZone?: string;
}) {
  const incidentBasePath = incident.linkSlug ? `/${incident.linkSlug}` : pageSlug ? `/${pageSlug}` : "";
  const impact = incident.impact as Impact;
  const color = incident.isMaintenance ? "var(--blue)" : IMPACT_COLOR[impact];
  const label = incident.isMaintenance
    ? MAINTENANCE_STATUS_LABEL[(incident.maintenanceStatus as MaintenanceStatus) ?? "SCHEDULED"]
    : INCIDENT_STATUS_LABEL[incident.status as IncidentStatus];

  return (
    <div className="border border-[var(--line)] border-l-2 bg-[var(--surface)] p-5" style={{ borderLeftColor: color }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <h3 className="font-mono font-semibold text-sm text-[var(--fg)]">
          {linkPermalink ? (
            <Link href={`${incidentBasePath}/incidents/${incident.id}`} className="hover:underline underline-offset-2">
              {incident.name}
            </Link>
          ) : (
            incident.name
          )}
        </h3>
        {!incident.isMaintenance && (
          <span
            className="text-xs font-mono font-medium px-2.5 py-1 shrink-0 border"
            style={{ color, borderColor: color, backgroundColor: "color-mix(in srgb, " + color + " 12%, transparent)" }}
          >
            {IMPACT_LABEL[impact]}
          </span>
        )}
      </div>
      {incident.components.length > 0 && (
        <p className="text-xs text-[var(--fg-dim)] mt-1.5">Affects: {incident.components.map((c) => c.component.name).join(", ")}</p>
      )}
      {incident.isMaintenance && incident.scheduledStart && (
        <p className="text-xs font-mono text-[var(--fg-soft)] mt-1.5">
          Window: {fmt(incident.scheduledStart, locale, timeZone)} — {incident.scheduledEnd ? fmt(incident.scheduledEnd, locale, timeZone) : "TBD"}
        </p>
      )}
      <div className="mt-4 space-y-4 border-l-2 border-[var(--line)] pl-4">
        {incident.updates.map((u) => (
          <div key={u.id} className="text-sm">
            <span className="font-medium text-[var(--fg)]">{incident.isMaintenance ? label : INCIDENT_STATUS_LABEL[u.status as IncidentStatus]}</span>
            <span className="text-[var(--fg-dim)] font-mono text-xs ml-2">{fmt(u.createdAt, locale, timeZone)}</span>
            <p className="text-[var(--fg-soft)] mt-1 whitespace-pre-wrap leading-relaxed">{u.body}</p>
          </div>
        ))}
      </div>
      {incident.postmortemPublishedAt && incident.postmortemBody && (
        <Link
          href={`${incidentBasePath}/incidents/${incident.id}`}
          className="inline-block mt-4 text-xs text-[var(--cyan)] underline underline-offset-2 hover:opacity-80"
        >
          Read postmortem
        </Link>
      )}
    </div>
  );
}

export function PastIncidentsByDay({
  incidents,
  pageSlug,
  days = 14,
  locale = "en",
  timeZone = "UTC",
}: {
  incidents: IncidentRow[];
  pageSlug: string;
  days?: number;
  locale?: string;
  timeZone?: string;
}) {
  const buckets: { date: string; label: string; incidents: IncidentRow[] }[] = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = pageDateKey(d, timeZone);
    buckets.push({
      date: key,
      label: formatPageDate(d, {
        language: locale,
        timeZone,
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
      incidents: incidents.filter((inc) => pageDateKey(inc.createdAt, timeZone) === key),
    });
  }

  return (
    <div className="space-y-6">
      {buckets.map((b) => (
        <div key={b.date}>
          <h4 className="text-sm font-mono font-semibold text-[var(--fg-soft)] mb-2.5">{b.label}</h4>
          {b.incidents.length === 0 ? (
            <p className="text-sm text-[var(--fg-dim)]">No incidents reported.</p>
          ) : (
            <div className="space-y-3">
              {b.incidents.map((inc) => (
                <IncidentCard
                  key={inc.id}
                  incident={inc}
                  pageSlug={pageSlug}
                  locale={locale}
                  timeZone={timeZone}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
