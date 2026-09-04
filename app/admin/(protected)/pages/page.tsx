import Link from "next/link";
import { CheckCircle2, ExternalLink, EyeOff, FilePenLine, Pencil, Plus, Trash2 } from "lucide-react";
import { requireSession } from "@/lib/require-session";
import { getScopedPages, sessionHasCapability } from "@/lib/admin-guard";
import { publicPagePath } from "@/lib/public-path";

export default async function PagesListPage() {
  const { session, org } = await requireSession();
  const pages = await getScopedPages(session, org.id);
  const canConfigure = sessionHasCapability(session, "page.configure");
  const pageCount = `${pages.length} ${pages.length === 1 ? "page" : "pages"}`;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="flex flex-col gap-4 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--fg)]">Pages</h1>
          <p className="mt-2 text-sm text-[var(--fg-soft)]">
            {pages.length ? "Choose a page to manage its status experience." : "Create a page to begin sharing service status."}
          </p>
        </div>
        {canConfigure && (
          <Link
            href="/organization/pages/new"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--cyan)] px-4 text-sm font-semibold text-[var(--on-cyan)] transition-colors hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cyan)]"
          >
            Create page
          </Link>
        )}
      </header>

      {pages.length ? (
        <section aria-label="Status pages" className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-[0_1px_2px_rgba(60,64,67,0.08)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-4 sm:px-6">
            <p className="text-sm font-semibold text-[var(--fg)]">{pageCount}</p>
            <p className="text-xs text-[var(--fg-dim)]">Manage your public status surfaces</p>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-left">
            <thead className="bg-[var(--bg)] text-xs font-semibold uppercase tracking-[0.08em] text-[var(--fg-dim)]">
              <tr>
                <th scope="col" className="px-4 py-3 sm:px-6">Page</th>
                <th scope="col" className="px-4 py-3 sm:px-6">Status</th>
                <th scope="col" className="px-4 py-3 text-right sm:px-6">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
            {pages.map((page) => {
              const state = page.setupCompletedAt === null ? "Draft" : page.publicVisible ? "Published" : "Hidden";
              const accessLabel = page.isHub ? "Hub" : page.type === "PUBLIC" ? null : page.type === "PRIVATE" ? "Private" : "Audience";
              const stateClass = state === "Published"
                ? "bg-[var(--green-soft)] text-[var(--green)]"
                : state === "Hidden"
                  ? "bg-[var(--surface-raised)] text-[var(--fg-soft)]"
                  : "bg-[var(--amber-soft)] text-[var(--amber)]";
              const StateIcon = state === "Published" ? CheckCircle2 : state === "Hidden" ? EyeOff : FilePenLine;

              return (
                <tr key={page.id} className="group transition-colors hover:bg-[var(--hover-overlay)]">
                  <th scope="row" className="px-4 py-4 font-normal sm:px-6">
                    <span className="block truncate text-base font-semibold text-[var(--fg)]">{page.name}</span>
                    <span className="mt-1 block font-mono text-xs text-[var(--fg-dim)]">/{page.slug}{accessLabel ? ` · ${accessLabel}` : ""}</span>
                  </th>
                  <td className="px-4 py-4 sm:px-6">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${stateClass}`}>
                      <StateIcon aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.25} />
                      {state}
                    </span>
                  </td>
                  <td className="px-4 py-4 sm:px-6">
                    <div className="flex items-center justify-end gap-2">
                      {page.publicVisible && page.setupCompletedAt && (
                        <a href={publicPagePath(page)} target="_blank" rel="noreferrer" aria-label={`Open ${page.name} live`} title="Open live" className="page-management-action-icon rounded-lg border border-[var(--line)] text-[var(--fg-soft)] hover:border-[var(--cyan)] hover:text-[var(--cyan)]">
                          <ExternalLink aria-hidden="true" className="h-4 w-4" />
                        </a>
                      )}
                      {canConfigure && (
                        <>
                          <Link href={`/organization/pages/${page.id}`} aria-label={`Edit ${page.name}`} title="Edit page" className="page-management-action-icon rounded-lg border border-[var(--line)] text-[var(--fg-soft)] hover:border-[var(--cyan)] hover:text-[var(--cyan)]">
                            <Pencil aria-hidden="true" className="h-4 w-4" />
                          </Link>
                          <Link href={`/organization/pages/${page.id}/settings#delete-page`} aria-label={`Delete ${page.name}`} title="Delete page" className="page-management-action-icon rounded-lg border border-[var(--line)] text-[var(--fg-soft)] hover:border-[var(--red)] hover:text-[var(--red)]">
                            <Trash2 aria-hidden="true" className="h-4 w-4" />
                          </Link>
                          {page.isHub && <Link href={`/organization/pages/new?hubParentId=${page.id}`} aria-label="Create status page in this hub" title="Add page to hub" className="page-management-action-icon rounded-lg border border-[var(--line)] text-[var(--fg-soft)] hover:border-[var(--cyan)] hover:text-[var(--cyan)]"><Plus aria-hidden="true" className="h-4 w-4" /></Link>}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            </tbody>
          </table>
          </div>
        </section>
      ) : (
        <section className="border border-dashed border-[var(--line-bright)] px-6 py-12 text-center">
          <h2 className="text-base font-semibold text-[var(--fg)]">No pages yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--fg-soft)]">Create your first status page, add a service, then publish when you are ready.</p>
        </section>
      )}
    </div>
  );
}
