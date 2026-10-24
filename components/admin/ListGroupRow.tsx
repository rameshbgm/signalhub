"use client";

import type { ReactNode } from "react";
import { ChevronDown, Folder } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { IconTile } from "@/components/ui/icon-tile";
import { cn } from "@/lib/utils";

/** Classes for the first data cell of a child row, drawing the tree line from its group row down to a small elbow. `last` ends the line at the elbow. */
export function treeCell(last: boolean) {
  return cn(
    "relative pl-11 before:absolute before:left-5 before:top-0 before:border-l before:border-line-strong after:absolute after:left-5 after:top-1/2 after:w-3 after:border-t after:border-line-strong",
    last ? "before:h-1/2" : "before:bottom-0",
  );
}

/** Continues the tree line through an expanded panel that sits between two child rows. */
export function treeContinuation(last: boolean) {
  return last ? "" : "relative before:absolute before:bottom-0 before:left-5 before:top-0 before:border-l before:border-line-strong";
}

/** Column heading that sorts the list when clicked; the active column shows an arrow. */
export function SortHeader({ label, active, onClick, align = "left", className }: { label: string; active: boolean; onClick: () => void; align?: "left" | "right"; className?: string }) {
  return (
    <th scope="col" aria-sort={active ? "ascending" : undefined} className={cn("h-10 px-3 align-middle text-xs font-semibold text-ink-soft", align === "right" ? "text-right" : "text-left", className)}>
      <button type="button" data-button-guard="off" onClick={onClick} className="inline-flex items-center gap-1 rounded-chip outline-none hover:text-ink focus-visible:ring-4 focus-visible:ring-primary/25">
        {label}
        {active && <span aria-hidden>↓</span>}
      </button>
    </th>
  );
}

/**
 * Group row of a hierarchy table: a fixed-colour band with the group name and its roll-up cells (passed as children,
 * which must complete the row). Clicking anywhere on it opens or closes the group.
 */
export function ListGroupRow({ name, meta, open, continued, selectable, picked, total, selectLabel, nameSpan = 2, onToggle, onSelect, children }: {
  name: string;
  /** Small counts line under the name. */
  meta: ReactNode;
  open: boolean;
  /** The page began inside this group, so the row is a reminder rather than the group's start. */
  continued: boolean;
  selectable: boolean;
  picked: number;
  total: number;
  selectLabel: string;
  nameSpan?: number;
  onToggle: () => void;
  onSelect: (on: boolean) => void;
  children: ReactNode;
}) {
  return (
    <tr onClick={onToggle} className="cursor-pointer border-b border-line-strong bg-sunken">
      <td className="w-10 py-2 pl-4 pr-0">
        {selectable && (
          <Checkbox
            onClick={(event) => event.stopPropagation()}
            checked={total > 0 && picked === total}
            ref={(input) => { if (input) input.indeterminate = picked > 0 && picked < total; }}
            onChange={() => onSelect(picked !== total)}
            aria-label={selectLabel}
          />
        )}
      </td>
      <td colSpan={nameSpan} className="py-2 pl-3 pr-3">
        <div className="flex items-center gap-2">
          <button type="button" aria-expanded={open} aria-label={`${open ? "Collapse" : "Expand"} ${name}`} data-button-guard="off" className="grid size-5 shrink-0 place-items-center rounded-chip text-ink-dim outline-none focus-visible:ring-4 focus-visible:ring-primary/25">
            <ChevronDown aria-hidden size={16} className={cn("transition-transform", !open && "-rotate-90")} />
          </button>
          <IconTile icon={Folder} hue="sky" size="sm" />
          <div className="min-w-0">
            <h2 className="truncate text-[0.8125rem] font-semibold tracking-tight text-ink" title={name}>
              {name}
              {continued && <span className="ml-1.5 text-xs font-normal text-ink-dim">(continued)</span>}
            </h2>
            <p className="flex flex-wrap items-center gap-x-2 text-[0.6875rem] text-ink-dim">{meta}</p>
          </div>
        </div>
      </td>
      {children}
    </tr>
  );
}
