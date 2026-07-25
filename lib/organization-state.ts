import type { OrganizationDoc, OrganizationStatus } from "@/lib/db";

export function organizationStatus(
  organization: Pick<OrganizationDoc, "status" | "suspended">
): OrganizationStatus {
  if (organization.status) return organization.status;
  return organization.suspended ? "SUSPENDED" : "ACTIVE";
}

export function organizationIsActive(
  organization: Pick<OrganizationDoc, "status" | "suspended">
): boolean {
  return organizationStatus(organization) === "ACTIVE";
}

export function organizationIsFrozen(
  organization: Pick<OrganizationDoc, "status" | "suspended">
): boolean {
  return !organizationIsActive(organization);
}
