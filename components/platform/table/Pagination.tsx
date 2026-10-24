import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PAGE_SIZES, pageCount } from "@/lib/table-query";
import { cn } from "@/lib/utils";

const linkClass = "inline-flex h-8 min-w-8 items-center justify-center rounded-control border px-2 text-xs font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-primary/30";

/** Window of page numbers around the current one, with the first and last page always reachable. */
function windowOf(page: number, last: number) {
  const pages = new Set([1, last, page - 1, page, page + 1]);
  const sorted = [...pages].filter((value) => value >= 1 && value <= last).sort((a, b) => a - b);
  return sorted.flatMap((value, index) => (index > 0 && value - sorted[index - 1] > 1 ? [-index, value] : [value]));
}

export function Pagination({ total, page, size, href, noun }: { total: number; page: number; size: number; href: (patch: { page?: number; size?: number }) => string; noun: string }) {
  const last = pageCount(total, size);
  const from = total === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(total, page * size);
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-sunken/40 px-4 py-3 text-xs text-ink-soft">
      <p aria-live="polite">
        {total === 0 ? `No ${noun}` : <>Showing <span className="font-semibold text-ink">{from}–{to}</span> of <span className="font-semibold text-ink">{total}</span> {noun}</>}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1" aria-label="Rows per page" role="group">
          <span className="mr-1">Rows</span>
          {PAGE_SIZES.map((option) => (
            <Link key={option} href={href({ size: option, page: 1 })} aria-current={option === size ? "true" : undefined} scroll={false}
              className={cn(linkClass, option === size ? "border-primary bg-primary-soft text-primary-ink" : "border-line bg-surface text-ink-soft hover:bg-sunken")}>
              {option}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {page > 1
            ? <Link href={href({ page: page - 1 })} aria-label="Previous page" scroll={false} className={cn(linkClass, "border-line bg-surface hover:bg-sunken")}><ChevronLeft aria-hidden size={14} /></Link>
            : <span aria-hidden className={cn(linkClass, "border-line/60 text-ink-dim/50")}><ChevronLeft size={14} /></span>}
          {windowOf(page, last).map((value) => value < 0
            ? <span key={value} aria-hidden className="px-1 text-ink-dim">…</span>
            : <Link key={value} href={href({ page: value })} scroll={false} aria-current={value === page ? "page" : undefined}
                className={cn(linkClass, value === page ? "border-primary bg-primary text-on-primary" : "border-line bg-surface text-ink-soft hover:bg-sunken")}>{value}</Link>)}
          {page < last
            ? <Link href={href({ page: page + 1 })} aria-label="Next page" scroll={false} className={cn(linkClass, "border-line bg-surface hover:bg-sunken")}><ChevronRight aria-hidden size={14} /></Link>
            : <span aria-hidden className={cn(linkClass, "border-line/60 text-ink-dim/50")}><ChevronRight size={14} /></span>}
        </div>
      </div>
    </nav>
  );
}
