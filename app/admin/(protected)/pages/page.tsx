import Link from "next/link";
import { ArrowUpRight, Globe, Layers3, LayoutGrid, Lock, PanelsTopLeft, Pencil, Plus, Rocket, Trash2, Users } from "lucide-react";
import { requireSession } from "@/lib/require-session";
import { getScopedPages, sessionHasCapability } from "@/lib/admin-guard";
import { formatPageDate } from "@/lib/page-locale";
import { groupPageEvents, isOpenEvent } from "@/lib/page-events";
import { database } from "@/lib/postgres/client";
import { publicPagePath } from "@/lib/public-path";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { IconTile } from "@/components/ui/icon-tile";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

type ScopedPage = Awaited<ReturnType<typeof getScopedPages>>[number];

const iconAction = (extra?: string) => buttonVariants({ variant: "ghost", size: "icon", className: cn("size-9", extra) });

function pageState(page: ScopedPage) {
  const state = page.setupCompletedAt === null ? "Draft" : page.publicVisible ? "Published" : "Hidden";
  return { state, tone: state === "Published" ? "ok" as const : state === "Hidden" ? "neutral" as const : "warn" as const };
}

export default async function PagesListPage() {
  const { session, org } = await requireSession();
  const pages = await getScopedPages(session, org.id);
  const canConfigure = sessionHasCapability(session, "page.configure");
  const publishedCount = pages.filter((page) => page.setupCompletedAt !== null && page.publicVisible).length;
  const draftCount = pages.filter((page) => page.setupCompletedAt === null).length;
  const hiddenCount = pages.length - publishedCount - draftCount;
  // Open incidents and pending maintenance, so each card can say whether its page needs attention.
  const statusPageIds = pages.filter((page) => !page.isHub).map((page) => page.id);
  const openEvents = sessionHasCapability(session, "incident.update") && statusPageIds.length
    ? await database.selectFrom("incidents")
      .select(["id", "pageId", "isMaintenance", "status", "maintenanceStatus", "scheduledStart", "createdAt"])
      .where("pageId", "in", statusPageIds)
      .where(isOpenEvent)
      .execute()
    : null;
  const eventsByPage = new Map(statusPageIds.map((id) => [id, groupPageEvents(openEvents?.filter((event) => event.pageId === id) ?? [])]));

  // Pages needing attention first: live events, then unfinished setup. Sort is stable, so creation order holds within a rank.
  const urgency = (page: ScopedPage) => (eventsByPage.get(page.id)?.active.length ? 0 : page.setupCompletedAt === null ? 1 : 2);
  const byUrgency = (a: ScopedPage, b: ScopedPage) => urgency(a) - urgency(b);
  const hubs = pages.filter((page) => page.isHub).sort(byUrgency);
  const hubIds = new Set(hubs.map((hub) => hub.id));
  const childrenOf = (hubId: string) => pages.filter((page) => page.hubParentId === hubId).sort(byUrgency);
  // A scoped member may see a child page without its hub; it then lists as standalone instead of vanishing.
  const standalone = pages.filter((page) => !page.isHub && !(page.hubParentId && hubIds.has(page.hubParentId))).sort(byUrgency);

  const primaryAction = (page: ScopedPage) => (
    !page.setupCompletedAt && canConfigure ? (
      <Link href={`/organization/pages/${page.id}`} className="inline-flex items-center gap-1.5 rounded-chip text-sm font-semibold text-warn-fg outline-none hover:underline focus-visible:ring-4 focus-visible:ring-primary/25">
        <Rocket aria-hidden="true" size={16} />
        Continue setup
      </Link>
    ) : page.publicVisible && page.setupCompletedAt ? (
      <a href={publicPagePath(page)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-chip text-sm font-semibold text-primary-ink outline-none hover:underline focus-visible:ring-4 focus-visible:ring-primary/25">
        View live page
        <ArrowUpRight aria-hidden="true" size={16} />
      </a>
    ) : <span className="text-xs text-ink-dim">Not visible to visitors</span>
  );

  const pageActions = (page: ScopedPage) => canConfigure && (
    <div className="flex shrink-0 items-center">
      <Link href={`/organization/pages/${page.id}`} aria-label={`Edit ${page.name}`} title="Edit page" className={iconAction()}><Pencil aria-hidden size={16} /></Link>
      {page.isHub && <Link href={`/organization/pages/new?hubParentId=${page.id}`} aria-label="Create status page in this hub" title="Add page to hub" className={iconAction()}><Plus aria-hidden size={16} /></Link>}
      <Link href={`/organization/pages/${page.id}/settings#delete-page`} aria-label={`Delete ${page.name}`} title="Delete page" className={iconAction("hover:bg-danger-bg hover:text-danger-fg [&_svg]:!text-ink-dim hover:[&_svg]:!text-danger-fg")}><Trash2 aria-hidden size={16} /></Link>
    </div>
  );

  const pageCard = (page: ScopedPage) => {
    const { state, tone } = pageState(page);
    const AccessIcon = page.type === "PUBLIC" ? Globe : page.type === "PRIVATE" ? Lock : Users;
    const accessLabel = page.type === "PUBLIC" ? "Public" : page.type === "PRIVATE" ? "Private" : "Audience";
    const events = openEvents ? eventsByPage.get(page.id) : undefined;
    const next = events?.upcoming[0]?.scheduledStart;

    return (
      <Card key={page.id} className="group flex flex-col overflow-hidden transition-[box-shadow,transform,border-color] duration-200 ease-soft hover:-translate-y-0.5 hover:border-line-strong hover:shadow-raised">
        <div aria-hidden="true" className="h-1" style={{ background: page.brandColor || "var(--color-primary)" }} />
        <div className="flex flex-1 flex-col p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold tracking-tight text-ink" title={page.name}>{page.name}</h3>
              <p className="mt-0.5 truncate font-mono text-xs text-ink-dim" title={`/${page.slug}`}>/{page.slug}</p>
            </div>
            <StatusBadge tone={tone}>{state}</StatusBadge>
          </div>

          <div className="mb-4 mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-1.5 font-medium text-ink-soft"><AccessIcon aria-hidden size={14} className="shrink-0 text-ink-dim" />{accessLabel}</span>
            {events && (events.active.length > 0 || next) && (
              <Link href={`/organization/events?pageId=${page.id}`} className="inline-flex rounded-chip outline-none focus-visible:ring-4 focus-visible:ring-primary/25">
                {events.active.length ? <StatusBadge tone="warn" live>{events.active.length} active event{events.active.length === 1 ? "" : "s"}</StatusBadge>
                  : <StatusBadge tone="info">Maintenance {formatPageDate(next!, { language: page.language, timeZone: page.timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</StatusBadge>}
              </Link>
            )}
          </div>

          <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-3">
            <div className="min-w-0">{primaryAction(page)}</div>
            {pageActions(page)}
          </div>
        </div>
      </Card>
    );
  };

  const grid = "grid gap-4 sm:grid-cols-2 xl:grid-cols-3";

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
        <div className="space-y-8">
          <div className="flex flex-wrap items-center gap-2" aria-label="Page status summary">
            <StatusBadge tone="ok">{publishedCount} published</StatusBadge>
            <StatusBadge tone="warn">{draftCount} draft</StatusBadge>
            {hiddenCount > 0 && <StatusBadge tone="neutral">{hiddenCount} hidden</StatusBadge>}
          </div>

          {hubs.map((hub) => {
            const { state, tone } = pageState(hub);
            const children = childrenOf(hub.id);
            return (
              <section key={hub.id} aria-label={`${hub.name} hub`} className="space-y-4">
                <Card className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4">
                  <IconTile icon={Layers3} hue="violet" size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-lg font-semibold tracking-tight text-ink" title={hub.name}>{hub.name}</h2>
                      <StatusBadge tone={tone}>{state}</StatusBadge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-ink-dim">
                      <span className="font-mono">/{hub.slug}</span> · Hub · {children.length} page{children.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {primaryAction(hub)}
                    {pageActions(hub)}
                  </div>
                </Card>

                <div className={cn(grid, "ml-3 border-l-2 border-line pl-4 sm:ml-6 sm:pl-6")}>
                  {children.map(pageCard)}
                  {!children.length && (canConfigure ? (
                    <Link href={`/organization/pages/new?hubParentId=${hub.id}`} className="flex min-h-36 flex-col items-center justify-center rounded-card border border-dashed border-line-strong bg-surface/50 p-6 text-center outline-none transition-[border-color,background-color] duration-200 hover:border-primary/50 hover:bg-primary-soft/50 focus-visible:ring-4 focus-visible:ring-primary/25">
                      <IconTile icon={Plus} hue="indigo" />
                      <span className="mt-3 text-sm font-semibold text-ink">Add page to hub</span>
                      <span className="mt-1 max-w-[15rem] text-xs leading-5 text-ink-soft">Status pages added here appear on {hub.name}.</span>
                    </Link>
                  ) : <p className="py-4 text-sm text-ink-dim">No pages in this hub yet.</p>)}
                </div>
              </section>
            );
          })}

          {standalone.length > 0 && (
            <section aria-label="Standalone pages" className="space-y-4">
              {hubs.length > 0 && <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-soft"><LayoutGrid aria-hidden size={16} className="text-ink-dim" />Standalone pages</h2>}
              <div className={grid}>{standalone.map(pageCard)}</div>
            </section>
          )}
        </div>
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
