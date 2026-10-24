import { tableHref, tableParams, type SortDir, type TableQuery } from "@/lib/table-query";
import type { SortLink } from "@/components/platform/table/SortHead";

type Defaults = { sort: string; dir: SortDir };

/** Links for sortable headers: the same view sorted by that column (toggling when it is current), back on page 1. */
export function sortLinks<K extends string>(base: string, keys: readonly K[], query: TableQuery, defaults: Defaults, fixed: Record<string, string> = {}, newestFirst: readonly string[] = []) {
  return Object.fromEntries(keys.map((key) => {
    const active = query.sort === key;
    const dir: SortDir = active ? (query.dir === "asc" ? "desc" : "asc") : newestFirst.includes(key) ? "desc" : "asc";
    const href = tableHref(base, tableParams({ ...query, sort: key, dir, page: 1 }, defaults, fixed));
    return [key, { href, active, dir: active ? query.dir : dir } satisfies SortLink];
  })) as Record<K, SortLink>;
}

/** Link builder for the pagination bar: the current view with another page or page size. */
export function pageLinks(base: string, query: TableQuery, defaults: Defaults, fixed: Record<string, string> = {}) {
  return (patch: { page?: number; size?: number }) => tableHref(base, tableParams({ ...query, ...patch }, defaults, fixed));
}
