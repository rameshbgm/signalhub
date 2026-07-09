import { collections } from "@/lib/db";
import { getSession, getPlatformSession } from "@/lib/auth";
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
  if (session.role !== "TENANT_ADMIN") {
    throw new AdminAuthError("Only tenant admins can do this");
  }
  return session;
}

/** Platform gate: spans all tenants, separate identity from org sessions. */
export async function requirePlatformSession() {
  const session = await getPlatformSession();
  if (!session) throw new AdminAuthError("Not authenticated");
  return session;
}

export async function assertPageInOrg(pageId: string, orgId: string) {
  const pageDoc = await collections.pages().findOne({ _id: oid(pageId) });
  if (!pageDoc || pageDoc.orgId.toHexString() !== orgId) throw new AdminAuthError("Page not found in your organization");
  return toId(pageDoc);
}
