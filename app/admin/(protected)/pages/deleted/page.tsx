import Link from "next/link";
import { database } from "@/lib/postgres/client";
import { requireCapability } from "@/lib/admin-guard";
import { PlatformSubmitButton } from "@/components/platform/PlatformSubmitButton";
import { permanentlyDeletePage, restorePage } from "../actions";

export default async function DeletedPagesPage() {
  const session = await requireCapability("page.configure");
  const pages = await database.selectFrom("pages").selectAll().where("orgId", "=", session.orgId).where("deletedAt", "is not", null).orderBy("deletedAt", "desc").execute();
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="border-b border-[var(--line)] pb-5">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--cyan)]">Page recovery</p>
        <h1 className="mt-2 font-mono text-2xl font-semibold text-[var(--fg)]">Deleted pages</h1>
        <p className="mt-2 text-sm text-[var(--fg-soft)]">Deleted pages are unavailable until an administrator restores them. Permanent deletion removes the page and its related records.</p>
      </header>
      <div className="space-y-3">
        {pages.map((page) => (
          <article key={page.id} className="flex flex-col gap-4 border border-[var(--line)] bg-[var(--surface)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-[var(--fg)]">{page.name}</h2>
              <p className="mt-1 font-mono text-xs text-[var(--fg-dim)]">/{page.slug} · deleted {page.deletedAt ? new Date(page.deletedAt).toLocaleString() : "recently"}</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <form action={restorePage.bind(null, page.id)}>
                <PlatformSubmitButton pendingLabel="Restoring…" className="w-full border border-[var(--cyan)]/40 px-4 py-2 text-sm font-semibold text-[var(--cyan)]">Restore page</PlatformSubmitButton>
              </form>
              <form action={permanentlyDeletePage.bind(null, page.id)}>
                <PlatformSubmitButton pendingLabel="Deleting…" confirmMessage={`Permanently delete ${page.name}? This cannot be undone.`} className="w-full border border-[var(--red)]/40 px-4 py-2 text-sm font-semibold text-[var(--red)]">Delete permanently</PlatformSubmitButton>
              </form>
            </div>
          </article>
        ))}
        {pages.length === 0 && <div className="border border-dashed border-[var(--line-bright)] p-8 text-center text-sm text-[var(--fg-dim)]">No deleted pages.</div>}
      </div>
      <Link href="/organization/pages" className="inline-block text-sm font-semibold text-[var(--cyan)] hover:underline">← Back to active pages</Link>
    </div>
  );
}
