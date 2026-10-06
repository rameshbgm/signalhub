import { redirect } from "next/navigation";
import { PauseCircle } from "lucide-react";
import { AuthShell } from "@/components/admin/AuthShell";
import { IconTile } from "@/components/ui/icon-tile";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { getSession } from "@/lib/auth";
import { database } from "@/lib/postgres/client";
import { organizationStatus } from "@/lib/organization-state";

export default async function OrgSuspendedPage() {
  // The normal admin guard intentionally rejects frozen organizations. This
  // restricted route performs only the minimum live identity checks needed to
  // let an already-signed-in member understand the suspension and sign out.
  const session = await getSession();
  if (!session) redirect("/login");
  const [membership, user, organization] = await Promise.all([
    database.selectFrom("memberships").select("id")
      .where("id", "=", session.membershipId).where("userId", "=", session.userId)
      .where("orgId", "=", session.orgId).where("status", "!=", "REVOKED").executeTakeFirst(),
    database.selectFrom("users").select("id")
      .where("id", "=", session.userId).where("disabled", "=", false).executeTakeFirst(),
    database.selectFrom("organizations").selectAll().where("id", "=", session.orgId).executeTakeFirst(),
  ]);
  if (!membership || !user || !organization) redirect("/login");
  if (organizationStatus(organization) !== "SUSPENDED") redirect("/organization");

  return (
    <AuthShell>
      <IconTile icon={PauseCircle} hue="rose" size="lg" />
      <h1 className="mt-5 text-3xl font-bold tracking-tight">Organization suspended</h1>
      <p className="mt-2 text-sm leading-6 text-ink-soft">
        {organization.name} has been suspended by a platform administrator. Contact support if you believe this is a mistake.
      </p>
      <div className="mt-8">
        <LogoutButton className="border border-line-strong bg-surface shadow-card" />
      </div>
    </AuthShell>
  );
}
