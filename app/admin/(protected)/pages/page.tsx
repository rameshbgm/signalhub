import Link from "next/link";
import { FluentSelect } from "@/components/FluentSelect";
import { requireSession } from "@/lib/require-session";
import { collections } from "@/lib/db";
import { toId } from "@/lib/mongo-utils";
import { createPage } from "./actions";
import { scopedPageFilter, sessionHasCapability } from "@/lib/admin-guard";
import { publicPagePath } from "@/lib/public-path";

export default async function PagesListPage() {
  const { session, org } = await requireSession();
  const pages = (await collections.pages().find(scopedPageFilter(session, org.id)).sort({ createdAt: 1 }).toArray()).map(toId);
  const hubs = pages.filter((p) => p.isHub);
  const canConfigure = sessionHasCapability(session, "page.configure");

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <header className="border-b border-[var(--line)] pb-5">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--cyan)]">
          Organization console
        </p>
        <h1 className="mt-2 font-mono text-2xl font-semibold text-[var(--fg)]">Status pages</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--fg-soft)]">
          Create and manage the public, private, and audience-specific pages for this organization.
        </p>
      </header>

      {canConfigure ? (
        <section className="mx-auto w-full max-w-4xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
          <div className="mb-5">
            <h2 className="font-mono text-base font-semibold text-[var(--fg)]">Create a status page</h2>
            <p className="mt-1 text-sm text-[var(--fg-dim)]">Start with the page details. Components and design come next.</p>
          </div>
          <form action={createPage} className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-semibold text-[var(--fg-soft)]">
              Page name
              <input
                name="name"
                placeholder="Customer status"
                className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm font-normal text-[var(--fg)] placeholder:text-[var(--fg-dim)] focus:border-[var(--cyan)] focus:outline-none"
                required
                suppressHydrationWarning
              />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-[var(--fg-soft)]">
              URL slug
              <input
                name="slug"
                placeholder="customer-status (optional)"
                className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm font-normal text-[var(--fg)] placeholder:text-[var(--fg-dim)] focus:border-[var(--cyan)] focus:outline-none"
                suppressHydrationWarning
              />
            </label>
            <div className="grid gap-1.5 text-xs font-semibold text-[var(--fg-soft)]">
              Visibility
              <FluentSelect aria-label="Visibility" name="type" className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm font-normal text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none">
                <option value="PUBLIC">Public</option>
                <option value="PRIVATE">Private (password protected)</option>
                <option value="AUDIENCE">Audience-specific (per-user login)</option>
              </FluentSelect>
            </div>
            <label className="grid gap-1.5 text-xs font-semibold text-[var(--fg-soft)]">
              Private page password
              <input
                name="password"
                type="password"
                placeholder="Required only for private pages"
                className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm font-normal text-[var(--fg)] placeholder:text-[var(--fg-dim)] focus:border-[var(--cyan)] focus:outline-none"
                suppressHydrationWarning
              />
            </label>
            {hubs.length > 0 && (
              <div className="grid gap-1.5 text-xs font-semibold text-[var(--fg-soft)]">
                Hub parent
                <FluentSelect aria-label="Hub parent" name="hubParentId" className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm font-normal text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none">
                  <option value="">No hub parent</option>
                  {hubs.map((h) => (
                    <option key={h.id} value={h.id}>
                      Child of {h.name}
                    </option>
                  ))}
                </FluentSelect>
              </div>
            )}
            <div className={`flex items-center ${hubs.length > 0 ? "sm:justify-end" : "sm:col-span-2"}`}>
              <label className="flex items-center gap-2 text-sm text-[var(--fg-soft)]">
                <input type="checkbox" name="isHub" suppressHydrationWarning /> This is a hub page
              </label>
            </div>
            <div className="flex justify-end border-t border-[var(--line)] pt-4 sm:col-span-2">
              <button className="w-full bg-[var(--cyan)] px-6 py-2.5 font-mono text-sm font-semibold text-[var(--on-cyan)] sm:w-auto">
                Create page
              </button>
            </div>
          </form>
        </section>
      ) : (
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
                {p.publicVisible === false && <span className="ml-2 bg-[var(--amber-soft)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--amber)]">hidden</span>}
              </div>
              <div className="flex gap-2 shrink-0">
                {p.publicVisible !== false && (
                  <a href={publicPagePath(p)} target="_blank" rel="noreferrer" className="border border-[var(--cyan)]/30 px-2.5 py-1 text-xs font-semibold text-[var(--cyan)] transition-colors hover:bg-[var(--cyan-soft)]">View</a>
                )}
                {canConfigure && (
                  <>
                    <Link
                      href={`/organization/pages/${p.id}/setup/components`}
                      className="border border-[var(--cyan)]/30 px-2.5 py-1 text-xs font-semibold text-[var(--cyan)] transition-colors hover:bg-[var(--cyan-soft)]"
                    >
                      Setup wizard
                    </Link>
                    <Link
                      href={`/organization/pages/${p.id}`}
                      className="border border-[var(--cyan)]/30 px-2.5 py-1 text-xs font-semibold text-[var(--cyan)] transition-colors hover:bg-[var(--cyan-soft)]"
                    >
                      Manage page
                    </Link>
                  </>
                )}
              </div>
            </div>
          ))}
          {pages.length === 0 && (
            <div className="border border-dashed border-[var(--line-bright)] bg-[var(--surface)] px-5 py-8 text-center xl:col-span-2">
              <p className="font-mono text-sm font-semibold text-[var(--fg)]">No status pages yet</p>
              <p className="mt-1 text-sm text-[var(--fg-dim)]">Use the form above to create the first page for this organization.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
