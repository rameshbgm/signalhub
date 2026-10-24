"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { PAGE_SIZES } from "@/lib/table-query";
import { cn } from "@/lib/utils";

const button = "inline-flex h-8 min-w-8 items-center justify-center rounded-control border px-2 text-xs font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-primary/30 disabled:opacity-40";

/** The pagination bar for lists held in the browser (small by nature). Same look as the server-driven one. */
export function ClientPager({ total, page, size, noun, onPage, onSize }: { total: number; page: number; size: number; noun: string; onPage: (page: number) => void; onSize: (size: number) => void }) {
  const last = Math.max(1, Math.ceil(total / size));
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-sunken/40 px-4 py-3 text-xs text-ink-soft">
      <p aria-live="polite">
        {total === 0 ? `No ${noun}s` : <>Showing <span className="font-semibold text-ink">{(page - 1) * size + 1}–{Math.min(total, page * size)}</span> of <span className="font-semibold text-ink">{total}</span> {total === 1 ? noun : `${noun}s`}</>}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1" role="group" aria-label="Rows per page">
          <span className="mr-1">Rows</span>
          {PAGE_SIZES.map((option) => (
            <button key={option} type="button" aria-pressed={option === size} onClick={() => onSize(option)}
              className={cn(button, option === size ? "border-primary bg-primary-soft text-primary-ink" : "border-line bg-surface text-ink-soft hover:bg-sunken")}>{option}</button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)} className={cn(button, "border-line bg-surface hover:bg-sunken")}><ChevronLeft aria-hidden size={14} /></button>
          <span className="px-2 tabular-nums">Page {page} of {last}</span>
          <button type="button" aria-label="Next page" disabled={page >= last} onClick={() => onPage(page + 1)} className={cn(button, "border-line bg-surface hover:bg-sunken")}><ChevronRight aria-hidden size={14} /></button>
        </div>
      </div>
    </nav>
  );
}
