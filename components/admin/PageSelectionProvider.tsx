"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { pageSelectionCookieName, type PageSelectionScope } from "@/lib/page-selection";

const PageSelectionContext = createContext<{ selectedPageId?: string; rememberPage: (id: string) => void }>({ rememberPage: () => {} });

export function PageSelectionProvider({ scope, pageIds, initialPageId, children }: {
  scope: PageSelectionScope; pageIds: string[]; initialPageId?: string; children: ReactNode;
}) {
  const pathname = usePathname();
  const query = useSearchParams();
  const [selection, setSelection] = useState<{ id?: string; from?: string }>({ id: initialPageId });
  const routeKey = `${pathname}?${query.toString()}`;
  const requested = query.get("pageId") ?? pathname.match(/^\/organization\/pages\/([^/]+)(?:\/|$)/)?.[1];
  const routePage = requested && pageIds.includes(requested) ? requested : undefined;
  const cookieName = pageSelectionCookieName(scope);
  const rememberPage = useCallback((id: string) => {
    if (!pageIds.includes(id)) return;
    document.cookie = `${cookieName}=${encodeURIComponent(id)}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    setSelection({ id, from: routeKey });
  }, [cookieName, pageIds, routeKey]);

  useEffect(() => {
    if (routePage) {
      // Sync explicit URLs and page-management navigation with the shared preference.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      rememberPage(routePage);
    }
  }, [routePage, rememberPage]);

  const selectedPageId = selection.from === routeKey ? selection.id : routePage ?? selection.id;
  return <PageSelectionContext.Provider value={{ selectedPageId, rememberPage }}>{children}</PageSelectionContext.Provider>;
}

export function usePageSelection() {
  return useContext(PageSelectionContext);
}
