export type PlatformRole = "ADMIN";

export type PlatformCapability =
  | "overview.read" | "organizations.read" | "organizations.create"
  | "organizations.suspend" | "organizations.purge" | "users.read"
  | "users.disable" | "users.delete" | "operations.read" | "operations.retry"
  | "configuration.read"
  | "configuration.manage" | "audit.read" | "audit.manage"
  | "identity.read" | "identity.manage" | "mfa.manage";

const ALL_CAPABILITIES = new Set<PlatformCapability>([
  "overview.read", "organizations.read", "organizations.create", "organizations.suspend",
  "organizations.purge", "users.read", "users.disable", "users.delete", "operations.read",
  "operations.retry", "configuration.read",
  "configuration.manage", "audit.read", "audit.manage", "identity.read", "identity.manage", "mfa.manage",
]);

export function normalizedPlatformRole(admin: { role?: PlatformRole | null }): PlatformRole {
  return admin.role ?? "ADMIN";
}

export function platformAdminIsActive(admin: { status?: string | null }): boolean {
  return (admin.status ?? "ACTIVE") === "ACTIVE";
}

export function hasPlatformCapability(role: PlatformRole, capability: PlatformCapability): boolean {
  return role === "ADMIN" && ALL_CAPABILITIES.has(capability);
}
