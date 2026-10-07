import Link from "next/link";
import { ArrowUpRight, Globe, Layers3, LayoutGrid, Lock, PanelsTopLeft, Pencil, Plus, Rocket, Trash2, Users } from "lucide-react";
import { requireSession } from "@/lib/require-session";
import { getScopedPages, sessionHasCapability } from "@/lib/admin-guard";
import { publicPagePath } from "@/lib/public-path";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { IconTile } from "@/components/ui/icon-tile";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

const iconAction = (extra?: string) => buttonVariants({ variant: "ghost", size: "icon", className: cn("size-9", extra) });

export default async function PagesListPage() {
  const { session, org } = await requireSession();
  const pages = await getScopedPages(session, org.id);
  const canConfigure = sessionHasCapability(session, "page.configure");
  const publishedCount = pages.filter((page) => page.setupCompletedAt !== null && page.publicVisible).length;
  const draftCount = pages.filter((page) => page.setupCompletedAt === null).length;
  const hiddenCount = pages.length - publishedCount - draftCount;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Pages"
        icon={PanelsTopLeft}
        hue="violet"
        description={pages.length ? "Choose a page to manage its status experience." : "Create a page to begin sharing service status."}
        actions={canConfigure && pages.length > 0 && (
          <Link href="/organization/pages/new" className={buttonVariants()}>
            <Plus aria-hidden="true" size={16} />
            Create page
          </Link>
        )}
      />

      {pages.length ? (
        <section aria-label="Status pages" className="space-y-5">
          <div className="flex flex-wrap items-center gap-2" aria-label="Page status summary">
            <StatusBadge tone="ok">{publishedCount} published</StatusBadge>
            <StatusBadge tone="warn">{draftCount} draft</StatusBadge>
            {hiddenCount > 0 && <StatusBadge tone="neutral">{hiddenCount} hidden</StatusBadge>}
          </div>

          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {pages.map((page) => {
              const state = page.setupCompletedAt === null ? "Draft" : page.publicVisible ? "Published" : "Hidden";
              const tone = state === "Published" ? "ok" : state === "Hidden" ? "neutral" : "warn";
              const AccessIcon = page.type === "PUBLIC" ? Globe : page.type === "PRIVATE" ? Lock : Users;
              const accessLabel = page.isHub ? "Hub" : page.type === "PUBLIC" ? "Public" : page.type === "PRIVATE" ? "Private" : "Audience";
              const PageIcon = page.isHub ? Layers3 : LayoutGrid;
              const brand = page.brandColor || "var(--color-primary)";
              const live = Boolean(page.publicVisible && page.setupCompletedAt);

              return (
                <Card key={page.id} className="group flex flex-col overflow-hidden transition-[box-shadow,transform,border-color] duration-200 ease-soft hover:-translate-y-0.5 hover:border-line-strong hover:shadow-raised">
                  <div
                    aria-hidden="true"
                    className="relative h-20"
                    style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${brand} 32%, white), color-mix(in srgb, ${brand} 8%, white))` }}
                  />
                  <div className="flex flex-1 flex-col px-5 pb-5">
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <IconTile icon={PageIcon} hue="violet" size="lg" />
                      <StatusBadge tone={tone}>{state}</StatusBadge>
                    </div>

                    <h2 className="mt-3 truncate text-lg font-semibold tracking-tight text-ink" title={page.name}>{page.name}</h2>
                    <p className="mt-0.5 truncate font-mono text-xs text-ink-dim" title={`/${page.slug}`}>/{page.slug}</p>

                    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div className="min-w-0">
                        <dt className="text-xs text-ink-dim">Surface</dt>
                        <dd className="mt-0.5 flex items-center gap-1.5 truncate font-medium text-ink"><AccessIcon aria-hidden size={14} className="shrink-0 text-ink-dim" />{accessLabel}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-xs text-ink-dim">Visibility</dt>
                        <dd className="mt-0.5 truncate font-medium text-ink">{page.publicVisible ? "Visible to visitors" : "Hidden from visitors"}</dd>
                      </div>
                    </dl>

                    <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
                      <div className="min-w-0">
                        {!page.setupCompletedAt && canConfigure ? (
                          <Link href={`/organization/pages/${page.id}`} className="inline-flex items-center gap-1.5 rounded-chip text-sm font-semibold text-warn-fg outline-none hover:underline focus-visible:ring-4 focus-visible:ring-primary/25">
                            <Rocket aria-hidden="true" size={16} />
                            Continue setup
                          </Link>
                        ) : live ? (
                          <a href={publicPagePath(page)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-chip text-sm font-semibold text-primary-ink outline-none hover:underline focus-visible:ring-4 focus-visible:ring-primary/25">
                            View live page
                            <ArrowUpRight aria-hidden="true" size={16} />
                          </a>
                        ) : <span className="text-xs text-ink-dim">Not visible to visitors</span>}
                      </div>
                      <div className="flex shrink-0 items-center">
                        {canConfigure && <>
                          <Link href={`/organization/pages/${page.id}`} aria-label={`Edit ${page.name}`} title="Edit page" className={iconAction()}><Pencil aria-hidden size={16} /></Link>
                          {page.isHub && <Link href={`/organization/pages/new?hubParentId=${page.id}`} aria-label="Create status page in this hub" title="Add page to hub" className={iconAction()}><Plus aria-hidden size={16} /></Link>}
                          <Link href={`/organization/pages/${page.id}/settings#delete-page`} aria-label={`Delete ${page.name}`} title="Delete page" className={iconAction("hover:bg-danger-bg hover:text-danger-fg [&_svg]:!text-ink-dim hover:[&_svg]:!text-danger-fg")}><Trash2 aria-hidden size={16} /></Link>
                        </>}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}

            {canConfigure && (
              <Link href="/organization/pages/new" className="group flex min-h-72 flex-col items-center justify-center rounded-card border border-dashed border-line-strong bg-surface/50 p-6 text-center outline-none transition-[border-color,background-color] duration-200 hover:border-primary/50 hover:bg-primary-soft/50 focus-visible:ring-4 focus-visible:ring-primary/25">
                <IconTile icon={Plus} hue="indigo" size="lg" />
                <span className="mt-4 text-sm font-semibold text-ink">Create another page</span>
                <span className="mt-1 max-w-[15rem] text-xs leading-5 text-ink-soft">Add a new public status surface to this workspace.</span>
              </Link>
            )}
          </div>
        </section>
      ) : (
        <EmptyState
          icon={LayoutGrid}
          hue="violet"
          title="No pages yet"
          description="Create your first status page, add a service, then publish when you are ready."
          action={canConfigure ? <Link href="/organization/pages/new" className={buttonVariants()}><Plus aria-hidden size={16} />Create page</Link> : undefined}
          className="py-20"
        />
      )}
    </div>
  );
}
