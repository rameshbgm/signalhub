"use client";

import { useEffect, useRef, useState } from "react";
import { PanelsTopLeft } from "lucide-react";
import { PageSelect } from "@/components/admin/PageSelect";
import { fieldClass } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Which page a new event posts to. The page usually comes from where the user started, so the picker stays
 * folded behind "Change" and folds back once a page is picked. `field` renders it as a labelled form
 * control instead of a tile, so it can sit in a row of fields.
 */
export function PostingTo({ pages, selected, basePath, field = false }: { pages: { id: string; name: string }[]; selected: string; basePath: string; field?: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // Fold back on a click elsewhere (the Select's menu is portaled out, so it counts as inside) or on Escape.
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      const target = event.target as Element;
      if (!rootRef.current?.contains(target) && !target.closest("[role=listbox]")) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  // The new page shows at once; the server's value takes over when the navigation lands.
  const [picked, setPicked] = useState<{ id: string; from: string } | null>(null);
  const shown = picked && picked.from === selected ? picked.id : selected;
  const name = pages.find((p) => p.id === shown)?.name;
  const change = (
    <button type="button" onClick={() => setOpen(true)} className="shrink-0 rounded-chip font-semibold text-primary-ink outline-none focus-visible:ring-4 focus-visible:ring-primary/25">Change</button>
  );
  const select = (
    <PageSelect
      pages={pages}
      basePath={basePath}
      selected={shown}
      onPick={(id) => { setPicked({ id, from: selected }); setOpen(false); }}
    />
  );
  const keys = (event: React.KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };

  if (field) {
    return (
      <div ref={rootRef} onKeyDown={keys} className="space-y-1.5">
        <Label>Posting to</Label>
        {open ? select : (
          <div className={cn(fieldClass, "h-9 items-center justify-between gap-3 py-1.5")}>
            <span className="min-w-0 truncate font-medium">{name}</span>
            {pages.length > 1 && change}
          </div>
        )}
      </div>
    );
  }
  return (
    <div ref={rootRef} onKeyDown={keys} className="flex flex-wrap items-center justify-start gap-x-4 gap-y-2 rounded-card border border-line bg-surface px-4 py-3 text-sm">
      <span className="flex min-w-0 max-w-full items-center gap-2">
        <PanelsTopLeft aria-hidden size={16} className="shrink-0 text-ink-dim" />
        <span className="truncate text-ink-soft">Posting to <span className="font-semibold text-ink">{name}</span></span>
      </span>
      {pages.length > 1 && (open ? <div className="w-full min-w-44 flex-1 sm:w-56 sm:flex-none">{select}</div> : change)}
    </div>
  );
}
