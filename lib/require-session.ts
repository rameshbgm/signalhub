import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { requireOrgSession } from "@/lib/admin-guard";
import { organizationStatus } from "@/lib/organization-state";

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  const orgDoc = await collections.organizations().findOne({ _id: oid(session.orgId) });
  if (!orgDoc) redirect("/login");
  // Route an existing signed-in member to the restricted explanation page
  // before the normal live guard rejects all suspended-organization access.
  if (organizationStatus(orgDoc) === "SUSPENDED") redirect("/organization/suspended");
  const orgSession = await requireOrgSession().catch(() => null);
  if (!orgSession) redirect("/login");
  return { session: orgSession, org: toId(orgDoc) };
}
