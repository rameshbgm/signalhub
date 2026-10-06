import { notFound } from "next/navigation";
import { MailPlus } from "lucide-react";
import { AuthShell } from "@/components/admin/AuthShell";
import { database } from "@/lib/postgres/client";
import { hashSecret } from "@/lib/secrets";
import { passwordMinimumLength } from "@/lib/password-policy";
import { InviteAcceptanceForm } from "./InviteAcceptanceForm";

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await database.selectFrom("memberships as membership")
    .innerJoin("organizations as organization", "organization.id", "membership.orgId")
    .innerJoin("users as user", "user.id", "membership.userId")
    .select(["organization.name as organizationName", "organization.status", "organization.suspended",
      "user.id as userId", "user.email", "user.disabled", "user.passwordHash", "user.oidcIssuer", "user.oidcSubject"])
    .where("membership.invitationTokenHash", "=", hashSecret(token)).where("membership.status", "=", "INVITED")
    .where("membership.invitationExpiresAt", ">", new Date()).executeTakeFirst();
  if (!invite || invite.status !== "ACTIVE" || invite.suspended || invite.disabled) notFound();
  if (
    !invite.passwordHash &&
    (invite.oidcIssuer || invite.oidcSubject ||
      Number((await database.selectFrom("memberships").select((expression) => expression.fn.countAll<number>().as("count"))
        .where("userId", "=", invite.userId).executeTakeFirstOrThrow()).count) !== 1)
  ) {
    notFound();
  }

  return (
    <AuthShell>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-primary-ink">
        <MailPlus aria-hidden size={12} />
        Organization invitation
      </span>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">Join {invite.organizationName}</h1>
      <p className="mt-2 text-sm leading-6 text-ink-soft">
        Continue as {invite.email}. This invitation expires 48 hours after it was issued.
      </p>
      <InviteAcceptanceForm
        token={token}
        hasPassword={Boolean(invite.passwordHash)}
        passwordMinimum={passwordMinimumLength()}
      />
    </AuthShell>
  );
}
