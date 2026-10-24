export type PageSelectionScope = { orgId: string; userId: string };

/** A UI preference only; every reader must still restrict it to accessible pages. */
export function pageSelectionCookieName(scope: PageSelectionScope) {
  return `signalhub-page-${scope.orgId}-${scope.userId}`;
}

export function resolvePageSelection<T extends { id: string }>(pages: T[], requested?: string, remembered?: string, defaultToAll = false): T | undefined {
  if (defaultToAll && requested === "all") return undefined;
  return pages.find((page) => page.id === requested)
    ?? pages.find((page) => page.id === remembered)
    ?? (defaultToAll ? undefined : pages[0]);
}

const PAGE_SCOPED_ROUTES = new Set([
  "/organization/monitors", "/organization/monitors/new", "/organization/metrics", "/organization/metrics/new",
  "/organization/events", "/organization/incidents/new", "/organization/maintenance/new",
  "/organization/subscribers", "/organization/analytics", "/organization/notifications",
  "/organization/api-keys", "/organization/embed",
]);

/** Keep navigation scoped, including prefetched routes cached before a selection changed. */
export function pageScopedHref(href: string, pageId?: string) {
  if (!pageId) return href;
  const url = new URL(href, "http://selection.invalid");
  if (url.origin !== "http://selection.invalid") return href;
  if (!PAGE_SCOPED_ROUTES.has(url.pathname) || url.searchParams.has("pageId")) return href;
  url.searchParams.set("pageId", pageId);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function pagePickerHref(basePath: string, pageId: string, allowAll = false) {
  const url = new URL(basePath, "http://selection.invalid");
  if (pageId || allowAll) url.searchParams.set("pageId", pageId || "all");
  else url.searchParams.delete("pageId");
  return `${url.pathname}${url.search}${url.hash}`;
}
