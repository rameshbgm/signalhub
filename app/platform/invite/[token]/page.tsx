import Link from "next/link";
import { notFound } from "next/navigation";
import { collections } from "@/lib/db";
import { hashSecret } from "@/lib/secrets";
import { passwordMinimumLength } from "@/lib/password-policy";
import { PlatformInviteAcceptanceForm } from "./PlatformInviteAcceptanceForm";

export default async function PlatformInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invitation = await collections.platformInvites().findOne({
    tokenHash: hashSecret(token),
    acceptedAt: null,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!invitation) notFound();
  return (
    <main className="grain flex min-h-screen items-center justify-center bg-[var(--bg)] p-4">
      <section className="w-full max-w-md border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8">
        <Link href="/" className="font-mono text-sm font-semibold text-[var(--fg)]">SignalHub</Link>
        <p className="mt-5 font-mono text-xs uppercase tracking-widest text-[var(--cyan)]">Platform invitation</p>
        <h1 className="mt-2 font-mono text-2xl font-semibold text-[var(--fg)]">Join as {invitation.role.toLowerCase()}</h1>
        <p className="mt-2 text-sm text-[var(--fg-soft)]">Create the platform account for {invitation.email}. This link is single-use and expires after 48 hours.</p>
        <PlatformInviteAcceptanceForm
          token={token}
          passwordMinimum={passwordMinimumLength()}
        />
      </section>
    </main>
  );
}
