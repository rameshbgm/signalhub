import Link from "next/link";
import { notFound } from "next/navigation";
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
    <main className="grain flex min-h-screen items-center justify-center bg-[var(--bg)] p-4">
      <section className="w-full max-w-md border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8">
        <Link href="/" className="font-mono text-sm font-semibold text-[var(--fg)]">
          SignalHub
        </Link>
        <p className="mt-5 font-mono text-xs uppercase tracking-widest text-[var(--cyan)]">
          Organization invitation
        </p>
        <h1 className="mt-2 font-mono text-2xl font-semibold text-[var(--fg)]">
          Join {invite.organizationName}
        </h1>
        <p className="mt-2 text-sm text-[var(--fg-soft)]">
          Continue as {invite.email}. This invitation expires 48 hours after it was issued.
        </p>
        <InviteAcceptanceForm
          token={token}
          hasPassword={Boolean(invite.passwordHash)}
          passwordMinimum={passwordMinimumLength()}
        />
      </section>
    </main>
  );
}
