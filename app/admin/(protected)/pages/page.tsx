import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  EyeOff,
  ExternalLink,
  FilePenLine,
  Layers3,
  LayoutGrid,
  Pencil,
  Plus,
  Rocket,
  Trash2,
} from "lucide-react";
import { requireSession } from "@/lib/require-session";
import { getScopedPages, sessionHasCapability } from "@/lib/admin-guard";
import { publicPagePath } from "@/lib/public-path";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export default async function PagesListPage() {
  const { session, org } = await requireSession();
  const pages = await getScopedPages(session, org.id);
  const canConfigure = sessionHasCapability(session, "page.configure");
  const publishedCount = pages.filter((page) => page.setupCompletedAt !== null && page.publicVisible).length;
  const draftCount = pages.filter((page) => page.setupCompletedAt === null).length;
  const hiddenCount = pages.length - publishedCount - draftCount;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="flex flex-col gap-6 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--cyan)]">
            <LayoutGrid aria-hidden="true" className="h-4 w-4" strokeWidth={2.25} />
            Status surfaces
          </div>
          <h1 className="text-4xl font-semibold tracking-[-0.035em] text-[var(--fg)] sm:text-5xl">Pages</h1>
          <p className="mt-3 max-w-xl text-base leading-7 text-[var(--fg-soft)]">
            {pages.length ? "Choose a page to manage its status experience." : "Create a page to begin sharing service status."}
          </p>
        </div>
        {canConfigure && (
          <Link
            href="/organization/pages/new"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--cyan)] px-4 text-sm font-semibold text-[var(--on-cyan)] shadow-[0_8px_20px_rgba(26,115,232,0.18)] transition-[filter,transform] duration-200 hover:-translate-y-0.5 hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
          >
            <Plus aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
            Create page
          </Link>
        )}
      </header>

      {pages.length ? (
        <section aria-label="Status pages">
          <div className="mb-4 flex flex-col gap-4 border-y border-[var(--line)] py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--cyan-soft)] text-sm font-bold text-[var(--cyan)]">
                {pages.length}
              </span>
              <div>
                <p className="text-sm font-semibold text-[var(--fg)]">{pages.length === 1 ? "1 page" : `${pages.length} pages`}</p>
                <p className="text-xs text-[var(--fg-dim)]">Manage your public status surfaces</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-[var(--fg-soft)]" aria-label="Page status summary">
              <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-[var(--green)]" />{publishedCount} published</span>
              <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-[var(--amber)]" />{draftCount} draft</span>
              {hiddenCount > 0 && <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-[var(--fg-dim)]" />{hiddenCount} hidden</span>}
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {pages.map((page) => {
              const state = page.setupCompletedAt === null ? "Draft" : page.publicVisible ? "Published" : "Hidden";
              const accessLabel = page.isHub ? "Hub" : page.type === "PUBLIC" ? "Public" : page.type === "PRIVATE" ? "Private" : "Audience";
              const stateClass = state === "Published"
                ? "border-[var(--green)]/25 bg-[var(--green-soft)] text-[var(--green)]"
                : state === "Hidden"
                  ? "border-[var(--line-bright)] bg-[var(--surface-raised)] text-[var(--fg-soft)]"
                  : "border-[var(--amber)]/30 bg-[var(--amber-soft)] text-[var(--amber)]";
              const accentClass = state === "Published" ? "bg-[var(--green)]" : state === "Hidden" ? "bg-[var(--fg-dim)]" : "bg-[var(--amber)]";
              const StateIcon = state === "Published" ? CheckCircle2 : state === "Hidden" ? EyeOff : FilePenLine;
              const PageIcon = page.isHub ? Layers3 : LayoutGrid;

              return (
                <Card key={page.id} className="group relative flex min-h-[19rem] flex-col overflow-hidden !rounded-xl border-[var(--line)] bg-[var(--surface)] shadow-[0_10px_30px_rgba(15,23,42,0.05)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-1 hover:border-[var(--cyan)]/55 hover:shadow-[0_16px_34px_rgba(15,23,42,0.1)]">
                  <div aria-hidden="true" className={`h-1 w-full ${accentClass}`} />
                  <div className="flex flex-1 flex-col p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--cyan-soft)] text-[var(--cyan)] transition-transform duration-200 group-hover:scale-105">
                          <PageIcon aria-hidden="true" className="h-5 w-5" strokeWidth={1.9} />
                        </span>
                        <div className="min-w-0 pt-0.5">
                          <p className="text-[0.7rem] font-bold uppercase tracking-[0.15em] text-[var(--fg-dim)]">{page.isHub ? "Hub" : "Status page"}</p>
                          <h2 className="mt-1 truncate text-lg font-semibold tracking-tight text-[var(--fg)]" title={page.name}>{page.name}</h2>
                        </div>
                      </div>
                      <Badge className={`shrink-0 gap-1.5 border ${stateClass}`}>
                        <StateIcon aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.25} />
                        {state}
                      </Badge>
                    </div>

                    <p className="mt-5 truncate font-mono text-xs text-[var(--fg-dim)]" title={`/${page.slug}`}>/{page.slug}</p>

                    <div className="mt-5 grid grid-cols-2 gap-3 border-y border-[var(--line)] py-4">
                      <div className="min-w-0">
                        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[var(--fg-dim)]">Surface</p>
                        <p className="mt-1 truncate text-sm font-medium text-[var(--fg)]">{accessLabel}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[var(--fg-dim)]">Visibility</p>
                        <p className="mt-1 truncate text-sm font-medium text-[var(--fg)]">{page.publicVisible ? "Visible to visitors" : "Hidden from visitors"}</p>
                      </div>
                    </div>

                    <div className="mt-auto flex items-center justify-between gap-3 pt-5">
                      <div className="min-w-0">
                        {!page.setupCompletedAt && canConfigure ? (
                          <Link href={`/organization/pages/${page.id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--amber)] underline-offset-4 transition-colors hover:text-[var(--fg)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]">
                            <Rocket aria-hidden="true" className="h-4 w-4" />
                            Continue setup
                          </Link>
                        ) : page.publicVisible && page.setupCompletedAt ? (
                          <a href={publicPagePath(page)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--cyan)] underline-offset-4 transition-colors hover:text-[var(--fg)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]">
                            View live page
                            <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
                          </a>
                        ) : <span className="text-xs text-[var(--fg-dim)]">Not visible to visitors</span>}
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {page.publicVisible && page.setupCompletedAt && <a href={publicPagePath(page)} target="_blank" rel="noreferrer" aria-label={`Open ${page.name} live`} title="Open live" className="page-management-action-icon rounded-lg border border-[var(--line)] text-[var(--fg-soft)] transition-colors hover:border-[var(--cyan)] hover:bg-[var(--cyan-soft)] hover:text-[var(--cyan)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"><ExternalLink aria-hidden="true" className="h-4 w-4" /></a>}
                        {canConfigure && <>
                          <Link href={`/organization/pages/${page.id}`} aria-label={`Edit ${page.name}`} title="Edit page" className="page-management-action-icon rounded-lg border border-[var(--line)] text-[var(--fg-soft)] transition-colors hover:border-[var(--cyan)] hover:bg-[var(--cyan-soft)] hover:text-[var(--cyan)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"><Pencil aria-hidden="true" className="h-4 w-4" /></Link>
                          <Link href={`/organization/pages/${page.id}/settings#delete-page`} aria-label={`Delete ${page.name}`} title="Delete page" className="page-management-action-icon rounded-lg border border-[var(--line)] text-[var(--fg-soft)] transition-colors hover:border-[var(--red)] hover:bg-[var(--red-soft)] hover:text-[var(--red)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"><Trash2 aria-hidden="true" className="h-4 w-4" /></Link>
                          {page.isHub && <Link href={`/organization/pages/new?hubParentId=${page.id}`} aria-label="Create status page in this hub" title="Add page to hub" className="page-management-action-icon rounded-lg border border-[var(--line)] text-[var(--fg-soft)] transition-colors hover:border-[var(--cyan)] hover:bg-[var(--cyan-soft)] hover:text-[var(--cyan)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"><Plus aria-hidden="true" className="h-4 w-4" /></Link>}
                        </>}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}

            {canConfigure && <Link href="/organization/pages/new" className="group flex min-h-[19rem] flex-col items-center justify-center rounded-xl border border-dashed border-[var(--line-bright)] bg-[var(--surface)]/45 p-6 text-center transition-[border-color,background-color,transform] duration-200 hover:-translate-y-1 hover:border-[var(--cyan)] hover:bg-[var(--cyan-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--line-bright)] bg-[var(--surface)] text-[var(--cyan)] transition-transform duration-200 group-hover:scale-105"><Plus aria-hidden="true" className="h-5 w-5" strokeWidth={2.25} /></span>
              <span className="mt-4 text-sm font-semibold text-[var(--fg)]">Create another page</span>
              <span className="mt-1 max-w-[15rem] text-xs leading-5 text-[var(--fg-soft)]">Add a new public status surface to this workspace.</span>
            </Link>}
          </div>
        </section>
      ) : (
        <Card className="border-dashed !rounded-xl px-6 py-16 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--cyan-soft)] text-[var(--cyan)]">
            <LayoutGrid aria-hidden="true" className="h-5 w-5" />
          </span>
          <h2 className="mt-5 text-lg font-semibold text-[var(--fg)]">No pages yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--fg-soft)]">Create your first status page, add a service, then publish when you are ready.</p>
          {canConfigure && <Link href="/organization/pages/new" className="mt-6 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[var(--cyan)] px-4 text-sm font-semibold text-[var(--on-cyan)] transition-[filter,transform] duration-200 hover:-translate-y-0.5 hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"><Plus aria-hidden="true" className="h-4 w-4" />Create your first page</Link>}
        </Card>
      )}
    </div>
  );
}
