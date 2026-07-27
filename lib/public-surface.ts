import type { NextRequest } from "next/server";
import type { PageDoc } from "@/lib/db";
import { collections } from "@/lib/db";
import { authorizePublicSurface } from "@/lib/feed-access";
import { getComponentsForPage, getIncidentsForPage } from "@/lib/public-data";
import {
  overallBanner,
  type ComponentStatus,
} from "@/lib/status";
import { activeIncidentIndicator } from "@/lib/public-surface-policy";
import { publicPageFilter } from "@/lib/page-lifecycle";

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
  hub: PageDoc
) {
  const childPages = await collections
    .pages()
    .find(publicPageFilter({ hubParentId: hub._id, orgId: hub.orgId, isHub: false }))
    .sort({ createdAt: 1 })
    .toArray();

  return (
    await Promise.all(
      childPages.map(async (page) => {
        const access = await authorizePublicSurface(request, page);
        return access.ok ? { page, access } : null;
      })
    )
  ).filter((child): child is NonNullable<typeof child> => child !== null);
}
