import { collections } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { oid, toId } from "@/lib/mongo-utils";

export class AdminAuthError extends Error {}

export async function requireOrgSession() {
  const session = await getSession();
  if (!session) throw new AdminAuthError("Not authenticated");
  return session;
}

/** Tenant-admin gate: billing, org settings, team management. */
export async function requireOrgAdmin() {
  const session = await requireOrgSession();
  if (session.role !== "OWNER" && session.role !== "ADMIN") {
    throw new AdminAuthError("Only organization owners and admins can do this");
  }
  return session;
}

export async function assertPageInOrg(pageId: string, orgId: string) {
  const pageDoc = await collections.pages().findOne({ _id: oid(pageId) });
  if (!pageDoc || pageDoc.orgId.toHexString() !== orgId) throw new AdminAuthError("Page not found in your organization");
  return toId(pageDoc);
}
