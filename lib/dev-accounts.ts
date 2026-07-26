import type { MembershipRole } from "@/lib/db";

export type DevelopmentAccount = {
  key: string;
  username: string;
  email: string;
  name: string;
  role: MembershipRole;
  description: string;
};

export const DEVELOPMENT_ACCOUNTS: readonly DevelopmentAccount[] = [
  {
    key: "tenant-admin",
    username: "admin",
    email: "admin@status.test",
    name: "SignalHub Admin",
    role: "ADMIN",
    description: "All organization and installation capabilities",
  },
  {
    key: "tenant-incident-manager",
    username: "incident-manager",
    email: "incident-manager@acme.test",
    name: "Imani Incident Manager",
    role: "INCIDENT_MANAGER",
    description: "Incidents, subscribers, analytics, and audit",
  },
  {
    key: "tenant-responder",
    username: "responder",
    email: "responder@acme.test",
    name: "Riley Responder",
    role: "RESPONDER",
    description: "Incident updates, monitors, and components",
  },
  {
    key: "tenant-viewer",
    username: "viewer",
    email: "viewer@acme.test",
    name: "Vera Viewer",
    role: "VIEWER",
    description: "Read-only analytics and audit access",
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
