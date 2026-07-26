export const MEMBERSHIP_ROLES = [
  "ADMIN",
  "INCIDENT_MANAGER",
  "RESPONDER",
  "VIEWER",
] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export const CAPABILITIES = [
  "organization.manage",
  "page.configure",
  "incident.manage",
  "incident.update",
  "monitor.manage",
  "component.update",
  "subscriber.manage",
  "integration.manage",
  "team.manage",
  "analytics.view",
  "audit.view",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const ROLE_CAPABILITIES: Record<MembershipRole, ReadonlySet<Capability>> = {
  ADMIN: new Set(CAPABILITIES),
  INCIDENT_MANAGER: new Set([
    "incident.manage",
    "incident.update",
    "component.update",
    "subscriber.manage",
    "analytics.view",
    "audit.view",
  ]),
  RESPONDER: new Set([
    "incident.update",
    "monitor.manage",
    "component.update",
    "analytics.view",
  ]),
  VIEWER: new Set(["analytics.view", "audit.view"]),
};

export function canonicalizeEmail(email: string): string {
  return email.trim().normalize("NFKC").toLowerCase();
}

export function canonicalizeUsername(username: string): string {
  return username.trim().normalize("NFKC").toLowerCase();
}

export function usernameError(username: string): string | null {
  const canonical = canonicalizeUsername(username);
  if (canonical.length < 3 || canonical.length > 64) {
    return "User ID must contain between 3 and 64 characters";
  }
  if (!/^[a-z0-9._-]+$/.test(canonical)) {
    return "User ID may contain only letters, numbers, dots, dashes, and underscores";
  }
  return null;
}

const ROLE_RANK: Record<MembershipRole, number> = {
  VIEWER: 0,
  RESPONDER: 1,
  INCIDENT_MANAGER: 2,
  ADMIN: 3,
};

export function roleAtLeast(role: string, minimum: MembershipRole): role is MembershipRole {
  return role in ROLE_RANK && ROLE_RANK[role as MembershipRole] >= ROLE_RANK[minimum];
}

export function hasCapability(role: string, capability: Capability) {
  return MEMBERSHIP_ROLES.includes(role as MembershipRole)
    ? ROLE_CAPABILITIES[role as MembershipRole].has(capability)
    : false;
}

export function sessionHasCapability(
  session: { role: string },
  capability: Capability
) {
  return hasCapability(session.role, capability);
}

export function roleCapabilities(role: MembershipRole) {
  return CAPABILITIES.filter((capability) => ROLE_CAPABILITIES[role].has(capability));
}
