/**
 * Every status card of Platform administration, in one place. Overview shows them all; no other
 * tab repeats them. Pure: the page gathers the numbers, this decides what each card says.
 */
export type StatusTone = "normal" | "warn" | "danger";
export type StatusIcon =
  | "organizations" | "suspended" | "identities" | "database" | "migrations" | "worker" | "jobs"
  | "queued" | "processing" | "blocked" | "delivered" | "deadLetter" | "email" | "sms" | "url" | "storage" | "telemetry";

export type StatusGroup = "organizations" | "notifications" | "delivery" | "system" | "setup";

export type StatusCard = { id: string; group: StatusGroup; label: string; description: string; value: string | number; detail?: string; tone: StatusTone; icon: StatusIcon; href?: string };

export type StatusInput = {
  organizations: { active: number; suspended: number };
  activeUsers: number;
  databaseOk: boolean;
  migrations: { current: boolean; verified: number; expected: number };
  worker: { healthy: boolean; seen: number };
  platformJobsQueued: number;
  deliveries: { queued: number; processing: number; blocked: number; delivered: number; deadLetter: number };
  smtp: { configured: boolean; ok: boolean; error: string | null };
  email: { reason: string | null };
  sms: { enabled: boolean; reason: string | null };
  publicUrlConfigured: boolean;
  telemetryConfigured: boolean;
};

const BASE = "/organization/platform";

/**
 * Cards sit next to the ones they relate to, four to a row on a wide screen: organizations and people,
 * the notification queue, delivery health (failures, channels, the worker that sends), the system, setup.
 */
const ORDER: ReadonlyArray<readonly [StatusGroup, readonly string[]]> = [
  ["organizations", ["organizations", "suspended", "identities", "jobs"]],
  ["notifications", ["queued", "processing", "blocked", "delivered"]],
  ["delivery", ["deadLetter", "email", "sms", "worker"]],
  ["system", ["database", "migrations", "storage", "telemetry"]],
  ["setup", ["url"]],
];

export function buildStatusCards(input: StatusInput): StatusCard[] {
  const { organizations, deliveries, smtp } = input;
  const warnIf = (count: number): StatusTone => (count > 0 ? "warn" : "normal");
  const entries: Array<Omit<StatusCard, "group">> = [
    { id: "organizations", label: "Active organizations", description: "Tenants that can sign in and publish status pages.", value: organizations.active, tone: "normal", icon: "organizations", href: "#organizations" },
    { id: "suspended", label: "Suspended organizations", description: "Tenants frozen by an operator: no sign-in, no updates, notifications held.", value: organizations.suspended, tone: warnIf(organizations.suspended), icon: "suspended", href: `${BASE}?status=SUSPENDED#organizations` },
    { id: "identities", label: "Active user accounts", description: "Accounts that are not disabled, across all organizations.", value: input.activeUsers, tone: "normal", icon: "identities", href: `${BASE}/users` },
    { id: "database", label: "Database connection", description: "Whether the installation database answers a live query.", value: input.databaseOk ? "Reachable" : "Unavailable", tone: input.databaseOk ? "normal" : "danger", icon: "database" },
    { id: "migrations", label: "Database migrations", description: "Schema migrations verified against the ones this version expects.", value: input.migrations.current ? "Current" : "Required", detail: `${input.migrations.verified}/${input.migrations.expected}`, tone: input.migrations.current ? "normal" : "danger", icon: "migrations" },
    { id: "worker", label: "Background worker", description: "Runs monitors and deliveries. Healthy when it reported ready in the last 30 seconds.", value: input.worker.healthy ? "Ready" : "Stale", detail: `${input.worker.seen} seen`, tone: input.worker.healthy ? "normal" : "danger", icon: "worker", href: `${BASE}/operations?tab=workers` },
    { id: "jobs", label: "Platform jobs waiting", description: "Organization purges and other platform jobs queued or running.", value: input.platformJobsQueued, tone: warnIf(input.platformJobsQueued), icon: "jobs", href: `${BASE}/operations` },
    { id: "queued", label: "Notifications waiting to send", description: "Email, SMS and webhook notifications queued for the worker.", value: deliveries.queued, tone: "normal", icon: "queued" },
    { id: "processing", label: "Notifications being sent", description: "Deliveries a worker is sending right now.", value: deliveries.processing, tone: "normal", icon: "processing" },
    { id: "blocked", label: "Notifications held (suspended)", description: "Paused because their organization is suspended; sent again on reactivation.", value: deliveries.blocked, tone: warnIf(deliveries.blocked), icon: "blocked" },
    { id: "delivered", label: "Notifications delivered", description: "Notifications sent successfully.", value: deliveries.delivered, tone: "normal", icon: "delivered" },
    { id: "deadLetter", label: "Failed notifications (dead letters)", description: "Deliveries that used all their retries. Retry them under Operations.", value: deliveries.deadLetter, tone: deliveries.deadLetter > 0 ? "danger" : "normal", icon: "deadLetter", href: `${BASE}/operations?tab=deliveries` },
    {
      id: "email", label: "Email delivery", description: "Whether subscriber and system email can be sent (mail server reachable).", icon: "email", href: `${BASE}/configuration`,
      value: !smtp.configured ? "Not configured" : smtp.ok ? "Reachable" : "Unavailable",
      detail: (smtp.configured && !smtp.ok ? smtp.error : input.email.reason) ?? undefined,
      tone: !smtp.configured ? "warn" : smtp.ok ? "normal" : "danger",
    },
    { id: "sms", label: "SMS delivery", description: "Whether subscriber text messages can be sent.", value: input.sms.enabled ? "Available" : "Unavailable", detail: input.sms.reason ?? undefined, tone: input.sms.enabled ? "normal" : "warn", icon: "sms", href: `${BASE}/configuration` },
    { id: "url", label: "Public application URL", description: "The address used in emails and links.", value: input.publicUrlConfigured ? "Configured" : "Missing", detail: input.publicUrlConfigured ? undefined : "Set it under Configuration > Deployment", tone: input.publicUrlConfigured ? "normal" : "warn", icon: "url", href: `${BASE}/deployment` },
    { id: "storage", label: "Asset storage", description: "Where uploaded logos and files are kept.", value: "PostgreSQL", tone: "normal", icon: "storage" },
    { id: "telemetry", label: "Telemetry export", description: "Sends traces and metrics to your OpenTelemetry collector (optional).", value: input.telemetryConfigured ? "OTLP configured" : "Not configured", detail: input.telemetryConfigured ? undefined : "Optional", tone: "normal", icon: "telemetry" },
  ];
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return ORDER.map(([group, ids]) => ids.map((id) => ({ ...byId.get(id)!, group }))).flat();
}
