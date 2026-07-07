import { COMPONENT_STATUS_COLOR, COMPONENT_STATUS_LABEL, type ComponentStatus, computeDailyUptime } from "@/lib/status";
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
};

export type GroupRow = {
  id: string;
  name: string;
  components: ComponentRow[];
};

function ComponentLine({ c }: { c: ComponentRow }) {
  const status = c.status as ComponentStatus;
  const days = c.showUptime ? computeDailyUptime(c.statusEvents, 90) : [];
  const uptimePct = days.length ? days.reduce((sum, d) => sum + d.uptimePct, 0) / days.length : 100;
  return (
    <div className="py-3 border-b last:border-b-0">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-medium text-sm">{c.name}</span>
          {c.isThirdParty && <span className="ml-2 text-xs text-gray-400">via {c.thirdPartyProvider}</span>}
          {c.description && <p className="text-xs text-gray-400">{c.description}</p>}
        </div>
        <span className="text-sm font-medium" style={{ color: COMPONENT_STATUS_COLOR[status] }}>
          <span className="status-dot" style={{ backgroundColor: COMPONENT_STATUS_COLOR[status] }} />
          {COMPONENT_STATUS_LABEL[status]}
        </span>
      </div>
      {c.showUptime && <UptimeBar days={days} uptimePct={uptimePct} />}
    </div>
  );
}

export function ComponentList({ groups, ungrouped }: { groups: GroupRow[]; ungrouped: ComponentRow[] }) {
  return (
    <div className="bg-white border rounded-lg divide-y">
      {groups.map((g) => (
        <details key={g.id} open className="px-4 group">
          <summary className="cursor-pointer py-3 font-semibold text-sm list-none flex items-center justify-between">
            {g.name}
            <span className="text-gray-400 group-open:rotate-180 transition-transform">⌄</span>
          </summary>
          <div className="pb-2">
            {g.components.map((c) => (
              <ComponentLine key={c.id} c={c} />
            ))}
          </div>
        </details>
      ))}
      {ungrouped.length > 0 && (
        <div className="px-4">
          {ungrouped.map((c) => (
            <ComponentLine key={c.id} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}
