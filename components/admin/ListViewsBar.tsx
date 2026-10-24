"use client";

import { useEffect, useRef, useState } from "react";
import { Bookmark, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_SAVED_VIEWS, SAVED_VIEW_NAME_MAX } from "@/lib/list-views";
import { cn } from "@/lib/utils";

export type ViewTab = { id: string; label: string; count: number; saved: boolean };

/** Tab row of built-in and saved views with live counts, plus an inline form to save the current controls as a view. */
export function ListViewsBar({ tabs, active, savedCount, onSelect, onSave, onDelete }: {
  tabs: ViewTab[];
  active: string;
  savedCount: number;
  onSelect: (id: string) => void;
  onSave: (name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (naming) inputRef.current?.focus(); }, [naming]);
  const full = savedCount >= MAX_SAVED_VIEWS;

  const finish = (save: boolean) => {
    if (save && name.trim()) onSave(name.trim());
    setNaming(false);
    setName("");
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-line pb-3" role="group" aria-label="Views">
      {tabs.map((tab) => {
        const on = tab.id === active;
        return (
          <span key={tab.id} className={cn("inline-flex h-8 items-center rounded-chip border text-xs font-medium transition-colors", on ? "border-primary bg-primary-soft text-primary-ink" : "border-line bg-surface text-ink-soft hover:bg-sunken")}>
            <button type="button" aria-pressed={on} onClick={() => onSelect(tab.id)} data-button-guard="off" className={cn("inline-flex h-full items-center gap-1.5 rounded-chip px-3 outline-none focus-visible:ring-4 focus-visible:ring-primary/25", tab.saved && "pr-1.5")}>
              {tab.saved && <Bookmark aria-hidden size={12} />}
              {tab.label}
              <span className="tabular-nums text-ink-dim">{tab.count}</span>
            </button>
            {tab.saved && (
              <button type="button" data-button-guard="off" aria-label={`Delete view ${tab.label}`} title="Delete view" onClick={() => onDelete(tab.id)} className="mr-1 grid size-5 place-items-center rounded-chip text-ink-dim outline-none hover:bg-danger-bg hover:text-danger-fg focus-visible:ring-4 focus-visible:ring-primary/25">
                <X aria-hidden size={12} />
              </button>
            )}
          </span>
        );
      })}

      {naming ? (
        <form onSubmit={(event) => { event.preventDefault(); finish(true); }} className="flex items-center gap-1.5">
          <Input
            ref={inputRef}
            aria-label="Name for this view"
            placeholder="View name"
            maxLength={SAVED_VIEW_NAME_MAX}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); finish(false); } }}
            className="h-8 w-44 text-xs"
          />
          <Button type="submit" size="sm" disabled={!name.trim()}>Save</Button>
          <Button type="button" size="sm" variant="ghost" data-button-guard="off" onClick={() => finish(false)}>Cancel</Button>
        </form>
      ) : (
        <button
          type="button"
          data-button-guard="off"
          disabled={full}
          title={full ? `You can keep ${MAX_SAVED_VIEWS} saved views. Delete one first.` : "Save the current search, tags, grouping and sort as a view in this browser"}
          onClick={() => setNaming(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-chip border border-dashed border-line-strong px-3 text-xs font-medium text-ink-dim outline-none transition-colors hover:border-primary hover:text-primary-ink focus-visible:ring-4 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Bookmark aria-hidden size={12} />
          Save current filters
        </button>
      )}
    </div>
  );
}
