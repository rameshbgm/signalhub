import { z } from "zod";

export const MEMBERSHIP_ROLES = [
  "OWNER",
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
  OWNER: new Set(CAPABILITIES),
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

export const canonicalEmailSchema = z
  .string()
  .trim()
  .email()
  .transform(canonicalizeEmail);

const ROLE_RANK: Record<MembershipRole, number> = {
  VIEWER: 0,
  RESPONDER: 1,
  INCIDENT_MANAGER: 2,
  ADMIN: 3,
  OWNER: 4,
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
  session: {
    role: string;
    supportActorEmail?: string;
    supportMode?: "VIEW" | "OPERATE";
    supportScopes?: string[];
  },
  capability: Capability
) {
  if (!hasCapability(session.role, capability)) return false;
  if (!session.supportActorEmail) return true;
  if (session.supportMode === "VIEW") {
    return capability === "analytics.view" || capability === "audit.view";
  }
  return (
    session.supportMode === "OPERATE" &&
    Boolean(session.supportScopes?.includes(capability))
  );
}

export function roleCapabilities(role: MembershipRole) {
  return CAPABILITIES.filter((capability) => ROLE_CAPABILITIES[role].has(capability));
}

export function legacyRoleToMembership(role: string, isOldestAdmin: boolean): MembershipRole {
  if (role === "TENANT_ADMIN") return isOldestAdmin ? "OWNER" : "ADMIN";
  return "RESPONDER";
}
