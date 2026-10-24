import type { NextRequest } from "next/server";
import type { PageRow } from "@/lib/postgres/schema";
import { database } from "@/lib/postgres/client";
import { authorizePublicSurface } from "@/lib/feed-access";
import { getComponentsForPage, getIncidentsForPage } from "@/lib/public-data";
import {
  overallBanner,
  type ComponentStatus,
} from "@/lib/status";
import { activeIncidentIndicator } from "@/lib/public-surface-policy";

export async function getPublicSurfaceSummary(
  pageId: string,
  visibleComponentIds: string[] | null
) {
  const [{ allVisible }, incidents] = await Promise.all([
    getComponentsForPage(pageId, visibleComponentIds),
    getIncidentsForPage(pageId, visibleComponentIds),
  ]);
  const statuses = [
    ...allVisible.map((component) => component.status as ComponentStatus),
    ...incidents
      .map(activeIncidentIndicator)
      .filter((status): status is ComponentStatus => status !== null),
  ];

  return {
    banner: statuses.length ? overallBanner(statuses) : null,
    componentCount: allVisible.length,
    incidents,
  };
}

/**
 * Authorize every child independently. A hub password, audience cookie, or
 * feed token is deliberately not inherited by a child page.
 */
export async function getAuthorizedHubChildren(
  request: NextRequest,
  hub: PageRow
) {
  const childPages = await database
    .selectFrom("pages")
    .selectAll()
    .where("hubParentId", "=", hub.id)
    .where("orgId", "=", hub.orgId)
    .where("isHub", "=", false)
    .where("deletedAt", "is", null)
    .where("publicVisible", "=", true)
    .orderBy("createdAt", "asc")
    .execute();

  return (
    await Promise.all(
      childPages.map(async (page) => {
        const access = await authorizePublicSurface(request, page);
        return access.ok ? { page, access } : null;
      })
    )
  ).filter((child): child is NonNullable<typeof child> => child !== null);
}
