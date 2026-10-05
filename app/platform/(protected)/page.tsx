import { Building2, CirclePause, ClipboardCheck, Cpu, Database, Eye, Inbox, Landmark, ListChecks, ShieldCheck, Terminal, UsersRound, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IconTile, type Hue } from "@/components/ui/icon-tile";
import { PageHeader } from "@/components/ui/page-header";
import { PlatformStat } from "@/components/platform/PlatformStat";
import { database, verifyDatabaseConnection } from "@/lib/postgres/client";
import { requirePlatformPageCapability } from "@/lib/platform-page-guard";
import { organizationStatus } from "@/lib/organization-state";
import { inspectMigrationState } from "@/lib/migrations";

export default async function PlatformOverviewPage() {
  await requirePlatformPageCapability("overview.read");
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
    database.selectFrom("organizations").select(["status", "suspended"]).execute(),
    database.selectFrom("users").select(({ fn }) => fn.countAll<number>().as("count"))
      .where("disabled", "=", false).executeTakeFirstOrThrow().then((row) => Number(row.count)),
    database.selectFrom("platformJobs").select(({ fn }) => fn.countAll<number>().as("count"))
      .where("status", "in", ["QUEUED", "PROCESSING"]).executeTakeFirstOrThrow().then((row) => Number(row.count)),
    database.selectFrom("notificationJobs").select(({ fn }) => fn.countAll<number>().as("count"))
      .where("status", "=", "DEAD_LETTER").executeTakeFirstOrThrow().then((row) => Number(row.count)),
    database.selectFrom("workerHeartbeats").selectAll().orderBy("lastSeenAt", "desc").executeTakeFirst(),
    verifyDatabaseConnection().then(() => true).catch(() => false),
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
    <div className="space-y-8">
      <PageHeader
        title="Platform overview"
        description="Live organization, identity, queue, and runtime state. Counts come directly from the installation database."
        icon={Landmark}
        hue="violet"
      />

      <section aria-label="Platform state" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <PlatformStat label="Active organizations" value={activeOrganizations} icon={Building2} href="/organization/platform/orgs" />
        <PlatformStat label="Suspended" value={suspendedOrganizations} icon={CirclePause} href="/organization/platform/orgs" tone={suspendedOrganizations ? "warn" : "normal"} />
        <PlatformStat label="Active identities" value={activeUsers} icon={UsersRound} href="/organization/platform/users" />
        <PlatformStat label="Platform jobs queued" value={queuedJobs} icon={ListChecks} href="/organization/platform/operations" tone={queuedJobs ? "warn" : "normal"} />
        <PlatformStat label="Delivery dead letters" value={deadLetters} icon={Inbox} href="/organization/platform/operations" tone={deadLetters ? "danger" : "normal"} />
        <PlatformStat label="Database" value={databaseOk ? "Reachable" : "Unavailable"} icon={Database} href="/organization/platform/operations" tone={databaseOk ? "normal" : "danger"} />
        <PlatformStat
          label={`Migrations (${migrationState.verifiedCount}/${migrationState.expectedCount})`}
          value={migrationState.current ? "Current" : "Required"}
          icon={ClipboardCheck}
          href="/organization/platform/operations"
          tone={migrationState.current ? "normal" : "danger"}
        />
        <PlatformStat label="Worker" value={workerHealthy ? "Ready" : "Stale"} icon={Cpu} href="/organization/platform/operations" tone={workerHealthy ? "normal" : "danger"} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Operational boundaries</CardTitle>
          <CardDescription>What you can change from this console and what stays in deployment tooling.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-3">
          <Boundary icon={ShieldCheck} hue="emerald" title="Safe actions">
            Organization lifecycle, emergency user state, template changes, and queue retries are audited.
          </Boundary>
          <Boundary icon={Eye} hue="sky" title="Read-only runtime">
            Worker state, migrations, delivery health, SMTP, and configuration readiness are observable here.
          </Boundary>
          <Boundary icon={Terminal} hue="slate" title="External operations">
            Backups, process restarts, secret rotation, and migration execution stay in deployment tooling.
          </Boundary>
        </CardContent>
      </Card>
    </div>
  );
}

function Boundary({ icon, hue, title, children }: { icon: LucideIcon; hue: Hue; title: string; children: string }) {
  return (
    <div className="flex items-start gap-3">
      <IconTile icon={icon} hue={hue} size="sm" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mt-1 text-sm leading-6 text-ink-soft">{children}</p>
      </div>
    </div>
  );
}
