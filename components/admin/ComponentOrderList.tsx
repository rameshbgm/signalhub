"use client";

import { Children, useMemo, useState, useTransition, type ReactNode } from "react";
import { Button } from "@fluentui/react-components";
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
  const [message, setMessage] = useState("");
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
    setMessage("");
    startTransition(async () => {
      try {
        await reorderComponentOrder(pageId, next);
        setMessage("Component order saved");
      } catch (error) {
        setOrderedIds(previous);
        setMessage(error instanceof Error ? error.message : "Could not save component order");
      }
    });
  }

  return (
    <div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-2" aria-busy={pending}>
            {orderedIds.map((id) => (
              <SortableComponent key={id} id={id} name={nameById.get(id) ?? "component"}>
                {contentById.get(id)}
              </SortableComponent>
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <p role="status" aria-live="polite" className="mt-2 min-h-4 text-xs text-[var(--fg-dim)]">{message}</p>
    </div>
  );
}

function SortableComponent({ id, name, children }: { id: string; name: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative ${isDragging ? "z-10 opacity-70 shadow-xl" : ""}`}
    >
      <Button
        appearance="subtle"
        shape="square"
        size="small"
        className="!absolute !left-3 !top-3 !z-10 cursor-grab active:cursor-grabbing"
        aria-label={`Drag to reorder ${name}`}
        {...attributes}
        {...listeners}
      >
        ⠿
      </Button>
      {children}
    </div>
  );
}
