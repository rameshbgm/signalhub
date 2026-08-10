"use client";

import { useState, useTransition } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import { FluentSelect } from "@/components/FluentSelect";
import { reorderPageComponents } from "@/app/admin/(protected)/pages/[pageId]/design/actions";

export type ServiceStructureGroup = {
  id: string;
  name: string;
  collapsed: boolean;
  components: Array<{ id: string; name: string }>;
};

export function ServiceGroupOrganizer({
  pageId,
  initialGroups,
  initialUngrouped,
}: {
  pageId: string;
  initialGroups: ServiceStructureGroup[];
  initialUngrouped: Array<{ id: string; name: string }>;
}) {
  const [groups, setGroups] = useState(initialGroups);
  const [ungrouped, setUngrouped] = useState(initialUngrouped);
  const [saving, startTransition] = useTransition();
  const [status, setStatus] = useState("");

  function moveGroup(index: number, offset: number) {
    const target = index + offset;
    if (target < 0 || target >= groups.length) return;
    setGroups(arrayMove(groups, index, target));
  }

  function moveService(sourceGroupId: string | null, componentId: string, targetGroupId: string | null, offset = 0) {
    const nextGroups = groups.map((group) => ({ ...group, components: [...group.components] }));
    let nextUngrouped = [...ungrouped];
    const source = sourceGroupId ? nextGroups.find((group) => group.id === sourceGroupId)?.components : nextUngrouped;
    if (!source) return;
    const sourceIndex = source.findIndex((component) => component.id === componentId);
    if (sourceIndex < 0) return;
    if (sourceGroupId === targetGroupId) {
      const targetIndex = sourceIndex + offset;
      if (targetIndex < 0 || targetIndex >= source.length) return;
      const moved = arrayMove(source, sourceIndex, targetIndex);
      if (sourceGroupId) nextGroups.find((group) => group.id === sourceGroupId)!.components = moved;
      else nextUngrouped = moved;
    } else {
      const [component] = source.splice(sourceIndex, 1);
      const target = targetGroupId ? nextGroups.find((group) => group.id === targetGroupId)?.components : nextUngrouped;
      if (!target) return;
      target.push(component);
    }
    setGroups(nextGroups);
    setUngrouped(nextUngrouped);
  }

  function save() {
    startTransition(async () => {
      setStatus("");
      try {
        const result = await reorderPageComponents(pageId, {
          groups: groups.map((group) => ({ id: group.id, collapsed: group.collapsed })),
          components: [
            ...groups.flatMap((group) => group.components.map((component) => ({ id: component.id, groupId: group.id }))),
            ...ungrouped.map((component) => ({ id: component.id, groupId: null })),
          ],
        });
        if (!result.ok) throw new Error(result.error);
        setStatus("Service groups and order saved");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Could not save service structure");
      }
    });
  }

  return (
    <section className="border border-[var(--line)] bg-[var(--surface)] p-5">
      <h2 className="font-mono font-semibold">Directory organization</h2>
      <p className="mt-1 text-sm text-[var(--fg-dim)]">Order groups, choose their default collapsed state, and move services within or between groups.</p>
      <div className="mt-4 space-y-2">
        {groups.map((group, index) => (
          <div key={group.id} className="border border-[var(--line)] p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="min-w-0 flex-1 truncate">{group.name} · {group.components.length}</strong>
              <label className="flex items-center gap-1 text-xs text-[var(--fg-dim)]"><input type="checkbox" checked={group.collapsed} onChange={(event) => setGroups(groups.map((candidate) => candidate.id === group.id ? { ...candidate, collapsed: event.target.checked } : candidate))} />Collapsed by default</label>
              <button type="button" onClick={() => moveGroup(index, -1)} aria-label={`Move ${group.name} up`} className="border border-[var(--line)] px-2 py-1">↑</button>
              <button type="button" onClick={() => moveGroup(index, 1)} aria-label={`Move ${group.name} down`} className="border border-[var(--line)] px-2 py-1">↓</button>
            </div>
            <ServiceRows services={group.components} groupId={group.id} groups={groups} onMove={moveService} />
          </div>
        ))}
        <div className="border border-[var(--line)] p-3 text-sm">
          <strong>Ungrouped · {ungrouped.length}</strong>
          <ServiceRows services={ungrouped} groupId={null} groups={groups} onMove={moveService} />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button type="button" disabled={saving} onClick={save} className="bg-[var(--cyan)] px-4 py-2 text-sm font-semibold text-[var(--on-cyan)] disabled:opacity-50">{saving ? "Saving…" : "Save organization"}</button>
        <p role="status" className="text-xs text-[var(--fg-dim)]">{status}</p>
      </div>
    </section>
  );
}
function ServiceRows({
  services,
  groupId,
  groups,
  onMove,
}: {
  services: Array<{ id: string; name: string }>;
  groupId: string | null;
  groups: ServiceStructureGroup[];
  onMove: (sourceGroupId: string | null, componentId: string, targetGroupId: string | null, offset?: number) => void;
}) {
  return (
    <div className="mt-2 space-y-1">
      {services.map((service) => (
        <div key={service.id} className="flex items-center gap-1 bg-[var(--bg)] px-2 py-1.5 text-xs">
          <span className="min-w-0 flex-1 truncate">{service.name}</span>
          <button type="button" onClick={() => onMove(groupId, service.id, groupId, -1)} aria-label={`Move ${service.name} up`}>↑</button>
          <button type="button" onClick={() => onMove(groupId, service.id, groupId, 1)} aria-label={`Move ${service.name} down`}>↓</button>
          <FluentSelect aria-label={`Move ${service.name} to group`} value={groupId ?? ""} onChange={(event) => onMove(groupId, service.id, event.target.value || null)} className="max-w-32 bg-transparent text-xs">
            <option value="">Ungrouped</option>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </FluentSelect>
        </div>
      ))}
      {!services.length && <p className="py-2 text-xs text-[var(--fg-dim)]">No services in this group.</p>}
    </div>
  );
}
