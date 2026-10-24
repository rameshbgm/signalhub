import { sql } from "kysely";
import { database } from "@/lib/postgres/client";

export async function isPageOrganizationActive(
  orgId: string | { toHexString(): string }
) {
  const normalizedOrgId = typeof orgId === "string" ? orgId : orgId.toHexString();
  const organization = await database
    .selectFrom("organizations")
    .select("id")
    .where(sql<boolean>`id::text = ${normalizedOrgId}`)
    .where("suspended", "=", false)
    .where("status", "=", "ACTIVE")
    .executeTakeFirst();
  return Boolean(organization);
}
