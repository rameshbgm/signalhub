import { Activity, Cpu, Inbox, ListChecks, Terminal } from "lucide-react";
import { database } from "@/lib/postgres/client";
import { requirePlatformPageCapability } from "@/lib/platform-page-guard";
import { hasPlatformCapability } from "@/lib/platform-policy";
import { inspectMigrationState, LATEST_MIGRATION_ID, migrationIssueSummary } from "@/lib/migrations";
import { DeliveriesTable, JobsTable, type DeliveryRow, type JobRow } from "@/components/platform/table/OperationsTables";
import { pageLinks, sortLinks } from "@/components/platform/table/links";
import { ago, formatDateTime, words } from "@/components/platform/table/format";
import { SectionTabs } from "@/components/platform/table/SectionTabs";
import { SortHead } from "@/components/platform/table/SortHead";
import { TableCard } from "@/components/platform/table/TableCard";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { parseTableQuery, type SortDir } from "@/lib/table-query";
import { cn } from "@/lib/utils";

const BASE = "/organization/platform/operations";
const TABS = ["jobs", "deliveries", "workers"] as const;
type Tab = (typeof TABS)[number];
const JOB_STATUSES = ["QUEUED", "PROCESSING", "SUCCEEDED", "FAILED", "CANCELLED"] as const;
const WORKER_STATES = ["healthy", "stale"] as const;
const like = (value: string) => `%${value.replace(/[\\%_]/g, "\\$&")}%`;

