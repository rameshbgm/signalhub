/** Shared pure helpers for the Monitors and Metrics lists: grouped paging and per-browser saved views. */

export type ListGroup<T> = { key: string; name: string; items: T[] };
export type ListEntry<T> =
  | { kind: "group"; group: ListGroup<T>; /** The page starts inside this group, so its header is repeated. */ continued: boolean }
  | { kind: "row"; item: T; groupKey: string };

/**
 * Header and visible rows in display order. A collapsed group contributes only its header, so a page
 * is never padded with rows nobody can see. Ungrouped lists pass one group and `grouped: false`.
 */
export function flattenEntries<T>(groups: ListGroup<T>[], openKeys: ReadonlySet<string>, grouped: boolean): ListEntry<T>[] {
  const entries: ListEntry<T>[] = [];
  for (const group of groups) {
    if (grouped) entries.push({ kind: "group", group, continued: false });
    if (grouped && !openKeys.has(group.key)) continue;
    for (const item of group.items) entries.push({ kind: "row", item, groupKey: group.key });
  }
  return entries;
}

export const PAGE_SIZES = [10, 25, 50] as const;

/** One page of entries. A page that starts in the middle of a group repeats that group's header. */
export function pageEntries<T>(entries: ListEntry<T>[], groups: ListGroup<T>[], page: number, size: number, grouped: boolean) {
  const pages = Math.max(1, Math.ceil(entries.length / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const slice = entries.slice((current - 1) * size, current * size);
  const first = slice[0];
  if (grouped && first?.kind === "row") {
    const group = groups.find((candidate) => candidate.key === first.groupKey);
    if (group) slice.unshift({ kind: "group", group, continued: true });
  }
  return { entries: slice, page: current, pages };
}

/** Page buttons to show: first, last and the neighbours of the current page, with gaps as "…". */
export function pageNumbers(page: number, pages: number): (number | "…")[] {
  const numbers: (number | "…")[] = [];
  for (let p = 1; p <= pages; p += 1) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 1) numbers.push(p);
    else if (numbers[numbers.length - 1] !== "…") numbers.push("…");
  }
  return numbers;
}

export const MAX_SAVED_VIEWS = 20;
export const SAVED_VIEW_NAME_MAX = 40;

/** A named snapshot of the list controls. `base` is the id of the built-in view it starts from. */
export type SavedView = { id: string; name: string; base: string; query: string; tags: string[]; groupBy: string; sort: string };

const isText = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max;

function validView(value: unknown): value is SavedView {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return isText(v.id, 64) && v.id !== "" && isText(v.name, SAVED_VIEW_NAME_MAX) && v.name.trim() !== "" && isText(v.base, 32) && isText(v.query, 200)
    && isText(v.groupBy, 32) && isText(v.sort, 32) && Array.isArray(v.tags) && v.tags.length <= 50 && v.tags.every((tag) => isText(tag, 64));
}

/** Stored JSON is untrusted (any script on the origin or a stale version may have written it): keep only well-formed views. */
export function parseViews(raw: string | null): SavedView[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(validView).slice(0, MAX_SAVED_VIEWS) : [];
  } catch {
    return [];
  }
}

export function loadViews(storageKey: string): SavedView[] {
  try {
    return parseViews(localStorage.getItem(storageKey));
  } catch {
    return [];
  }
}

export function saveViews(storageKey: string, views: SavedView[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(views.slice(0, MAX_SAVED_VIEWS)));
  } catch {
    // Storage can be blocked or full; the views then last for this visit only.
  }
}

export type RollupTick = "ok" | "fail" | "none";

/**
 * One strip for a whole group: at each of the last `length` check positions the group is failing if any monitor
 * failed there, ok if at least one passed, and empty if none had a check yet. Series are newest first.
 */
export function rollupTicks(seriesList: boolean[][], length = 30): RollupTick[] {
  return Array.from({ length }, (_, fromOldest) => {
    const age = length - 1 - fromOldest;
    const results = seriesList.flatMap((series) => (age < series.length ? [series[age]] : []));
    return results.length === 0 ? "none" : results.includes(false) ? "fail" : "ok";
  });
}
