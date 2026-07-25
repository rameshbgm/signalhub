import {
  COMPONENT_STATUS_COLOR,
  COMPONENT_STATUS_LABEL,
  type ComponentStatus,
  computeDailyUptime,
  weightedUptime,
} from "@/lib/status";
import { UptimeBar } from "@/components/public/UptimeBar";

type StatusEvent = { status: string; startedAt: Date; endedAt: Date | null; isMaintenance: boolean };

export type ComponentRow = {
  id: string;
  name: string;
  description: string;
  status: string;
  showUptime: boolean;
  isThirdParty: boolean;
  thirdPartyProvider: string | null;
  statusEvents: StatusEvent[];
  createdAt: Date;
};

export type GroupRow = {
  id: string;
  name: string;
  collapsed?: boolean;
  components: ComponentRow[];
};

function ComponentLine({ c }: { c: ComponentRow }) {
  const status = c.status as ComponentStatus;
  const days = c.showUptime ? computeDailyUptime(c.statusEvents, 90, new Date(), c.createdAt) : [];
  const uptimePct = weightedUptime(days);
  return (
    <div className="py-4 border-b border-[var(--line)] last:border-b-0">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <span className="font-medium text-sm text-[var(--fg)]">{c.name}</span>
          {c.isThirdParty && <span className="ml-2 text-xs text-[var(--fg-dim)]">via {c.thirdPartyProvider}</span>}
          {c.description && <p className="text-xs text-[var(--fg-dim)] mt-0.5">{c.description}</p>}
        </div>
        <span className="text-sm font-medium shrink-0 inline-flex items-center font-mono" style={{ color: COMPONENT_STATUS_COLOR[status] }}>
          <span className="status-dot rounded-full" style={{ backgroundColor: COMPONENT_STATUS_COLOR[status] }} />
          {COMPONENT_STATUS_LABEL[status]}
        </span>
      </div>
      {c.showUptime && <UptimeBar days={days} uptimePct={uptimePct} />}
    </div>
  );
}

export function ComponentList({ groups, ungrouped }: { groups: GroupRow[]; ungrouped: ComponentRow[] }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--line)] divide-y divide-[var(--line)]">
      {groups.map((g) => (
        <details key={g.id} open={!g.collapsed} className="px-5 group">
          <summary className="cursor-pointer py-4 font-mono font-semibold text-sm list-none flex items-center justify-between text-[var(--fg)]">
            {g.name}
            <svg className="w-4 h-4 text-[var(--fg-dim)] group-open:rotate-180 transition-transform" viewBox="0 0 24 24" fill="none">
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <div className="pb-2">
            {g.components.map((c) => (
              <ComponentLine key={c.id} c={c} />
            ))}
          </div>
        </details>
      ))}
      {ungrouped.length > 0 && (
        <div className="px-5">
          {ungrouped.map((c) => (
            <ComponentLine key={c.id} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}
