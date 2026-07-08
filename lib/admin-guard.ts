import { collections } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { oid, toId } from "@/lib/mongo-utils";

export class AdminAuthError extends Error {}

export async function requireOrgSession() {
  const session = await getSession();
  if (!session) throw new AdminAuthError("Not authenticated");
  return session;
}

export async function assertPageInOrg(pageId: string, orgId: string) {
  const pageDoc = await collections.pages().findOne({ _id: oid(pageId) });
  if (!pageDoc || pageDoc.orgId.toHexString() !== orgId) throw new AdminAuthError("Page not found in your organization");
  return toId(pageDoc);
}
