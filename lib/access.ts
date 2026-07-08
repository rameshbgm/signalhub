import { collections } from "@/lib/db";
import { getPageAccessSession } from "@/lib/auth";
import { oid } from "@/lib/mongo-utils";

export type AccessResult =
  | { ok: true; visibleComponentIds: string[] | null } // null = all components visible
  | { ok: false; reason: "password" | "login" };

/**
 * Determines whether the current visitor may view a page, and if it's an
 * AUDIENCE page, which component ids they're scoped to.
 */
export async function checkPageAccess(page: { id: string; type: string }): Promise<AccessResult> {
  if (page.type === "PUBLIC") return { ok: true, visibleComponentIds: null };

  const session = await getPageAccessSession(page.id);

  if (page.type === "PRIVATE") {
    if (session?.pageId === page.id) return { ok: true, visibleComponentIds: null };
    return { ok: false, reason: "password" };
  }

  if (page.type === "AUDIENCE") {
    if (session?.pageId === page.id && session.userId) {
      const user = await collections.pageAccessUsers().findOne({ _id: oid(session.userId) });
      if (!user) return { ok: false, reason: "login" };
      const group = user.groupId ? await collections.pageAccessGroups().findOne({ _id: user.groupId }) : null;
      const own: string[] = JSON.parse(user.componentIds || "[]");
      const groupIds: string[] = group ? JSON.parse(group.componentIds || "[]") : [];
      const merged = Array.from(new Set([...own, ...groupIds]));
      return { ok: true, visibleComponentIds: merged };
    }
    return { ok: false, reason: "login" };
  }

  return { ok: false, reason: "password" };
}
