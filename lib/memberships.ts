import { database } from "@/lib/postgres/client";

export async function getOrganizationMembers(orgId: string) {
  const rows = await database
    .selectFrom("memberships as membership")
    .innerJoin("users as user", "user.id", "membership.userId")
    .select([
      "membership.id as membershipId",
      "membership.userId",
      "membership.orgId",
      "membership.role",
      "membership.status",
      "membership.pageIds",
      "membership.invitationExpiresAt",
      "membership.activatedAt",
      "membership.createdAt",
      "user.name",
      "user.username",
      "user.email",
      "user.disabled",
      "user.mustChangePassword",
    ])
    .where("membership.orgId", "=", orgId)
    .orderBy("membership.createdAt", "asc")
    .execute();

  return rows.map((row) => ({
    id: row.membershipId,
    ...row,
    pageIds: row.pageIds ?? null,
  }));
}

export async function getUserOrganizations(userId: string) {
  const memberships = await database
    .selectFrom("memberships")
    .select(["orgId", "role", "createdAt"])
    .where("userId", "=", userId)
    .where("status", "=", "ACTIVE")
    .orderBy("createdAt", "asc")
    .execute();
  const globalAdmin = memberships.some((membership) => membership.role === "ADMIN");
  const organizations = globalAdmin
    ? await database
        .selectFrom("organizations")
        .select(["id", "name", "slug"])
        .where("suspended", "=", false)
        .where("status", "=", "ACTIVE")
        .orderBy("createdAt", "asc")
        .execute()
    : memberships.length
    ? await database
        .selectFrom("organizations")
        .select(["id", "name", "slug"])
        .where("id", "in", memberships.map((membership) => membership.orgId))
        .where("suspended", "=", false)
        .where("status", "=", "ACTIVE")
        .execute()
    : [];
  const byId = new Map(organizations.map((org) => [org.id, org]));
  if (globalAdmin) {
    return organizations.map((organization) => ({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      role: "ADMIN" as const,
    }));
  }
  return memberships.flatMap((membership) => {
    const organization = byId.get(membership.orgId);
    return organization
      ? [
          {
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
            role: membership.role,
          },
        ]
      : [];
  });
}
