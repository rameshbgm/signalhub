import type { MembershipRole, PlatformRole } from "@/lib/db";

export type DevelopmentAccount =
  | {
      key: string;
      audience: "tenant";
      email: string;
      name: string;
      role: MembershipRole;
      description: string;
    }
  | {
      key: string;
      audience: "platform";
      email: string;
      name: string;
      role: PlatformRole;
      description: string;
    };

export const DEVELOPMENT_ACCOUNTS: readonly DevelopmentAccount[] = [
  {
    key: "tenant-owner",
    audience: "tenant",
    email: "tenant-owner@acme.test",
    name: "Olivia Owner",
    role: "OWNER",
    description: "All organization and status-page capabilities",
  },
  {
    key: "tenant-admin",
    audience: "tenant",
    email: "tenant-admin@acme.test",
    name: "Amir Admin",
    role: "ADMIN",
    description: "Full administration without owner-only safeguards",
  },
  {
    key: "tenant-incident-manager",
    audience: "tenant",
    email: "incident-manager@acme.test",
    name: "Imani Incident Manager",
    role: "INCIDENT_MANAGER",
    description: "Incidents, subscribers, analytics, and audit",
  },
  {
    key: "tenant-responder",
    audience: "tenant",
    email: "responder@acme.test",
    name: "Riley Responder",
    role: "RESPONDER",
    description: "Incident updates, monitors, and components",
  },
  {
    key: "tenant-viewer",
    audience: "tenant",
    email: "viewer@acme.test",
    name: "Vera Viewer",
    role: "VIEWER",
    description: "Read-only analytics and audit access",
  },
  {
    key: "platform-owner",
    audience: "platform",
    email: "platform-owner@signal.test",
    name: "Parker Platform Owner",
    role: "OWNER",
    description: "All platform and identity capabilities",
  },
  {
    key: "platform-operator",
    audience: "platform",
    email: "platform-operator@signal.test",
    name: "Opal Platform Operator",
    role: "OPERATOR",
    description: "Operations without owner purge or admin management",
  },
  {
    key: "platform-auditor",
    audience: "platform",
    email: "platform-auditor@signal.test",
    name: "Avery Platform Auditor",
    role: "AUDITOR",
    description: "Read-only platform oversight",
  },
] as const;

export function developmentQuickLoginAllowed(input: {
  nodeEnv?: string;
  enabled?: string;
  hostname: string;
}) {
  return (
    input.nodeEnv !== "production" &&
    input.enabled === "true" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(input.hostname)
  );
}
