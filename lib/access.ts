import { getPageAccessSession } from "@/lib/auth";
import { isPageOrganizationActive } from "@/lib/public-page";
import { database } from "@/lib/postgres/client";

export type AccessResult =
  | { ok: true; visibleComponentIds: string[] | null } // null = all components visible
  | { ok: false; reason: "password" | "login" | "unavailable" };

/**
 * Determines whether the current visitor may view a page, and if it's an
 * AUDIENCE page, which component ids they're scoped to.
 */
export async function checkPageAccess(page: { id: string; type: string; orgId: string }): Promise<AccessResult> {
  if (!(await isPageOrganizationActive(page.orgId))) {
    return { ok: false, reason: "unavailable" };
  }
  if (page.type === "PUBLIC") return { ok: true, visibleComponentIds: null };

  const session = await getPageAccessSession(page.id);

  if (page.type === "PRIVATE") {
    if (session?.pageId === page.id) return { ok: true, visibleComponentIds: null };
    return { ok: false, reason: "password" };
  }

  if (page.type === "AUDIENCE") {
    if (session?.pageId === page.id && session.userId) {
      const user = await database
        .selectFrom("pageAccessUsers")
        .selectAll()
        .where("id", "=", session.userId)
        .where("pageId", "=", page.id)
        .executeTakeFirst();
      if (!user) return { ok: false, reason: "login" };
      const group = user.groupId
        ? await database
            .selectFrom("pageAccessGroups")
            .select("componentIds")
            .where("id", "=", user.groupId)
            .where("pageId", "=", page.id)
            .executeTakeFirst()
        : null;
      const merged = Array.from(new Set([...user.componentIds, ...(group?.componentIds ?? [])]));
      return { ok: true, visibleComponentIds: merged };
    }
    return { ok: false, reason: "login" };
  }

  return { ok: false, reason: "password" };
}
