import Link from "next/link";
import { Settings, Siren } from "lucide-react";
import { EventsList } from "@/components/admin/EventsList";
import { eventsHref, parseEventKind } from "@/lib/page-events";
import { NoPagesState } from "@/components/admin/operate-ui";
import { PageSelect } from "@/components/admin/PageSelect";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { getScopedPages, requireCapability, sessionHasCapability } from "@/lib/admin-guard";
import { requireSession } from "@/lib/require-session";

/** The one home for incidents and maintenance; a page filter narrows it to one page. */
export default async function EventsPage({ searchParams }: { searchParams: Promise<{ pageId?: string; show?: string; history?: string }> }) {
  const { session, org } = await requireSession();
  await requireCapability("incident.update");
  // Hubs hold no events of their own.
  const pages = await getScopedPages(session, org.id, { isHub: false });
  const { pageId, show, history } = await searchParams;
  const filteredPage = pages.find((p) => p.id === pageId);
  const kind = parseEventKind(show);
  const historyPage = Math.max(1, Number.parseInt(history ?? "", 10) || 1);
  const canConfigure = sessionHasCapability(session, "page.configure");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Events"
        icon={Siren}
        hue="amber"
        description="Incidents and scheduled maintenance across your status pages: what is happening now, what is coming up, and what already happened."
        actions={(pages.length > 1 || (filteredPage && canConfigure)) && (
          <div className="flex flex-wrap items-center gap-2">
            {pages.length > 1 && (
              <div className="w-56">
                <PageSelect pages={pages.map((p) => ({ id: p.id, name: p.name }))} basePath={eventsHref({ kind })} selected={filteredPage?.id} allLabel="All pages" />
              </div>
            )}
            {filteredPage && canConfigure && (
              <Link href={`/organization/pages/${filteredPage.id}`} className={buttonVariants({ variant: "secondary" })}>
                <Settings aria-hidden size={16} />
                Manage page
              </Link>
            )}
          </div>
        )}
      />

      {pages.length ? (
        <EventsList
          pageIds={filteredPage ? [filteredPage.id] : pages.map((p) => p.id)}
          filteredPageId={filteredPage?.id}
          pageNameById={filteredPage ? undefined : Object.fromEntries(pages.map((p) => [p.id, p.name]))}
          kind={kind}
          historyPage={historyPage}
          canManage={sessionHasCapability(session, "incident.manage")}
          locale={filteredPage ? { language: filteredPage.language, timeZone: filteredPage.timezone } : undefined}
        />
      ) : (
        <NoPagesState description="Incidents and maintenance are published to a status page. Create one first." canCreate={canConfigure} />
      )}
    </div>
  );
}
