import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { getSession } from "@/lib/auth";
import { collections } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";
import { organizationStatus } from "@/lib/organization-state";

export default async function OrgSuspendedPage() {
  // The normal admin guard intentionally rejects frozen organizations. This
  // restricted route performs only the minimum live identity checks needed to
  // let an already-signed-in member understand the suspension and sign out.
  const session = await getSession();
  if (!session) redirect("/admin/login");
  const [membership, user, organization] = await Promise.all([
    collections.memberships().findOne({
      _id: oid(session.membershipId),
      userId: oid(session.userId),
      orgId: oid(session.orgId),
      status: { $ne: "REVOKED" },
    }),
    collections.users().findOne({ _id: oid(session.userId), disabled: { $ne: true } }),
    collections.organizations().findOne({ _id: oid(session.orgId) }),
  ]);
  if (!membership || !user || !organization) redirect("/admin/login");
  if (organizationStatus(organization) !== "SUSPENDED") redirect("/admin");

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] p-4">
      <div className="max-w-md space-y-3 border border-[var(--line)] bg-[var(--surface)] p-8 text-center">
        <h1 className="font-mono text-lg font-semibold text-[var(--red)]">Organization suspended</h1>
        <p className="text-sm text-[var(--fg-soft)]">
          {organization.name} has been suspended by a platform administrator. Contact support if you believe this is a mistake.
        </p>
        <LogoutButton />
      </div>
    </div>
  );
}
