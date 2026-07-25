import type { PlatformAdminDoc, PlatformRole } from "./db";

export type PlatformCapability =
  | "overview.read"
  | "organizations.read"
  | "organizations.create"
  | "organizations.suspend"
  | "organizations.purge"
  | "users.read"
  | "users.disable"
  | "support.view"
  | "support.operate"
  | "operations.read"
  | "operations.retry"
  | "templates.read"
  | "templates.manage"
  | "audit.read"
  | "audit.manage"
  | "admins.read"
  | "admins.manage"
  | "identity.read"
  | "identity.manage";

const ALL_CAPABILITIES: PlatformCapability[] = [
  "overview.read",
  "organizations.read",
  "organizations.create",
  "organizations.suspend",
  "organizations.purge",
  "users.read",
  "users.disable",
  "support.view",
  "support.operate",
  "operations.read",
  "operations.retry",
  "templates.read",
  "templates.manage",
  "audit.read",
  "audit.manage",
  "admins.read",
  "admins.manage",
  "identity.read",
  "identity.manage",
];

const ROLE_CAPABILITIES: Record<PlatformRole, ReadonlySet<PlatformCapability>> = {
  OWNER: new Set(ALL_CAPABILITIES),
  OPERATOR: new Set(
    ALL_CAPABILITIES.filter(
      (capability) =>
        capability !== "admins.manage" && capability !== "organizations.purge"
    )
  ),
  AUDITOR: new Set([
    "overview.read",
    "organizations.read",
    "users.read",
    "support.view",
    "operations.read",
    "templates.read",
    "audit.read",
    "admins.read",
    "identity.read",
  ]),
};

export function normalizedPlatformRole(admin: Pick<PlatformAdminDoc, "role">): PlatformRole {
  return admin.role ?? "OWNER";
}

export function platformAdminIsActive(
  admin: Pick<PlatformAdminDoc, "status">
): boolean {
  return (admin.status ?? "ACTIVE") === "ACTIVE";
}

export function hasPlatformCapability(
  role: PlatformRole,
  capability: PlatformCapability
): boolean {
  return ROLE_CAPABILITIES[role].has(capability);
}
