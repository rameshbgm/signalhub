import { notFound } from "next/navigation";
import { EventsList, parseEventKind } from "@/components/admin/EventsList";
import { assertPageInOrg, requireCapability, sessionHasCapability } from "@/lib/admin-guard";
import { database } from "@/lib/postgres/client";

export default async function PageEvents({ params, searchParams }: { params: Promise<{ pageId: string }>; searchParams: Promise<{ show?: string }> }) {
  const { pageId } = await params;
  const { show } = await searchParams;
  const session = await requireCapability("incident.update", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const page = await database.selectFrom("pages").select(["id", "isHub", "language", "timezone"])
    .where("id", "=", pageId).where("orgId", "=", session.orgId).where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!page || page.isHub) notFound();
  const base = `/organization/pages/${pageId}/events`;

  return (
    <EventsList
      pageIds={[pageId]}
      kind={parseEventKind(show)}
      kindHref={(kind) => (kind === "all" ? base : `${base}?show=${kind}`)}
      canManage={sessionHasCapability(session, "incident.manage")}
      newEventPageId={pageId}
      locale={{ language: page.language, timeZone: page.timezone }}
    />
  );
}
