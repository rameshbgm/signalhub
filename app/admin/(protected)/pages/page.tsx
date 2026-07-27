import Link from "next/link";
import { requireSession } from "@/lib/require-session";
import { collections } from "@/lib/db";
import { toId } from "@/lib/mongo-utils";
import { scopedPageFilter, sessionHasCapability } from "@/lib/admin-guard";
import { publicPagePath } from "@/lib/public-path";

export default async function PagesListPage() {
  const { session, org } = await requireSession();
  const pages = (await collections.pages().find(scopedPageFilter(session, org.id)).sort({ createdAt: 1 }).toArray()).map(toId);
  const canConfigure = sessionHasCapability(session, "page.configure");

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <header className="flex flex-col gap-4 border-b border-[var(--line)] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--cyan)]">Organization console</p>
          <h1 className="mt-2 font-mono text-2xl font-semibold text-[var(--fg)]">Status pages</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--fg-soft)]">
            Create and manage the public, private, and audience-specific pages for this organization.
          </p>
        </div>
        {canConfigure && (
          <Link href="/organization/pages/new" className="shrink-0 bg-[var(--cyan)] px-5 py-2.5 text-center font-mono text-sm font-semibold text-[var(--on-cyan)]">
            Create page
          </Link>
        )}
      </header>

      {!canConfigure && (
        <aside className="border border-[var(--line)] bg-[var(--surface)] p-4 text-sm text-[var(--fg-soft)]">
          Your role can view assigned pages. Page creation and branding require an administrator.
        </aside>
      )}

      <section aria-labelledby="existing-pages-title" className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 id="existing-pages-title" className="font-mono text-base font-semibold text-[var(--fg)]">Your status pages</h2>
            <p className="mt-1 text-sm text-[var(--fg-dim)]">Open the public page or continue configuring its content and design.</p>
          </div>
          {pages.length > 0 && <span className="font-mono text-xs text-[var(--fg-dim)]">{pages.length} total</span>}
        </div>

        <div className="grid gap-3 xl:grid-cols-2">
          {pages.map((p) => (
            <div key={p.id} className="flex min-w-0 flex-col gap-4 border border-[var(--line)] bg-[var(--surface)] p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <span className="font-medium text-[var(--fg)]">{p.name}</span>
                <span className="text-xs text-[var(--fg-dim)] ml-2">/{p.slug}</span>
                <span className="text-[10px] uppercase tracking-wide bg-[var(--surface-raised)] text-[var(--fg-soft)] px-1.5 py-0.5 ml-2">{p.type}</span>
                {p.isHub && <span className="text-[10px] uppercase tracking-wide bg-[var(--cyan-soft)] text-[var(--cyan)] px-1.5 py-0.5 ml-2">hub</span>}
                {p.setupCompletedAt === null
                  ? <span className="ml-2 bg-[var(--amber-soft)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--amber)]">draft</span>
                  : p.publicVisible === false && <span className="ml-2 bg-[var(--amber-soft)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--amber)]">hidden</span>}
              </div>
              <div className="flex gap-2 shrink-0">
                {p.setupCompletedAt !== null && p.publicVisible !== false && (
                  <a href={publicPagePath(p)} target="_blank" rel="noreferrer" className="border border-[var(--cyan)]/30 px-2.5 py-1 text-xs font-semibold text-[var(--cyan)] transition-colors hover:bg-[var(--cyan-soft)]">View</a>
                )}
                {canConfigure && (
                  <Link
                    href={`/organization/pages/${p.id}`}
                    className="border border-[var(--cyan)]/30 px-2.5 py-1 text-xs font-semibold text-[var(--cyan)] transition-colors hover:bg-[var(--cyan-soft)]"
                  >
                    {p.setupCompletedAt === null ? "Continue setup" : "Manage page"}
                  </Link>
                )}
              </div>
            </div>
          ))}
          {pages.length === 0 && (
            <div className="border border-dashed border-[var(--line-bright)] bg-[var(--surface)] px-5 py-8 text-center xl:col-span-2">
              <p className="font-mono text-sm font-semibold text-[var(--fg)]">No status pages yet</p>
              <p className="mt-1 text-sm text-[var(--fg-dim)]">Create a page to begin configuring your public status experience.</p>
              {canConfigure && <Link href="/organization/pages/new" className="mt-4 inline-flex text-sm font-semibold text-[var(--cyan)] hover:underline">Create your first page →</Link>}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
