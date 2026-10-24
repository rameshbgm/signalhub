"use client";

import { Children, useMemo, useState, useTransition, type ReactNode } from "react";
import { GripVertical, Search } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { COMPONENT_STATUSES, COMPONENT_STATUS_LABEL, type ComponentStatus } from "@/lib/status";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { bulkComponentAction, reorderComponentOrder } from "@/app/admin/(protected)/pages/[pageId]/components-actions";

type OrderedComponent = { id: string; name: string; description: string; groupId: string | null; status: ComponentStatus; visible: boolean };
type Group = { id: string; name: string };
const PAGE_SIZES = [10, 25, 50];

export function ComponentOrderList({ pageId, components, groups, children }: { pageId: string; components: OrderedComponent[]; groups: Group[]; children: ReactNode }) {
  const childArray = Children.toArray(children);
  const contentById = useMemo(() => new Map(components.map((component, index) => [component.id, childArray[index]])), [childArray, components]);
  const byId = useMemo(() => new Map(components.map((component) => [component.id, component])), [components]);
  const groupNames = useMemo(() => new Map(groups.map((group) => [group.id, group.name])), [groups]);
  const [orderedIds, setOrderedIds] = useState(components.map((component) => component.id));
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [visibilityFilter, setVisibilityFilter] = useState("all");
  const [sort, setSort] = useState("order");
  const [grouped, setGrouped] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState("status");
  const [bulkStatus, setBulkStatus] = useState<ComponentStatus>("OPERATIONAL");
  const [pending, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    const result = orderedIds.map((id) => byId.get(id)).filter((item): item is OrderedComponent => Boolean(item))
      .filter((item) => !search || `${item.name} ${item.description} ${groupNames.get(item.groupId ?? "") ?? "Ungrouped"}`.toLocaleLowerCase().includes(search))
      .filter((item) => statusFilter === "all" || item.status === statusFilter)
      .filter((item) => groupFilter === "all" || (groupFilter === "ungrouped" ? !item.groupId : item.groupId === groupFilter))
      .filter((item) => visibilityFilter === "all" || item.visible === (visibilityFilter === "published"));
    if (sort === "name" || sort === "name-desc") result.sort((a, b) => a.name.localeCompare(b.name) * (sort === "name-desc" ? -1 : 1));
    if (sort === "status") result.sort((a, b) => COMPONENT_STATUSES.indexOf(a.status) - COMPONENT_STATUSES.indexOf(b.status));
    if (grouped) result.sort((a, b) => {
      const aIndex = groups.findIndex((group) => group.id === a.groupId);
      const bIndex = groups.findIndex((group) => group.id === b.groupId);
      return (aIndex < 0 ? groups.length : aIndex) - (bIndex < 0 ? groups.length : bIndex);
    });
    return result;
  }, [orderedIds, byId, groupNames, query, statusFilter, groupFilter, visibilityFilter, sort, grouped, groups]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const visibleIds = visible.map((item) => item.id);
  const allVisibleSelected = visible.length > 0 && visible.every((item) => selected.includes(item.id));
  const canReorder = !grouped && sort === "order" && !pending;

  function handleDragEnd(event: DragEndEvent) {
    if (!canReorder || !event.over || event.active.id === event.over.id) return;
    const oldIndex = visibleIds.indexOf(String(event.active.id));
    const newIndex = visibleIds.indexOf(String(event.over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const previous = orderedIds;
    // Keep rows outside this filtered page in their original positions.
    const moved = arrayMove(visibleIds, oldIndex, newIndex);
    const visibleSet = new Set(visibleIds);
    let cursor = 0;
    const next = previous.map((id) => visibleSet.has(id) ? moved[cursor++] : id);
    setOrderedIds(next);
    startTransition(async () => {
      try { await reorderComponentOrder(pageId, next); toast("Service order saved", "ok"); }
      catch (error) { setOrderedIds(previous); toast(error instanceof Error ? error.message : "Could not save service order", "danger"); }
    });
  }

  function applyBulk() {
    if (!selected.length) return;
    const ids = selected;
    startTransition(async () => {
      try {
        await bulkComponentAction(pageId, ids, bulkAction, bulkAction === "status" ? bulkStatus : undefined);
        setSelected([]);
        toast(`${ids.length} ${ids.length === 1 ? "service" : "services"} updated`, "ok");
      } catch (error) { toast(error instanceof Error ? error.message : "Could not update selected services", "danger"); }
    });
  }

  const resetPage = () => setPage(1);
  return <div className="space-y-3">
    <div className="grid gap-2 border-b border-line pb-4 sm:grid-cols-2 xl:grid-cols-[minmax(12rem,1fr)_repeat(3,minmax(8rem,auto))]">
      <label className="relative block"><span className="sr-only">Search services</span><Search aria-hidden size={16} className="pointer-events-none absolute left-3 top-2.5 text-ink-dim" /><Input value={query} onChange={(event) => { setQuery(event.target.value); resetPage(); }} placeholder="Search services" className="w-full pl-9" /></label>
      <Select aria-label="Filter by status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); resetPage(); }}><option value="all">All statuses</option>{COMPONENT_STATUSES.map((status) => <option key={status} value={status}>{COMPONENT_STATUS_LABEL[status]}</option>)}</Select>
      <Select aria-label="Filter by group" value={groupFilter} onChange={(event) => { setGroupFilter(event.target.value); resetPage(); }}><option value="all">All groups</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}<option value="ungrouped">Ungrouped</option></Select>
      <Select aria-label="Filter by visibility" value={visibilityFilter} onChange={(event) => { setVisibilityFilter(event.target.value); resetPage(); }}><option value="all">All visibility</option><option value="published">Published</option><option value="unpublished">Unpublished</option></Select>
    </div>
    <div className="flex flex-wrap items-center gap-3 border-b border-line pb-3">
      <label className="flex items-center gap-2 text-xs text-ink-dim">Sort <Select aria-label="Sort services" value={sort} onChange={(event) => { setSort(event.target.value); resetPage(); }}><option value="order">Page order</option><option value="name">Name A–Z</option><option value="name-desc">Name Z–A</option><option value="status">Status</option></Select></label>
      <label className="flex items-center gap-2 text-xs text-ink-dim"><input type="checkbox" checked={grouped} onChange={(event) => { setGrouped(event.target.checked); resetPage(); }} /> Group by group</label>
      <span className="ml-auto text-xs text-ink-dim">{filtered.length} of {components.length} services</span>
    </div>
    {selected.length > 0 && <div className="flex flex-wrap items-center gap-2 rounded-control bg-sunken p-2">
      <span className="text-xs font-medium text-ink">{selected.length} selected</span>
      <Select aria-label="Bulk action" value={bulkAction} onChange={(event) => setBulkAction(event.target.value)}><option value="status">Set status</option><option value="publish">Publish</option><option value="unpublish">Unpublish</option></Select>
      {bulkAction === "status" && <Select aria-label="Bulk status" value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value as ComponentStatus)}>{COMPONENT_STATUSES.map((status) => <option key={status} value={status}>{COMPONENT_STATUS_LABEL[status]}</option>)}</Select>}
      <Button type="button" size="sm" disabled={pending} onClick={applyBulk}>{pending ? "Applying…" : "Apply to selected"}</Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setSelected([])}>Clear</Button>
    </div>}
    <label className="flex items-center gap-2 px-1 text-xs text-ink-dim"><input type="checkbox" checked={allVisibleSelected} disabled={!visible.length} onChange={(event) => setSelected((current) => event.target.checked ? Array.from(new Set([...current, ...visibleIds])) : current.filter((id) => !visibleIds.includes(id)))} /> Select this page</label>
    {visible.length ? <DndContext id={`component-order-${pageId}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={visibleIds} strategy={verticalListSortingStrategy}>
        <div className="divide-y divide-line" aria-busy={pending}>
          {visible.map((item, index) => <div key={item.id}>
            {grouped && (index === 0 || visible[index - 1].groupId !== item.groupId) && <h3 className="bg-sunken px-3 py-2 text-xs font-semibold text-ink">{groupNames.get(item.groupId ?? "") ?? "Ungrouped"}</h3>}
            <SortableComponent id={item.id} name={item.name} draggable={canReorder} checked={selected.includes(item.id)} onSelect={(checked) => setSelected((current) => checked ? [...current, item.id] : current.filter((id) => id !== item.id))}>{contentById.get(item.id)}</SortableComponent>
          </div>)}
        </div>
      </SortableContext>
    </DndContext> : <p className="py-8 text-center text-sm text-ink-dim">No services match these filters.</p>}
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-xs text-ink-dim">
      <span>{filtered.length ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filtered.length)} of ${filtered.length}` : "0 services"}</span>
      <div className="flex items-center gap-2"><label htmlFor="service-page-size">Per page</label><select id="service-page-size" className="rounded-control border border-line bg-surface px-2 py-1 text-ink" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); resetPage(); }}>{Array.from(new Set([...PAGE_SIZES, components.length])).filter(Boolean).sort((a, b) => a - b).map((size) => <option key={size} value={size}>{size === components.length ? `All (${size})` : size}</option>)}</select><Button type="button" variant="ghost" size="sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</Button><span>Page {currentPage} of {pageCount}</span><Button type="button" variant="ghost" size="sm" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</Button></div>
    </div>
    <p role="status" aria-live="polite" className="text-xs text-ink-dim">{pending ? "Saving changes…" : canReorder ? "Drag a handle to reorder services. Changes save automatically when dropped." : "Choose Page order and turn off grouping to reorder services."}</p>
  </div>;
}

function SortableComponent({ id, name, draggable, checked, onSelect, children }: { id: string; name: string; draggable: boolean; checked: boolean; onSelect: (checked: boolean) => void; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !draggable });
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`relative grid grid-cols-[auto_auto_minmax(0,1fr)] items-start gap-1 bg-surface py-3 ${isDragging ? "z-10 rounded-control opacity-80 shadow-raised" : ""}`}>
    <input type="checkbox" className="mt-2.5" aria-label={`Select ${name}`} checked={checked} onChange={(event) => onSelect(event.target.checked)} />
    <Button ref={setActivatorNodeRef} type="button" variant="ghost" size="icon" disabled={!draggable} className="mt-0.5 touch-none cursor-grab text-ink-dim active:cursor-grabbing max-sm:size-11" aria-label={`Drag to reorder ${name}`} {...attributes} {...listeners}><GripVertical aria-hidden size={16} /></Button>
    <div className="min-w-0">{children}</div>
  </div>;
}
