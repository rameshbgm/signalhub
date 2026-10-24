"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { PAGE_SIZES, pageNumbers } from "@/lib/list-views";

/** Page controls under a list: summary, rows-per-page picker and numbered buttons (buttons only when there is more than one page). */
export function ListPager({ page, pages, size, summary, onPage, onSize }: { page: number; pages: number; size: number; summary: string; onPage: (page: number) => void; onSize: (size: number) => void }) {
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-ink-dim">
      <span className="tabular-nums">{summary}</span>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          Per page
          <Select aria-label="Rows per page" value={String(size)} onChange={(event) => onSize(Number(event.target.value))} className="h-8 w-20 text-xs">
            {PAGE_SIZES.map((value) => <option key={value} value={value}>{value}</option>)}
          </Select>
        </label>
        {pages > 1 && (
          <div className="flex items-center gap-1">
            <Button type="button" size="icon" variant="ghost" className="size-8" data-button-guard="off" disabled={page <= 1} aria-label="Previous page" onClick={() => onPage(page - 1)}><ChevronLeft aria-hidden size={16} /></Button>
            {pageNumbers(page, pages).map((value, index) => value === "…"
              ? <span key={`gap-${index}`} aria-hidden className="px-1">…</span>
              : <Button key={value} type="button" size="sm" variant={value === page ? "default" : "ghost"} data-button-guard="off" aria-label={`Page ${value}`} aria-current={value === page ? "page" : undefined} className="min-w-8 px-2 tabular-nums" onClick={() => onPage(value)}>{value}</Button>)}
            <Button type="button" size="icon" variant="ghost" className="size-8" data-button-guard="off" disabled={page >= pages} aria-label="Next page" onClick={() => onPage(page + 1)}><ChevronRight aria-hidden size={16} /></Button>
          </div>
        )}
      </div>
    </nav>
  );
}
