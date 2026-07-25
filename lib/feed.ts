import type { NextRequest } from "next/server";
import type { PageDoc } from "@/lib/db";
import { getIncidentsForPage } from "@/lib/public-data";
import { getAuthorizedHubChildren } from "@/lib/public-surface";

export function escapeXml(value: string) {
  return value.replace(
    /[<>&'"]/g,
    (character) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[
        character
      ]!
  );
}

export function feedCacheControl(request: NextRequest, page: PageDoc) {
  const hasCredential =
    request.headers.has("authorization") ||
    request.nextUrl.searchParams.has("token") ||
    request.nextUrl.searchParams.has("feed_token");
  return page.type === "PUBLIC" && !hasCredential
    ? "public, max-age=60"
    : "private, no-store";
}

export async function getFeedIncidents(
  request: NextRequest,
  page: PageDoc,
  visibleComponentIds: string[] | null
) {
  const sources = page.isHub
    ? await getAuthorizedHubChildren(request, page)
    : [{ page, access: { visibleComponentIds } }];
  const incidents = (
    await Promise.all(
      sources.map(async (source) => {
        const sourceIncidents = await getIncidentsForPage(
          source.page._id.toHexString(),
          source.access.visibleComponentIds
        );
        return sourceIncidents.map((incident) => ({
          ...incident,
          name: page.isHub ? `[${source.page.name}] ${incident.name}` : incident.name,
          sourcePage: source.page,
          latestUpdate: incident.updates.at(-1) ?? null,
        }));
      })
    )
  ).flat();

  return incidents
    .sort(
      (left, right) =>
        new Date(right.latestUpdate?.createdAt ?? right.createdAt).getTime() -
        new Date(left.latestUpdate?.createdAt ?? left.createdAt).getTime()
    )
    .slice(0, 50);
}
