import Link from "next/link";
import { collections, db } from "@/lib/db";
import { requirePlatformCapability } from "@/lib/admin-guard";
import { organizationStatus } from "@/lib/organization-state";
import { inspectMigrationState } from "@/lib/migrations";

export default async function PlatformOverviewPage() {
  await requirePlatformCapability("overview.read");
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const [
    organizations,
    activeUsers,
    queuedJobs,
    deadLetters,
    heartbeat,
    databaseOk,
    migrationState,
  ] = await Promise.all([
    collections.organizations().find({}, { projection: { status: 1, suspended: 1 } }).toArray(),
    collections.users().countDocuments({ disabled: { $ne: true } }),
    collections.platformJobs().countDocuments({ status: { $in: ["QUEUED", "PROCESSING"] } }),
    collections.notificationJobs().countDocuments({ status: "DEAD_LETTER" }),
    collections.workerHeartbeats().find().sort({ lastSeenAt: -1 }).limit(1).next(),
    db.command({ ping: 1 }, { timeoutMS: 2_000 }).then(() => true).catch(() => false),
    inspectMigrationState(),
  ]);
  const activeOrganizations = organizations.filter(
    (organization) => organizationStatus(organization) === "ACTIVE"
  ).length;
  const suspendedOrganizations = organizations.filter(
    (organization) => organizationStatus(organization) === "SUSPENDED"
  ).length;
  const workerHealthy = Boolean(
    heartbeat &&
      heartbeat.status === "READY" &&
      heartbeat.lastSeenAt > new Date(now - 30_000)
  );

  return (
    <div className="max-w-6xl space-y-8">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-[var(--cyan)]">Control plane</p>
        <h1 className="mt-2 font-mono text-3xl font-semibold text-[var(--fg)]">Platform overview</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--fg-soft)]">
          Live organization, identity, queue, and runtime state. Counts come directly from the installation database.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewCard label="Active organizations" value={activeOrganizations} href="/organization/platform/orgs" />
        <OverviewCard label="Suspended" value={suspendedOrganizations} href="/organization/platform/orgs" tone={suspendedOrganizations ? "warning" : "normal"} />
        <OverviewCard label="Active identities" value={activeUsers} href="/organization/platform/users" />
        <OverviewCard label="Platform jobs queued" value={queuedJobs} href="/organization/platform/operations" tone={queuedJobs ? "warning" : "normal"} />
        <OverviewCard label="Delivery dead letters" value={deadLetters} href="/organization/platform/operations" tone={deadLetters ? "error" : "normal"} />
        <OverviewCard label="Database" value={databaseOk ? "Reachable" : "Unavailable"} href="/organization/platform/operations" tone={databaseOk ? "normal" : "error"} />
        <OverviewCard
          label={`Migrations (${migrationState.verifiedCount}/${migrationState.expectedCount})`}
          value={migrationState.current ? "Current" : "Required"}
          href="/organization/platform/operations"
          tone={migrationState.current ? "normal" : "error"}
        />
        <OverviewCard label="Worker" value={workerHealthy ? "Ready" : "Stale"} href="/organization/platform/operations" tone={workerHealthy ? "normal" : "error"} />
      </section>

      <section className="border border-[var(--line)] bg-[var(--surface)] p-5">
        <h2 className="font-mono text-lg font-semibold text-[var(--fg)]">Operational boundaries</h2>
        <div className="mt-4 grid gap-4 text-sm text-[var(--fg-soft)] md:grid-cols-3">
          <div>
            <p className="font-semibold text-[var(--fg)]">Safe actions</p>
            <p className="mt-1">Organization lifecycle, emergency user state, template changes, and queue retries are audited.</p>
          </div>
          <div>
            <p className="font-semibold text-[var(--fg)]">Read-only runtime</p>
            <p className="mt-1">Worker state, migrations, delivery health, SMTP, and configuration readiness are observable here.</p>
          </div>
          <div>
            <p className="font-semibold text-[var(--fg)]">External operations</p>
            <p className="mt-1">Backups, process restarts, secret rotation, and migration execution stay in deployment tooling.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function OverviewCard({
  label,
  value,
  href,
  tone = "normal",
}: {
  label: string;
  value: string | number;
  href: string;
  tone?: "normal" | "warning" | "error";
}) {
  const color =
    tone === "error" ? "var(--red)" : tone === "warning" ? "var(--amber)" : "var(--cyan)";
  return (
    <Link href={href} className="border border-[var(--line)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--line-bright)]">
      <p className="text-xs text-[var(--fg-dim)]">{label}</p>
      <p className="mt-2 font-mono text-2xl font-semibold" style={{ color }}>{value}</p>
    </Link>
  );
}