export default async function PlatformOperationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePlatformPageCapability("operations.read");
  const params = await searchParams;
  const tab: Tab = TABS.find((candidate) => candidate === params.tab) ?? "jobs";
  // eslint-disable-next-line react-hooks/purity
  const renderedAt = Date.now();
  const [workerTotal, jobTotal, deadLetterCount, migrationState, channelRows] = await Promise.all([
    database.selectFrom("workerHeartbeats").select(({ fn }) => fn.countAll<number>().as("count")).executeTakeFirstOrThrow().then((row) => Number(row.count)),
    database.selectFrom("platformJobs").select(({ fn }) => fn.countAll<number>().as("count")).executeTakeFirstOrThrow().then((row) => Number(row.count)),
    countNotificationJobs("DEAD_LETTER"),
    inspectMigrationState(),
    database.selectFrom("notificationJobs").select("channel").where("status", "=", "DEAD_LETTER").groupBy("channel").orderBy("channel").execute(),
  ]);
  const canRetry = hasPlatformCapability(actor.role, "operations.retry");
  const channels = channelRows.map((row) => row.channel);

  let content: React.ReactNode;
  if (tab === "jobs") {
    const sorts = ["created", "status", "attempts", "org"] as const;
    const defaults = { sort: "created", dir: "desc" as SortDir };
    const query = parseTableQuery(params, { sorts, defaultSort: "created", defaultDir: "desc", filters: { status: JOB_STATUSES } });
    let jobs = database.selectFrom("platformJobs");
    if (query.q) jobs = jobs.where((expression) => expression.or([expression("organizationSlug", "ilike", like(query.q)), expression("organizationName", "ilike", like(query.q)), expression("lastError", "ilike", like(query.q))]));
    if (query.filters.status !== "all") jobs = jobs.where("status", "=", query.filters.status as (typeof JOB_STATUSES)[number]);
    const total = Number((await jobs.select(({ fn }) => fn.countAll<number>().as("count")).executeTakeFirstOrThrow()).count);
    const page = Math.min(query.page, Math.max(1, Math.ceil(total / query.size)));
    const column = { created: "createdAt", status: "status", attempts: "attempts", org: "organizationSlug" }[query.sort] as "createdAt" | "status" | "attempts" | "organizationSlug";
    const found = await jobs.selectAll().orderBy(column, query.dir).orderBy("id").limit(query.size).offset((page - 1) * query.size).execute();
    const rows: JobRow[] = found.map((job) => ({ id: job.id, org: job.organizationSlug, orgName: job.organizationName, status: job.status, attempts: job.attempts, maxAttempts: job.maxAttempts, createdAt: job.createdAt.toISOString(), lastError: job.lastError, retryable: job.status === "FAILED" && job.attempts >= job.maxAttempts }));
    const current = { ...query, page };
    const fixed = { tab: "jobs" };
    content = (
      <TableCard search={{ q: query.q, placeholder: "Search organization or error…" }} total={total} page={page} size={query.size} href={pageLinks(BASE, current, defaults, fixed)} noun="job"
        filters={[{ name: "status", label: "Status", value: query.filters.status, options: [{ value: "all", label: "All statuses" }, ...JOB_STATUSES.map((value) => ({ value, label: words(value) }))] }]}>
        <JobsTable rows={rows} canRetry={canRetry} sorts={sortLinks(BASE, sorts, current, defaults, fixed, ["created", "attempts"])} filtered={Boolean(query.q) || query.filters.status !== "all"} />
      </TableCard>
    );
  } else if (tab === "deliveries") {
    const sorts = ["updated", "subject", "channel", "attempts"] as const;
    const defaults = { sort: "updated", dir: "desc" as SortDir };
    const query = parseTableQuery(params, { sorts, defaultSort: "updated", defaultDir: "desc", filters: { channel: channels } });
    let deliveries = database.selectFrom("notificationJobs").where("status", "=", "DEAD_LETTER");
    if (query.q) deliveries = deliveries.where((expression) => expression.or([expression("subject", "ilike", like(query.q)), expression("lastError", "ilike", like(query.q))]));
    if (query.filters.channel !== "all") deliveries = deliveries.where("channel", "=", query.filters.channel);
    const total = Number((await deliveries.select(({ fn }) => fn.countAll<number>().as("count")).executeTakeFirstOrThrow()).count);
    const page = Math.min(query.page, Math.max(1, Math.ceil(total / query.size)));
    const column = { updated: "updatedAt", subject: "subject", channel: "channel", attempts: "attempts" }[query.sort] as "updatedAt" | "subject" | "channel" | "attempts";
    const found = await deliveries.select(["id", "subject", "channel", "contact", "attempts", "updatedAt", "lastError"]).orderBy(column, query.dir).orderBy("id").limit(query.size).offset((page - 1) * query.size).execute();
    const rows: DeliveryRow[] = found.map((job) => ({ id: job.id, subject: job.subject, channel: job.channel, contact: redactContact(job.contact), attempts: job.attempts, updatedAt: job.updatedAt.toISOString(), lastError: job.lastError }));
    const current = { ...query, page };
    const fixed = { tab: "deliveries" };
    content = (
      <TableCard search={{ q: query.q, placeholder: "Search subject or error…" }} total={total} page={page} size={query.size} href={pageLinks(BASE, current, defaults, fixed)} noun="delivery"
        filters={[{ name: "channel", label: "Channel", value: query.filters.channel, options: [{ value: "all", label: "All channels" }, ...channels.map((value) => ({ value, label: value }))] }]}>
        <DeliveriesTable rows={rows} canRetry={canRetry} sorts={sortLinks(BASE, sorts, current, defaults, fixed, ["updated", "attempts"])} filtered={Boolean(query.q) || query.filters.channel !== "all"} />
      </TableCard>
    );
  } else {
    const sorts = ["seen", "worker", "state"] as const;
    const defaults = { sort: "seen", dir: "desc" as SortDir };
    const query = parseTableQuery(params, { sorts, defaultSort: "seen", defaultDir: "desc", filters: { state: WORKER_STATES } });
    const freshSince = new Date(renderedAt - 30_000);
    let workers = database.selectFrom("workerHeartbeats");
    if (query.q) workers = workers.where("workerId", "ilike", like(query.q));
    if (query.filters.state === "healthy") workers = workers.where("status", "=", "READY").where("lastSeenAt", ">", freshSince);
    if (query.filters.state === "stale") workers = workers.where((expression) => expression.or([expression("status", "!=", "READY"), expression("lastSeenAt", "<=", freshSince)]));
    const total = Number((await workers.select(({ fn }) => fn.countAll<number>().as("count")).executeTakeFirstOrThrow()).count);
    const page = Math.min(query.page, Math.max(1, Math.ceil(total / query.size)));
    const column = { seen: "lastSeenAt", worker: "workerId", state: "status" }[query.sort] as "lastSeenAt" | "workerId" | "status";
    const found = await workers.selectAll().orderBy(column, query.dir).orderBy("id").limit(query.size).offset((page - 1) * query.size).execute();
    const current = { ...query, page };
    const fixed = { tab: "workers" };
    const links = sortLinks(BASE, sorts, current, defaults, fixed, ["seen"]);
    content = (
      <TableCard search={{ q: query.q, placeholder: "Search worker ID…" }} total={total} page={page} size={query.size} href={pageLinks(BASE, current, defaults, fixed)} noun="worker"
        filters={[{ name: "state", label: "State", value: query.filters.state, options: [{ value: "all", label: "All states" }, { value: "healthy", label: "Healthy" }, { value: "stale", label: "Stale" }] }]}>
        {found.length === 0 ? (
          <EmptyState icon={Cpu} hue="violet" title={query.q || query.filters.state !== "all" ? "No workers match these filters" : "No worker heartbeats yet"} description={query.q || query.filters.state !== "all" ? "Try a different search or clear the filters." : "No worker heartbeat has been recorded."} className="m-4 border-dashed bg-transparent py-12" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <SortHead label="Worker" link={links.worker} />
                <SortHead label="State" link={links.state} />
                <SortHead label="Last heartbeat" link={links.seen} />
                <TableHead className="max-md:hidden">Version</TableHead>
                <TableHead className="max-lg:hidden">Started</TableHead>
                <TableHead className="max-md:hidden">Loop / error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {found.map((worker) => {
                const fresh = worker.lastSeenAt > freshSince && worker.status === "READY";
                const seen = worker.lastSeenAt.toISOString();
                const loop = worker.lastError ?? (worker.lastLoopAt ? `Loop ${formatDateTime(worker.lastLoopAt.toISOString())}` : "No loop telemetry yet");
                return (
                  <TableRow key={worker.id} className="odd:bg-surface even:bg-sunken/45">
                    <TableCell><span className="break-all font-mono text-xs text-ink">{worker.workerId}</span></TableCell>
                    <TableCell><StatusBadge tone={fresh ? "ok" : "danger"}>{fresh ? "Healthy" : words(worker.status === "READY" ? "stale" : worker.status)}</StatusBadge></TableCell>
                    <TableCell className="whitespace-nowrap text-xs"><span className="text-ink">{formatDateTime(seen)}</span><span className="block text-ink-dim">{ago(seen, renderedAt)}</span></TableCell>
                    <TableCell className="font-mono text-xs max-md:hidden">{worker.version}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs max-lg:hidden">{formatDateTime(worker.startedAt.toISOString())}</TableCell>
                    <TableCell className={cn("max-w-xs text-xs max-md:hidden", worker.lastError && "text-danger-fg")}><span className="line-clamp-2 break-words">{loop}</span></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </TableCard>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operations"
        description="Runtime and durable queue visibility. Only safe, idempotent retry operations are exposed."
        icon={Activity}
        hue="violet"
      />

      {!migrationState.current && (
        <Alert tone="danger" title="Migration state requires deployment attention">
          {migrationIssueSummary(migrationState)}. Run the migration CLI from your deployment
          environment; migrations cannot be executed from this console.
        </Alert>
      )}

      <SectionTabs label="Operations" active={tab} tabs={[
        { id: "jobs", label: "Platform jobs", icon: ListChecks, href: BASE, count: jobTotal },
        { id: "deliveries", label: "Dead-letter deliveries", icon: Inbox, href: `${BASE}?tab=deliveries`, count: deadLetterCount },
        { id: "workers", label: "Worker heartbeats", icon: Cpu, href: `${BASE}?tab=workers`, count: workerTotal },
      ]} />

      {content}

      <p className="flex items-start gap-2 text-xs leading-5 text-ink-dim">
        <Terminal aria-hidden size={14} className="mt-0.5 shrink-0" />
        <span>Backups, restore drills, process restarts, secret rotation and migrations are run from your deployment tooling, not from this console. Expected migration: <code className="rounded-chip bg-sunken px-1.5 py-0.5 font-mono text-2xs text-ink">{LATEST_MIGRATION_ID}</code>.</span>
      </p>
    </div>
  );
}

function redactContact(value: string) {
  if (value.includes("@")) {
    const [local, domain] = value.split("@");
    return `${local.slice(0, 2)}***@${domain}`;
  }
  if (value.startsWith("http")) {
    try {
      return new URL(value).hostname;
    } catch {
      return "invalid URL";
    }
  }
  return value.length > 6 ? `${value.slice(0, 3)}…${value.slice(-2)}` : "redacted";
}

async function countNotificationJobs(status: "DEAD_LETTER") {
  const row = await database.selectFrom("notificationJobs")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .where("status", "=", status).executeTakeFirstOrThrow();
  return Number(row.count);
}
