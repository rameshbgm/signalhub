/**
 * Search, sort, filter and pagination for admin tables live in the URL, so a
 * view can be bookmarked, shared and survives a refresh. Pure: no framework.
 */
export const PAGE_SIZES = [10, 25, 50, 100] as const;
export type SortDir = "asc" | "desc";
type Params = Record<string, string | string[] | undefined>;

export type TableQuery = {
  q: string;
  sort: string;
  dir: SortDir;
  page: number;
  size: number;
  /** Filter values keyed by name; "all" or missing means no filter. */
  filters: Record<string, string>;
};

type Spec = { sorts: readonly string[]; defaultSort: string; defaultDir?: SortDir; filters?: Record<string, readonly string[]> };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

export function parseTableQuery(params: Params, spec: Spec): TableQuery {
  const sort = spec.sorts.includes(one(params.sort)) ? one(params.sort) : spec.defaultSort;
  const dirParam = one(params.dir);
  const dir: SortDir = dirParam === "asc" || dirParam === "desc" ? dirParam : spec.defaultDir ?? "desc";
  const size = PAGE_SIZES.find((candidate) => String(candidate) === one(params.size)) ?? 25;
  const page = Math.max(1, Math.min(100_000, Math.trunc(Number(one(params.page))) || 1));
  const filters: Record<string, string> = {};
  for (const [name, allowed] of Object.entries(spec.filters ?? {})) {
    const value = one(params[name]);
    filters[name] = allowed.includes(value) ? value : "all";
  }
  return { q: one(params.q).trim().slice(0, 100), sort, dir, page, size, filters };
}

export function pageCount(total: number, size: number) {
  return Math.max(1, Math.ceil(total / size));
}

/** The query as URL parameters, leaving out everything at its default so links stay short. */
export function tableParams(query: TableQuery, defaults: { sort: string; dir: SortDir }, fixed: Record<string, string> = {}) {
  const out = new URLSearchParams(Object.entries(fixed));
  if (query.q) out.set("q", query.q);
  if (query.sort !== defaults.sort || query.dir !== defaults.dir) { out.set("sort", query.sort); out.set("dir", query.dir); }
  if (query.size !== 25) out.set("size", String(query.size));
  for (const [name, value] of Object.entries(query.filters)) if (value !== "all") out.set(name, value);
  if (query.page > 1) out.set("page", String(query.page));
  return out;
}

export function tableHref(base: string, params: URLSearchParams) {
  const text = params.toString();
  return text ? `${base}?${text}` : base;
}

/** In-memory search, sort and paging for lists that are small by nature (one organization's members). */
export function applyTableQuery<T>(
  rows: readonly T[],
  query: TableQuery,
  options: { search: (row: T) => string; sortKey: (row: T, sort: string) => string | number; filter?: (row: T, name: string, value: string) => boolean },
) {
  const needle = query.q.toLowerCase();
  const filtered = rows.filter((row) =>
    (!needle || options.search(row).toLowerCase().includes(needle)) &&
    Object.entries(query.filters).every(([name, value]) => value === "all" || !options.filter || options.filter(row, name, value)));
  const sign = query.dir === "asc" ? 1 : -1;
  const sorted = [...filtered].sort((left, right) => {
    const a = options.sortKey(left, query.sort);
    const b = options.sortKey(right, query.sort);
    return (typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), undefined, { sensitivity: "base" })) * sign;
  });
  const lastPage = pageCount(sorted.length, query.size);
  const page = Math.min(query.page, lastPage);
  return { rows: sorted.slice((page - 1) * query.size, page * query.size), total: sorted.length, page };
}
