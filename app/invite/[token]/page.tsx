import Link from "next/link";
import { notFound } from "next/navigation";
import { collections } from "@/lib/db";
import { hashSecret } from "@/lib/secrets";
import { organizationIsActive } from "@/lib/organization-state";
import { passwordMinimumLength } from "@/lib/password-policy";
import { InviteAcceptanceForm } from "./InviteAcceptanceForm";

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const membership = await collections.memberships().findOne({
    invitationTokenHash: hashSecret(token),
    status: "INVITED",
    invitationExpiresAt: { $gt: new Date() },
  });
  if (!membership) notFound();
  const [organization, user] = await Promise.all([
    collections.organizations().findOne({ _id: membership.orgId }),
    collections.users().findOne({ _id: membership.userId }),
  ]);
  if (!organization || !organizationIsActive(organization) || !user || user.disabled) {
    notFound();
  }
  if (
    !user.passwordHash &&
    (user.oidcIssuer ||
      user.oidcSubject ||
      (await collections
        .memberships()
        .countDocuments({ userId: user._id })) !== 1)
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
          Join {organization.name}
        </h1>
        <p className="mt-2 text-sm text-[var(--fg-soft)]">
          Continue as {user.email}. This invitation expires 48 hours after it was issued.
        </p>
        <InviteAcceptanceForm
          token={token}
          hasPassword={Boolean(user.passwordHash)}
          passwordMinimum={passwordMinimumLength()}
        />
      </section>
    </main>
  );
}
