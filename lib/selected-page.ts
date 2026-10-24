import { cookies } from "next/headers";
import { pageSelectionCookieName, resolvePageSelection, type PageSelectionScope } from "@/lib/page-selection";

export async function selectedPage<T extends { id: string }>(pages: T[], scope: PageSelectionScope, requested?: string, defaultToAll = false) {
  const remembered = (await cookies()).get(pageSelectionCookieName(scope))?.value;
  return resolvePageSelection(pages, requested, remembered, defaultToAll);
}
