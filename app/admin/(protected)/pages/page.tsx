import Link from "next/link";
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
        <section aria-label="Status pages" className="overflow-hidden border border-[var(--line)] bg-[var(--surface)]">
          <div className="border-b border-[var(--line)] px-4 py-3 sm:px-5">
            <p className="text-sm font-medium text-[var(--fg-soft)]">{pageCount}</p>
          </div>
          <ul className="divide-y divide-[var(--line)]">
            {pages.map((page) => {
              const state = page.setupCompletedAt === null ? "Draft" : page.publicVisible ? "Published" : "Hidden";
              const actionLabel = state === "Draft" ? "Continue setup" : "Manage page";
              const accessLabel = page.isHub ? "Hub" : page.type === "PUBLIC" ? null : page.type === "PRIVATE" ? "Private" : "Audience";
              const stateClass = state === "Published"
                ? "bg-[var(--green-soft)] text-[var(--green)]"
                : state === "Hidden"
                  ? "bg-[var(--surface-raised)] text-[var(--fg-soft)]"
                  : "bg-[var(--amber-soft)] text-[var(--amber)]";
              const details = (
                <>
                  <span className="min-w-0">
                    <span className="block truncate text-base font-semibold text-[var(--fg)]">{page.name}</span>
                    <span className="mt-1 block font-mono text-xs text-[var(--fg-dim)]">/{page.slug}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {accessLabel && <span className="hidden text-xs font-medium text-[var(--fg-soft)] sm:inline">{accessLabel}</span>}
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${stateClass}`}>{state}</span>
                  </span>
                </>
              );

              return (
                <li key={page.id}>
                  <article className="group flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-[var(--hover-overlay)] sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    {canConfigure ? (
                      <Link
                        href={`/organization/pages/${page.id}`}
                        className="flex min-w-0 flex-1 items-center justify-between gap-4 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--cyan)]"
                        aria-label={`${actionLabel}: ${page.name}`}
                      >
                        {details}
                      </Link>
                    ) : (
                      <div className="flex min-w-0 flex-1 items-center justify-between gap-4">{details}</div>
                    )}
                    <div className="flex shrink-0 items-center gap-4 text-sm font-semibold">
                      {page.publicVisible && page.setupCompletedAt && (
                        <a
                          href={publicPagePath(page)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[var(--fg-soft)] underline decoration-[var(--line-bright)] underline-offset-4 transition-colors hover:text-[var(--cyan)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--cyan)]"
                        >
                          Open live
                        </a>
                      )}
                      {page.isHub && canConfigure && (
                        <Link
                          href={`/organization/pages/new?hubParentId=${page.id}`}
                          aria-label="Create status page in this hub"
                          className="text-[var(--cyan)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--cyan)]"
                        >
                          Add page
                        </Link>
                      )}
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
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
