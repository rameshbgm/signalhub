import { Landmark } from "lucide-react";
import { CreateOrganizationForm } from "@/components/platform/CreateOrganizationForm";
import { OrganizationsTable, type OrganizationRow } from "@/components/platform/table/OrganizationsTable";
import { StatusWall } from "@/components/platform/PlatformStat";
import { pageLinks, sortLinks } from "@/components/platform/table/links";
import { TableCard } from "@/components/platform/table/TableCard";
import { PageHeader } from "@/components/ui/page-header";
import { inspectMigrationState } from "@/lib/migrations";
import { subscriptionCapabilities } from "@/lib/notification-capabilities";
import { organizationPurgeCanBeCancelled } from "@/lib/platform-job-policy";
import { requirePlatformPageCapability } from "@/lib/platform-page-guard";
import { hasPlatformCapability } from "@/lib/platform-policy";
import { buildStatusCards } from "@/lib/platform-status";
import { database, verifyDatabaseConnection } from "@/lib/postgres/client";
import { verifySmtp } from "@/lib/smtp";
import { appBaseUrl } from "@/lib/settings/request";
import { parseTableQuery, type SortDir } from "@/lib/table-query";

const BASE = "/organization/platform";
const SORTS = ["name", "status", "members", "created"] as const;
const STATUSES = ["ACTIVE", "SUSPENDED", "DELETING", "PROVISIONING"] as const;
const DEFAULTS = { sort: "created", dir: "desc" as SortDir };

