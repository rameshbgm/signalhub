import type { PlatformAdminDoc, PlatformRole } from "./db";

export type PlatformCapability =
  | "overview.read"
  | "organizations.read"
  | "organizations.create"
  | "organizations.suspend"
  | "organizations.purge"
  | "users.read"
  | "users.disable"
  | "operations.read"
  | "operations.retry"
  | "templates.read"
  | "templates.manage"
  | "configuration.read"
  | "configuration.manage"
  | "audit.read"
  | "audit.manage"
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
  "operations.read",
  "operations.retry",
  "templates.read",
  "templates.manage",
  "configuration.read",
  "configuration.manage",
  "audit.read",
  "audit.manage",
  "identity.read",
  "identity.manage",
];

const ROLE_CAPABILITIES: Record<PlatformRole, ReadonlySet<PlatformCapability>> = {
  ADMIN: new Set(ALL_CAPABILITIES),
};

export function normalizedPlatformRole(admin: Pick<PlatformAdminDoc, "role">): PlatformRole {
  return admin.role ?? "ADMIN";
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
