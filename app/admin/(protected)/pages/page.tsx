import Link from "next/link";
import { ArrowUpRight, Layers3, LayoutGrid, PanelsTopLeft, Pencil, Plus, Rocket, Trash2 } from "lucide-react";
import { requireSession } from "@/lib/require-session";
import { getScopedPages, sessionHasCapability } from "@/lib/admin-guard";
import { formatPageDate } from "@/lib/page-locale";
import { groupPageEvents, isOpenEvent } from "@/lib/page-events";
import { database } from "@/lib/postgres/client";
import { publicPagePath } from "@/lib/public-path";
import { PageGroup, type PageRow } from "@/components/admin/page-group";
import { bulkPageAction } from "./actions";
import { buttonVariants } from "@/components/ui/button";
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
  // Open incidents and pending maintenance, so each row can say whether its page needs attention.
  const statusPageIds = pages.filter((page) => !page.isHub).map((page) => page.id);
  const openEvents = sessionHasCapability(session, "incident.update") && statusPageIds.length
    ? await database.selectFrom("incidents")
      .select(["id", "pageId", "isMaintenance", "status", "maintenanceStatus", "scheduledStart", "createdAt"])
      .where("pageId", "in", statusPageIds)
      .where(isOpenEvent)
      .execute()
    : null;
  const eventsByPage = new Map(statusPageIds.map((id) => [id, groupPageEvents(openEvents?.filter((event) => event.pageId === id) ?? [])]));
  const activeCount = (page: ScopedPage) => eventsByPage.get(page.id)?.active.length ?? 0;

  // Pages needing attention first: live events, then unfinished setup. Sort is stable, so creation order holds within a rank.
  const urgency = (page: ScopedPage) => (activeCount(page) ? 0 : page.setupCompletedAt === null ? 1 : 2);
  const byUrgency = (a: ScopedPage, b: ScopedPage) => urgency(a) - urgency(b);
  const hubs = pages.filter((page) => page.isHub).sort(byUrgency);
  const hubIds = new Set(hubs.map((hub) => hub.id));
  const childrenOf = (hubId: string) => pages.filter((page) => page.hubParentId === hubId).sort(byUrgency);
  // A scoped member may see a child page without its hub; it then lists as standalone instead of vanishing.
  const standalone = pages.filter((page) => !page.isHub && !(page.hubParentId && hubIds.has(page.hubParentId))).sort(byUrgency);

  const toRow = (page: ScopedPage): PageRow => {
    const { state, tone } = pageState(page);
    const events = openEvents ? eventsByPage.get(page.id) : undefined;
    const next = events?.upcoming[0]?.scheduledStart;
    return {
      id: page.id,
      name: page.name,
      slug: page.slug,
      brand: page.brandColor || "var(--color-primary)",
      state,
      tone,
      type: page.type,
      event: events?.active.length ? { label: `${events.active.length} active event${events.active.length === 1 ? "" : "s"}`, tone: "warn", live: true }
        : next ? { label: `Maintenance ${formatPageDate(next, { language: page.language, timeZone: page.timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`, tone: "info", live: false }
        : null,
      visible: page.publicVisible,
      setupDone: page.setupCompletedAt !== null,
      liveHref: page.publicVisible && page.setupCompletedAt ? publicPagePath(page) : null,
      setupHref: page.setupCompletedAt ? null : `/organization/pages/${page.id}`,
    };
  };

  const hubHeader = (hub: ScopedPage, children: ScopedPage[]) => {
    const { state, tone } = pageState(hub);
    const active = children.reduce((sum, child) => sum + activeCount(child), 0);
    const drafts = children.filter((child) => child.setupCompletedAt === null).length;
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <IconTile icon={Layers3} hue="violet" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-semibold tracking-tight text-ink" title={hub.name}>{hub.name}</h2>
            <StatusBadge tone={tone}>{state}</StatusBadge>
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-dim">
            <span className="font-mono">/{hub.slug}</span>
            <span>Hub · {children.length} page{children.length === 1 ? "" : "s"}</span>
            {active > 0 && <span className="font-semibold text-warn-fg">{active} active event{active === 1 ? "" : "s"}</span>}
            {drafts > 0 && <span>{drafts} draft</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!hub.setupCompletedAt && canConfigure ? (
            <Link href={`/organization/pages/${hub.id}`} className="inline-flex items-center gap-1.5 rounded-chip text-sm font-semibold text-warn-fg outline-none hover:underline focus-visible:ring-4 focus-visible:ring-primary/25">
              <Rocket aria-hidden="true" size={16} />
              Continue setup
            </Link>
          ) : hub.publicVisible && hub.setupCompletedAt ? (
            <a href={publicPagePath(hub)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-chip text-sm font-semibold text-primary-ink outline-none hover:underline focus-visible:ring-4 focus-visible:ring-primary/25">
              View live page
              <ArrowUpRight aria-hidden="true" size={16} />
            </a>
          ) : null}
          {canConfigure && (
            <div className="flex shrink-0 items-center">
              <Link href={`/organization/pages/${hub.id}`} aria-label={`Edit ${hub.name}`} title="Edit page" className={iconAction()}><Pencil aria-hidden size={16} /></Link>
              <Link href={`/organization/pages/new?hubParentId=${hub.id}`} aria-label="Create status page in this hub" title="Add page to hub" className={iconAction()}><Plus aria-hidden size={16} /></Link>
              {children.length ? (
                <span
                  role="img"
                  tabIndex={0}
                  title={`Delete or remove its ${children.length} page${children.length === 1 ? "" : "s"} first`}
                  aria-label={`Can't delete ${hub.name}: delete or remove its ${children.length} page${children.length === 1 ? "" : "s"} first`}
                  className={iconAction("cursor-not-allowed opacity-40 hover:bg-transparent")}
                ><Trash2 aria-hidden size={16} /></span>
              ) : (
                <Link href={`/organization/pages/${hub.id}/settings#delete-page`} aria-label={`Delete ${hub.name}`} title="Delete page" className={iconAction("hover:bg-danger-bg hover:text-danger-fg [&_svg]:!text-ink-dim hover:[&_svg]:!text-danger-fg")}><Trash2 aria-hidden size={16} /></Link>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

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
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2" aria-label="Page status summary">
            <StatusBadge tone="ok">{publishedCount} published</StatusBadge>
            <StatusBadge tone="warn">{draftCount} draft</StatusBadge>
            {hiddenCount > 0 && <StatusBadge tone="neutral">{hiddenCount} hidden</StatusBadge>}
          </div>

          {hubs.map((hub) => {
            const children = childrenOf(hub.id);
            return (
              <PageGroup
                key={hub.id}
                label={`${hub.name} hub`}
                header={hubHeader(hub, children)}
                rows={children.map(toRow)}
                hubId={hub.id}
                action={bulkPageAction.bind(null, hub.id)}
                // Collapsed unless something inside needs attention, so many hubs stay scannable.
                defaultOpen={!children.length || children.some((child) => activeCount(child) > 0)}
                canConfigure={canConfigure}
                empty={canConfigure ? (
                  <Link href={`/organization/pages/new?hubParentId=${hub.id}`} className="flex items-center justify-center gap-2 rounded-card border border-dashed border-line-strong p-4 text-sm font-semibold text-ink-soft outline-none transition-colors hover:border-primary/50 hover:bg-primary-soft/50 hover:text-primary-ink focus-visible:ring-4 focus-visible:ring-primary/25">
                    <Plus aria-hidden size={16} />Add page to hub
                  </Link>
                ) : <p className="text-sm text-ink-dim">No pages in this hub yet.</p>}
              />
            );
          })}

          {standalone.length > 0 && (
            <PageGroup
              label="Standalone pages"
              header={
                <div className="flex items-center gap-3">
                  <IconTile icon={LayoutGrid} hue="indigo" />
                  <div>
                    <h2 className="text-base font-semibold tracking-tight text-ink">{hubs.length ? "Standalone pages" : "Status pages"}</h2>
                    <p className="text-xs text-ink-dim">{standalone.length} page{standalone.length === 1 ? "" : "s"}{hubs.length ? " not in any hub" : ""}</p>
                  </div>
                </div>
              }
              rows={standalone.map(toRow)}
              hubId={null}
              action={bulkPageAction.bind(null, null)}
              defaultOpen
              canConfigure={canConfigure}
            />
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
