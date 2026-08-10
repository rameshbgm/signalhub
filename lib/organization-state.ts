export type OrganizationStatus = "PROVISIONING" | "ACTIVE" | "SUSPENDED" | "DELETING";

type OrganizationState = {
  status?: OrganizationStatus | null;
  suspended?: boolean | null;
};

export function organizationStatus(
  organization: OrganizationState
): OrganizationStatus {
  if (organization.status) return organization.status;
  return organization.suspended ? "SUSPENDED" : "ACTIVE";
}

export function organizationIsActive(
  organization: OrganizationState
): boolean {
  return organizationStatus(organization) === "ACTIVE";
}
