import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { requireOrgSession } from "@/lib/admin-guard";
import { organizationStatus } from "@/lib/organization-state";
import { database } from "@/lib/postgres/client";

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  const orgDoc = await database
    .selectFrom("organizations")
    .selectAll()
    .where("id", "=", session.orgId)
    .executeTakeFirst();
  if (!orgDoc) redirect("/login");
  // Route an existing signed-in member to the restricted explanation page
  // before the normal live guard rejects all suspended-organization access.
  if (organizationStatus(orgDoc) === "SUSPENDED") redirect("/organization/suspended");
  const orgSession = await requireOrgSession().catch(() => null);
  if (!orgSession) redirect("/login");
  // Check before a protected page loads tenant data, even if its layout also redirects.
  if (orgSession.mfaVerified === false) redirect("/login");
  if (orgSession.mustChangePassword || orgSession.mustCompleteProfile) redirect("/organization/change-password");
  return { session: orgSession, org: orgDoc };
}
