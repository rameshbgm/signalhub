import { sql } from "kysely";
import { database, type DatabaseExecutor } from "@/lib/postgres/client";

export async function getPublicPageBySlug(
  slug: string,
  options: { isHub?: boolean } = {},
  executor: DatabaseExecutor = database
) {
  let query = executor
    .selectFrom("pages")
    .selectAll()
    .where("slug", "=", slug)
    .where("deletedAt", "is", null)
    .where("publicVisible", "=", true);
  if (options.isHub !== undefined) query = query.where("isHub", "=", options.isHub);
  return query.executeTakeFirst();
}

export async function getPublicPageById(id: string, executor: DatabaseExecutor = database) {
  return executor
    .selectFrom("pages")
    .selectAll()
    .where("id", "=", id)
    .where("deletedAt", "is", null)
    .where("publicVisible", "=", true)
    .executeTakeFirst();
}

export async function getActivePageById(
  id: string,
  orgId?: string,
  executor: DatabaseExecutor = database
) {
  let query = executor
    .selectFrom("pages")
    .selectAll()
    .where("id", "=", id)
    .where("deletedAt", "is", null);
  if (orgId) query = query.where("orgId", "=", orgId);
  return query.executeTakeFirst();
}

export async function getPublicHubChildren(
  hubId: string,
  orgId: string,
  executor: DatabaseExecutor = database
) {
  return executor
    .selectFrom("pages")
    .selectAll()
    .where("hubParentId", "=", hubId)
    .where("orgId", "=", orgId)
    .where("isHub", "=", false)
    .where("deletedAt", "is", null)
    .where("publicVisible", "=", true)
    .orderBy("createdAt", "asc")
    .execute();
}

export async function getActivePageAnnouncements(
  pageId: string,
  surface: "STATUS" | "HISTORY" | "INCIDENT" | "ACCESS" | "HUB",
  now = new Date(),
  executor: DatabaseExecutor = database
) {
  return executor
    .selectFrom("pageAnnouncements")
    .selectAll()
    .where("pageId", "=", pageId)
    .where("startsAt", "<=", now)
    .where((expression) => expression.or([
      expression("endsAt", "is", null),
      expression("endsAt", ">", now),
    ]))
    .where(sql<boolean>`${surface} = any(surfaces)`)
    .orderBy("priority", "desc")
    .orderBy("startsAt", "desc")
    .execute();
}
