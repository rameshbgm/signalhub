import { prisma } from "@/lib/db";
import { getPageAccessSession } from "@/lib/auth";

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
      const user = await prisma.pageAccessUser.findUnique({
        where: { id: session.userId },
        include: { group: true },
      });
      if (!user) return { ok: false, reason: "login" };
      const own: string[] = JSON.parse(user.componentIds || "[]");
      const groupIds: string[] = user.group ? JSON.parse(user.group.componentIds || "[]") : [];
      const merged = Array.from(new Set([...own, ...groupIds]));
      return { ok: true, visibleComponentIds: merged };
    }
    return { ok: false, reason: "login" };
  }

  return { ok: false, reason: "password" };
}
