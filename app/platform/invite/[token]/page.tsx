import Link from "next/link";

export default function RetiredPlatformInvitePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-6 text-[var(--fg)]">
      <section className="max-w-lg border border-[var(--line)] bg-[var(--surface)] p-8">
        <p className="font-mono text-xs uppercase tracking-widest text-[var(--fg-dim)]">Platform access</p>
        <h1 className="mt-3 font-mono text-2xl font-semibold">Platform invitations have been retired</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--fg-soft)]">
          Platform invitations have been retired. An Admin can create users directly from Users &amp; Roles.
        </p>
        <Link href="/login" className="mt-6 inline-flex bg-[var(--cyan)] px-4 py-2 text-sm font-semibold text-[var(--on-cyan)]">
          Platform sign in
        </Link>
      </section>
    </main>
  );
}
