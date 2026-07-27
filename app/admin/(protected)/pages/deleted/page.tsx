import Link from "next/link";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { requireCapability } from "@/lib/admin-guard";
import { deletedPageFilter } from "@/lib/page-lifecycle";
import { PlatformSubmitButton } from "@/components/platform/PlatformSubmitButton";
import { restorePage } from "../actions";

export default async function DeletedPagesPage() {
  const session = await requireCapability("page.configure");
  const pages = (await collections.pages().find(
    deletedPageFilter({ orgId: oid(session.orgId) })
  ).sort({ deletedAt: -1 }).toArray()).map(toId);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="border-b border-[var(--line)] pb-5">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--cyan)]">Page recovery</p>
        <h1 className="mt-2 font-mono text-2xl font-semibold text-[var(--fg)]">Deleted Pages</h1>
        <p className="mt-2 text-sm text-[var(--fg-soft)]">Deleted pages are unavailable to visitors and signed-in operators until an administrator restores them.</p>
      </header>
      <div className="space-y-3">
        {pages.map((page) => (
          <article key={page.id} className="flex flex-col gap-4 border border-[var(--line)] bg-[var(--surface)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-[var(--fg)]">{page.name}</h2>
              <p className="mt-1 font-mono text-xs text-[var(--fg-dim)]">/{page.slug} · deleted {page.deletedAt ? new Date(page.deletedAt).toLocaleString() : "recently"}</p>
            </div>
            <form action={restorePage.bind(null, page.id)}>
              <PlatformSubmitButton pendingLabel="Restoring…" className="border border-[var(--cyan)]/40 px-4 py-2 text-sm font-semibold text-[var(--cyan)] hover:bg-[var(--cyan-soft)]">Restore page</PlatformSubmitButton>
            </form>
          </article>
        ))}
        {pages.length === 0 && <div className="border border-dashed border-[var(--line-bright)] p-8 text-center text-sm text-[var(--fg-dim)]">No deleted pages.</div>}
      </div>
      <Link href="/organization/pages" className="inline-block text-sm font-semibold text-[var(--cyan)] hover:underline">← Back to active pages</Link>
    </div>
  );
}
