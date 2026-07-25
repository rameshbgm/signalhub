import Link from "next/link";
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
    <div>
      <h1 className="font-mono text-xl font-semibold text-[var(--fg)] mb-6">Pages</h1>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-2">
          {pages.map((p) => (
            <div key={p.id} className="flex flex-col gap-3 border border-[var(--line)] p-3 bg-[var(--surface)] text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <span className="font-medium text-[var(--fg)]">{p.name}</span>
                <span className="text-xs text-[var(--fg-dim)] ml-2">/{p.slug}</span>
                <span className="text-[10px] uppercase tracking-wide bg-[var(--surface-raised)] text-[var(--fg-soft)] px-1.5 py-0.5 ml-2">{p.type}</span>
                {p.isHub && <span className="text-[10px] uppercase tracking-wide bg-[var(--cyan-soft)] text-[var(--cyan)] px-1.5 py-0.5 ml-2">hub</span>}
              </div>
              <div className="flex gap-2 shrink-0">
                <a
                  href={publicPagePath(p)}
                  target="_blank"
                  rel="noreferrer"
                  className="border border-[var(--cyan)]/30 px-2.5 py-1 text-xs font-semibold text-[var(--cyan)] transition-colors hover:bg-[var(--cyan-soft)]"
                >
                  View
                </a>
                {canConfigure && (
                  <>
                    <Link
                      href={`/admin/pages/${p.id}/setup/components`}
                      className="border border-[var(--cyan)]/30 px-2.5 py-1 text-xs font-semibold text-[var(--cyan)] transition-colors hover:bg-[var(--cyan-soft)]"
                    >
                      Build page
                    </Link>
                    <Link
                      href={`/admin/pages/${p.id}`}
                      className="border border-[var(--cyan)]/30 px-2.5 py-1 text-xs font-semibold text-[var(--cyan)] transition-colors hover:bg-[var(--cyan-soft)]"
                    >
                      Configure
                    </Link>
                  </>
                )}
              </div>
            </div>
          ))}
          {pages.length === 0 && <p className="text-sm text-[var(--fg-dim)]">No pages yet. Create your first one.</p>}
        </div>

        {canConfigure ? (
        <form action={createPage} className="border border-[var(--line)] p-4 bg-[var(--surface)] space-y-3 h-fit">
          <h2 className="font-mono font-semibold text-sm text-[var(--fg)]">New Page</h2>
          <input name="name" placeholder="Page name" className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--fg-dim)] focus:border-[var(--cyan)] focus:outline-none" required />
          <input name="slug" placeholder="URL slug (optional)" className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--fg-dim)] focus:border-[var(--cyan)] focus:outline-none" />
          <select name="type" className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none">
            <option value="PUBLIC">Public</option>
            <option value="PRIVATE">Private (password protected)</option>
            <option value="AUDIENCE">Audience-specific (per-user login)</option>
          </select>
          <input name="password" type="password" placeholder="Password (if private)" className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--fg-dim)] focus:border-[var(--cyan)] focus:outline-none" />
          <label className="flex items-center gap-2 text-sm text-[var(--fg-soft)]">
            <input type="checkbox" name="isHub" /> This is a hub page
          </label>
          {hubs.length > 0 && (
            <select name="hubParentId" className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none">
              <option value="">No hub parent</option>
              {hubs.map((h) => (
                <option key={h.id} value={h.id}>
                  Child of {h.name}
                </option>
              ))}
            </select>
          )}
          <button className="w-full bg-[var(--cyan)] text-[var(--on-cyan)] py-2 text-sm font-semibold font-mono">Create Page</button>
        </form>
        ) : (
          <aside className="h-fit border border-[var(--line)] bg-[var(--surface)] p-4 text-sm text-[var(--fg-soft)]">
            Your role can view assigned pages. Page creation and branding require an administrator.
          </aside>
        )}
      </div>
    </div>
  );
}
