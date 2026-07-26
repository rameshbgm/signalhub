import { collections } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";

export async function getOrganizationMembers(orgId: string) {
  const memberships = await collections
    .memberships()
    .find({ orgId: oid(orgId) })
    .sort({ createdAt: 1 })
    .toArray();
  const users = memberships.length
    ? await collections
        .users()
        .find({ _id: { $in: memberships.map((membership) => membership.userId) } })
        .toArray()
    : [];
  const byId = new Map(users.map((user) => [user._id.toHexString(), user]));
  return memberships.flatMap((membership) => {
    const user = byId.get(membership.userId.toHexString());
    return user
      ? [
          {
            id: membership._id.toHexString(),
            membershipId: membership._id.toHexString(),
            userId: user._id.toHexString(),
            orgId: membership.orgId.toHexString(),
            name: user.name,
            username: user.username,
            email: user.email,
            role: membership.role,
            status: membership.status ?? "ACTIVE",
            pageIds: membership.pageIds?.map((pageId) => pageId.toHexString()) ?? null,
            invitationExpiresAt: membership.invitationExpiresAt ?? null,
            activatedAt: membership.activatedAt ?? null,
            createdAt: membership.createdAt,
            disabled: Boolean(user.disabled),
            mustChangePassword: Boolean(user.mustChangePassword),
          },
        ]
      : [];
  });
}

export async function getUserOrganizations(userId: string) {
  const memberships = await collections
    .memberships()
    .find({ userId: oid(userId), status: "ACTIVE" })
    .sort({ createdAt: 1 })
    .toArray();
  const globalAdmin = memberships.some((membership) => membership.role === "ADMIN");
  const organizations = globalAdmin
    ? await collections.organizations().find({ suspended: { $ne: true }, status: { $nin: ["PROVISIONING", "SUSPENDED", "DELETING"] } }).sort({ createdAt: 1 }).toArray()
    : memberships.length
    ? await collections
        .organizations()
        .find({
          _id: { $in: memberships.map((membership) => membership.orgId) },
          suspended: { $ne: true },
        })
        .toArray()
    : [];
  const byId = new Map(organizations.map((org) => [org._id.toHexString(), org]));
  if (globalAdmin) {
    return organizations.map((organization) => ({
      id: organization._id.toHexString(),
      name: organization.name,
      slug: organization.slug,
      role: "ADMIN" as const,
    }));
  }
  return memberships.flatMap((membership) => {
    const organization = byId.get(membership.orgId.toHexString());
    return organization
      ? [
          {
            id: organization._id.toHexString(),
            name: organization.name,
            slug: organization.slug,
            role: membership.role,
          },
        ]
      : [];
  });
}
