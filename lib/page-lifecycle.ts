import type { Filter } from "mongodb";
import type { PageDoc } from "@/lib/db";

/** Legacy records without these fields remain active and publicly visible. */
export function activePageFilter(extra: Filter<PageDoc> = {}): Filter<PageDoc> {
  return { ...extra, deletedAt: null };
}

export function publicPageFilter(extra: Filter<PageDoc> = {}): Filter<PageDoc> {
  return { ...extra, deletedAt: null, publicVisible: { $ne: false } };
}

export function deletedPageFilter(extra: Filter<PageDoc> = {}): Filter<PageDoc> {
  return { ...extra, deletedAt: { $ne: null } };
}
