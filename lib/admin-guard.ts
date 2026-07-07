import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export class AdminAuthError extends Error {}

export async function requireOrgSession() {
  const session = await getSession();
  if (!session) throw new AdminAuthError("Not authenticated");
  return session;
}

export async function assertPageInOrg(pageId: string, orgId: string) {
  const page = await prisma.page.findUnique({ where: { id: pageId } });
  if (!page || page.orgId !== orgId) throw new AdminAuthError("Page not found in your organization");
  return page;
}
