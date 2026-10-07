import { Siren } from "lucide-react";
import { EventsList, parseEventKind, type EventKind } from "@/components/admin/EventsList";
import { NoPagesState } from "@/components/admin/operate-ui";
import { PageSelect } from "@/components/admin/PageSelect";
import { PageHeader } from "@/components/ui/page-header";
import { getScopedPages, requireCapability, sessionHasCapability } from "@/lib/admin-guard";
import { requireSession } from "@/lib/require-session";

/** The org-wide inbox for incidents and maintenance; a page filter narrows it to one page. */
export default async function EventsPage({ searchParams }: { searchParams: Promise<{ pageId?: string; show?: string }> }) {
  const { session, org } = await requireSession();
  await requireCapability("incident.update");
  // Hubs hold no events of their own.
  const pages = await getScopedPages(session, org.id, { isHub: false });
  const { pageId, show } = await searchParams;
  const filteredPage = pages.find((p) => p.id === pageId);
  const kind = parseEventKind(show);
  const kindHref = (next: EventKind) => {
    const params = new URLSearchParams();
    if (filteredPage) params.set("pageId", filteredPage.id);
    if (next !== "all") params.set("show", next);
    const query = params.toString();
    return query ? `/organization/events?${query}` : "/organization/events";
  };
  const pageSelectBase = kind === "all" ? "/organization/events" : `/organization/events?show=${kind}`;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Events"
        icon={Siren}
        hue="amber"
        description="Incidents and scheduled maintenance across your status pages: what is happening now, what is coming up, and what already happened."
        actions={pages.length > 1 && (
          <div className="w-56">
            <PageSelect pages={pages.map((p) => ({ id: p.id, name: p.name }))} basePath={pageSelectBase} selected={filteredPage?.id} allLabel="All pages" />
          </div>
        )}
      />

      {pages.length ? (
        <EventsList
          pageIds={filteredPage ? [filteredPage.id] : pages.map((p) => p.id)}
          pageNameById={filteredPage ? undefined : Object.fromEntries(pages.map((p) => [p.id, p.name]))}
          kind={kind}
          kindHref={kindHref}
          canManage={sessionHasCapability(session, "incident.manage")}
          newEventPageId={filteredPage?.id}
          locale={filteredPage ? { language: filteredPage.language, timeZone: filteredPage.timezone } : undefined}
        />
      ) : (
        <NoPagesState description="Incidents and maintenance are published to a status page. Create one first." canCreate={sessionHasCapability(session, "page.configure")} />
      )}
    </div>
  );
}