export default async function PlatformOverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePlatformPageCapability("overview.read");
  const query = parseTableQuery(await searchParams, { sorts: SORTS, defaultSort: "created", defaultDir: "desc", filters: { status: STATUSES } });
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  let directory = database.selectFrom("organizations");
  if (query.q) {
    const pattern = `%${query.q.replace(/[\\%_]/g, "\\$&")}%`;
    directory = directory.where((expression) => expression.or([
      expression("name", "ilike", pattern), expression("slug", "ilike", pattern), expression("contactEmail", "ilike", pattern),
    ]));
  }
  if (query.filters.status !== "all") directory = directory.where("status", "=", query.filters.status as (typeof STATUSES)[number]);

  const [statuses, activeUsers, queuedJobs, deliveryCounts, workerTotal, heartbeat, databaseOk, migrationState, matching, smtp, capabilities] = await Promise.all([
    database.selectFrom("organizations").select(["status", "suspended"]).execute(),
    database.selectFrom("users").select(({ fn }) => fn.countAll<number>().as("count")).where("disabled", "=", false).executeTakeFirstOrThrow().then((row) => Number(row.count)),
    database.selectFrom("platformJobs").select(({ fn }) => fn.countAll<number>().as("count")).where("status", "in", ["QUEUED", "PROCESSING"]).executeTakeFirstOrThrow().then((row) => Number(row.count)),
    database.selectFrom("notificationJobs").select("status").select(({ fn }) => fn.countAll<number>().as("count")).groupBy("status").execute(),
    database.selectFrom("workerHeartbeats").select(({ fn }) => fn.countAll<number>().as("count")).executeTakeFirstOrThrow().then((row) => Number(row.count)),
    database.selectFrom("workerHeartbeats").selectAll().orderBy("lastSeenAt", "desc").executeTakeFirst(),
    verifyDatabaseConnection().then(() => true).catch(() => false),
    inspectMigrationState(),
    directory.select(({ fn }) => fn.countAll<number>().as("count")).executeTakeFirstOrThrow().then((row) => Number(row.count)),
    verifySmtp(),
    subscriptionCapabilities(),
  ]);
  const page = Math.min(query.page, Math.max(1, Math.ceil(matching / query.size)));
  const orgs = await directory
    .select(["organizations.id", "organizations.name", "organizations.slug", "organizations.status", "organizations.contactEmail", "organizations.createdAt"])
    .select((expression) => [
      expression.selectFrom("memberships").select(expression.fn.countAll<number>().as("count")).whereRef("memberships.orgId", "=", "organizations.id").as("members"),
      expression.selectFrom("pages").select(expression.fn.countAll<number>().as("count")).whereRef("pages.orgId", "=", "organizations.id").where("pages.deletedAt", "is", null).as("pages"),
    ])
    .orderBy(query.sort === "name" ? (expression) => expression.fn("lower", ["organizations.name"]) : query.sort === "status" ? "organizations.status" : query.sort === "members" ? "members" : "organizations.createdAt", query.dir)
    .orderBy("organizations.id")
    .limit(query.size).offset((page - 1) * query.size)
    .execute();
  const purgeJobs = orgs.length
    ? await database.selectFrom("platformJobs").selectAll()
        .where("organizationId", "in", orgs.map((organization) => organization.id)).where("type", "=", "PURGE_ORGANIZATION")
        .orderBy("createdAt", "desc").execute()
    : [];
  const latestPurge = new Map<string, (typeof purgeJobs)[number]>();
  for (const job of purgeJobs) if (!latestPurge.has(job.organizationId)) latestPurge.set(job.organizationId, job);

  const count = (status: string) => statuses.filter((organization) => (organization.status ?? (organization.suspended ? "SUSPENDED" : "ACTIVE")) === status).length;
  const workerHealthy = Boolean(heartbeat && heartbeat.status === "READY" && heartbeat.lastSeenAt > new Date(now - 30_000));
  const delivered = (status: string) => Number(deliveryCounts.find((row) => row.status === status)?.count ?? 0);
  const cards = buildStatusCards({
    organizations: { active: count("ACTIVE"), suspended: count("SUSPENDED") },
    activeUsers,
    databaseOk,
    migrations: { current: migrationState.current, verified: migrationState.verifiedCount, expected: migrationState.expectedCount },
    worker: { healthy: workerHealthy, seen: workerTotal },
    platformJobsQueued: queuedJobs,
    deliveries: { queued: delivered("PENDING"), processing: delivered("PROCESSING"), blocked: delivered("BLOCKED"), delivered: delivered("SENT"), deadLetter: delivered("DEAD_LETTER") },
    smtp,
    email: { reason: capabilities.email.reason },
    sms: capabilities.sms,
    publicUrlConfigured: Boolean(appBaseUrl()),
    telemetryConfigured: Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT),
  });
  const canCreate = hasPlatformCapability(actor.role, "organizations.create");
  const current = { ...query, page };
  const rows: OrganizationRow[] = orgs.map((organization) => ({
    id: organization.id, name: organization.name, slug: organization.slug, status: organization.status ?? "ACTIVE",
    contactEmail: organization.contactEmail, members: Number(organization.members ?? 0), pages: Number(organization.pages ?? 0),
    createdAt: organization.createdAt.toISOString(), purgeCancellable: organizationPurgeCanBeCancelled(latestPurge.get(organization.id)),
    current: organization.id === actor.orgId,
  }));
  const label = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Live status of the whole installation, and every tenant on it. Values come directly from the installation database."
        icon={Landmark}
        hue="violet"
      />

      <StatusWall cards={cards} />

      <section id="organizations" aria-label="Tenant directory" className="scroll-mt-6 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-ink">Tenant directory</h2>
            <p className="text-sm text-ink-soft">Provision, open and suspend organizations, and queue permanent purges.</p>
          </div>
        </div>
        {canCreate && (
          <details className="group rounded-card border border-line bg-surface shadow-card open:pb-1" open>
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
              Provision an organization
              <span className="ml-auto text-xs font-normal text-ink-dim group-open:hidden">Creates an active tenant</span>
            </summary>
            <div className="px-4 pb-4 pt-1"><CreateOrganizationForm /></div>
          </details>
        )}
        <TableCard
          search={{ q: query.q, placeholder: "Search name, slug or email…" }}
          filters={[{ name: "status", label: "Status", value: query.filters.status, options: [{ value: "all", label: "All statuses" }, ...STATUSES.map((status) => ({ value: status, label: label(status) }))] }]}
          total={matching} page={page} size={query.size} href={pageLinks(BASE, current, DEFAULTS)} noun="organization"
        >
          <OrganizationsTable
            rows={rows}
            permissions={{ canSuspend: hasPlatformCapability(actor.role, "organizations.suspend"), canPurge: hasPlatformCapability(actor.role, "organizations.purge") }}
            sorts={sortLinks(BASE, SORTS, current, DEFAULTS, {}, ["created", "members"])}
            filtered={Boolean(query.q) || query.filters.status !== "all"}
          />
        </TableCard>
      </section>
    </div>
  );
}
