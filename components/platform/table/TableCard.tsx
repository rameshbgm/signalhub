import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { FilterBar, type FilterSpec } from "@/components/platform/table/FilterBar";
import { Pagination } from "@/components/platform/table/Pagination";

/** The frame every Platform administration table shares: search and filters on top, the table, then the pagination bar. */
export function TableCard({ search, filters, actions, children, total, page, size, href, noun }: {
  search: { q: string; placeholder: string };
  filters: FilterSpec[];
  /** Buttons on the right of the toolbar, such as Export. */
  actions?: ReactNode;
  children: ReactNode;
  total: number;
  page: number;
  size: number;
  href: (patch: { page?: number; size?: number }) => string;
  noun: string;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <FilterBar q={search.q} placeholder={search.placeholder} filters={filters} />
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
      <Pagination total={total} page={page} size={size} href={href} noun={total === 1 ? noun : `${noun}s`} />
    </Card>
  );
}
