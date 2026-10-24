"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Search } from "lucide-react";
import { IconTile, type Hue } from "@/components/ui/icon-tile";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type PaletteEntry = { href: string; label: string; group: string; icon: LucideIcon; hue: Hue };

/** Jump-to navigation only: it opens existing routes and never runs an action. */
export function CommandPalette({ open, onClose, entries }: { open: boolean; onClose: () => void; entries: PaletteEntry[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((entry) => `${entry.label} ${entry.group}`.toLowerCase().includes(needle));
  }, [entries, query]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active, results]);

  if (!open) return null;

  function close() {
    setQuery("");
    setActive(0);
    onClose();
  }

  function go(entry: PaletteEntry | undefined) {
    if (!entry) return;
    close();
    router.push(entry.href);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (results.length) setActive((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(results[active]);
    }
  }

  return (
    <div className="fixed inset-0 z-[3000] flex animate-fade items-start justify-center bg-ink/40 px-4 pt-[12vh] backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div role="dialog" aria-modal="true" aria-label="Jump to" onKeyDown={onKeyDown} className="w-full max-w-xl animate-drop overflow-hidden rounded-sheet border border-line bg-surface shadow-float">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search aria-hidden size={18} className="shrink-0 text-ink-dim" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => { setQuery(event.target.value); setActive(0); }}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            aria-activedescendant={results[active] ? `palette-${active}` : undefined}
            placeholder="Jump to a screen or page…"
            className="h-14 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-dim"
          />
          <kbd className="rounded-chip border border-line bg-sunken px-1.5 py-0.5 text-2xs font-medium text-ink-soft">Esc</kbd>
        </div>
        <ul ref={listRef} id="palette-results" role="listbox" className="max-h-[min(24rem,60vh)] overflow-y-auto p-2">
          {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-ink-soft">Nothing matches “{query.trim()}”.</li>}
          {results.map((entry, index) => (
            <li key={`${entry.group}-${entry.href}`} id={`palette-${index}`} role="option" aria-selected={index === active} data-active={index === active}>
              <button
                type="button"
                tabIndex={-1}
                onMouseEnter={() => setActive(index)}
                onClick={() => go(entry)}
                className={cn("flex w-full items-center gap-3 rounded-control px-3 py-2 text-left text-sm transition-colors duration-100", index === active ? "bg-primary-soft text-primary-ink" : "text-ink")}
              >
                <IconTile icon={entry.icon} hue={entry.hue} size="sm" />
                <span className="min-w-0 flex-1 truncate font-medium">{entry.label}</span>
                <span className="text-xs text-ink-dim">{entry.group}</span>
                {index === active && <CornerDownLeft aria-hidden size={14} className="text-primary" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
