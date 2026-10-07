"use client";

import { Children, useMemo, useState, useTransition, type ReactNode } from "react";
import { toast } from "@/components/ui/toast";
import { GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { reorderComponentOrder } from "@/app/admin/(protected)/pages/[pageId]/components-actions";

type OrderedComponent = { id: string; name: string };

export function ComponentOrderList({
  pageId,
  components,
  children,
}: {
  pageId: string;
  components: OrderedComponent[];
  children: ReactNode;
}) {
  const childArray = Children.toArray(children);
  const contentById = useMemo(
    () => new Map(components.map((component, index) => [component.id, childArray[index]])),
    [childArray, components]
  );
  const nameById = useMemo(() => new Map(components.map((component) => [component.id, component.name])), [components]);
  const [orderedIds, setOrderedIds] = useState(components.map((component) => component.id));
  const [pending, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const previous = orderedIds;
    const oldIndex = previous.indexOf(String(active.id));
    const newIndex = previous.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(previous, oldIndex, newIndex);
    setOrderedIds(next);
    startTransition(async () => {
      try {
        await reorderComponentOrder(pageId, next);
        toast("Component order saved", "ok");
      } catch (error) {
        setOrderedIds(previous);
        toast(error instanceof Error ? error.message : "Could not save component order", "danger");
      }
    });
  }

  return (
    <div>
      <DndContext id={`component-order-${pageId}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
          <div className="divide-y divide-line" aria-busy={pending}>
            {orderedIds.map((id) => (
              <SortableComponent key={id} id={id} name={nameById.get(id) ?? "component"}>
                {contentById.get(id)}
              </SortableComponent>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableComponent({ id, name, children }: { id: string; name: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative grid grid-cols-[auto_minmax(0,1fr)] items-start gap-1 bg-surface py-3 ${isDragging ? "z-10 rounded-control opacity-80 shadow-raised" : ""}`}
    >
      {/* A real column, so the handle never overlaps the row content. */}
      <Button
        variant="ghost"
        size="icon"
        className="mt-0.5 cursor-grab text-ink-dim active:cursor-grabbing max-sm:size-11"
        aria-label={`Drag to reorder ${name}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical aria-hidden size={16} />
      </Button>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
