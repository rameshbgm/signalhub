import Link from "next/link";
import { Download, MonitorSmartphone, ScrollText, Webhook } from "lucide-react";
import { database } from "@/lib/postgres/client";
import { requirePlatformPageCapability } from "@/lib/platform-page-guard";
import { hasPlatformCapability } from "@/lib/platform-policy";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { createAuditSink } from "./actions";
import { AuditTable, type AuditRow } from "@/components/platform/table/AuditTable";
import { SessionsTable } from "@/components/platform/table/SessionsTable";
import { SinksTable, type SinkRow } from "@/components/platform/table/SinksTable";
import { pageLinks, sortLinks } from "@/components/platform/table/links";
import { SectionTabs } from "@/components/platform/table/SectionTabs";
import { TableCard } from "@/components/platform/table/TableCard";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { INPUT_LIMITS } from "@/lib/input-limits";
import { applyTableQuery, parseTableQuery, type SortDir } from "@/lib/table-query";

const BASE = "/organization/platform/audit";
const ROLES = ["ADMIN", "SYSTEM", "TENANT"] as const;
const PERIODS = { "24h": 86_400_000, "7d": 604_800_000, "30d": 2_592_000_000 } as const;
const like = (value: string) => `%${value.replace(/[\\%_]/g, "\\$&")}%`;

export default async function PlatformAuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePlatformPageCapability("audit.read");
  const params = await searchParams;
  const tab = params.tab === "sinks" ? "sinks" : params.tab === "sessions" ? "sessions" : "log";
  const canManage = hasPlatformCapability(session.role, "audit.manage");
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const [entryTotal, sinkTotal] = await Promise.all([
    database.selectFrom("platformAuditLogs").select(({ fn }) => fn.countAll<number>().as("count")).executeTakeFirstOrThrow().then((row) => Number(row.count)),
    database.selectFrom("auditSinks").select(({ fn }) => fn.countAll<number>().as("count")).executeTakeFirstOrThrow().then((row) => Number(row.count)),
  ]);

  let content: React.ReactNode;
  let actions: React.ReactNode = null;
  if (tab === "log") {
    const sorts = ["when", "action", "actor", "target"] as const;
    const defaults = { sort: "when", dir: "desc" as SortDir };
    const actionRows = await database.selectFrom("platformAuditLogs").select("action").groupBy("action").orderBy("action").execute();
    const actionNames = actionRows.map((row) => row.action);
    const query = parseTableQuery(params, { sorts, defaultSort: "when", defaultDir: "desc", filters: { action: actionNames, role: ROLES, period: Object.keys(PERIODS) } });
    let entries = database.selectFrom("platformAuditLogs");
    if (query.q) entries = entries.where((expression) => expression.or([
      expression("actorEmail", "ilike", like(query.q)), expression("targetId", "ilike", like(query.q)),
      expression("action", "ilike", like(query.q)), expression("reason", "ilike", like(query.q)),
    ]));
    if (query.filters.action !== "all") entries = entries.where("action", "=", query.filters.action);
    if (query.filters.role !== "all") entries = entries.where("actorRole", "=", query.filters.role as (typeof ROLES)[number]);
    if (query.filters.period !== "all") entries = entries.where("createdAt", ">=", new Date(now - PERIODS[query.filters.period as keyof typeof PERIODS]));
    const total = Number((await entries.select(({ fn }) => fn.countAll<number>().as("count")).executeTakeFirstOrThrow()).count);
    const page = Math.min(query.page, Math.max(1, Math.ceil(total / query.size)));
    const column = { when: "createdAt", action: "action", actor: "actorEmail", target: "targetId" }[query.sort] as "createdAt" | "action" | "actorEmail" | "targetId";
    const found = await entries.selectAll().orderBy(column, query.dir).orderBy("id").limit(query.size).offset((page - 1) * query.size).execute();
    const ids = [...new Set(found.map((entry) => entry.organizationId).filter((value): value is string => Boolean(value)))];
    const names = new Map((ids.length ? await database.selectFrom("organizations").select(["id", "name"]).where("id", "in", ids).execute() : []).map((organization) => [organization.id, organization.name]));
    const rows: AuditRow[] = found.map((entry) => ({
      id: entry.id, createdAt: entry.createdAt.toISOString(), action: entry.action, actorEmail: entry.actorEmail, actorRole: entry.actorRole, actorId: entry.actorId,
      targetType: entry.targetType, targetId: entry.targetId, organizationId: entry.organizationId, organizationName: entry.organizationId ? names.get(entry.organizationId) ?? null : null,
      reason: entry.reason, metadata: entry.metadata, sequence: entry.chainSequence === null ? null : String(entry.chainSequence), entryHash: entry.entryHash, previousHash: entry.previousHash,
    }));
    const current = { ...query, page };
    const fixed = {};
    const periodLabel: Record<string, string> = { "24h": "Last 24 hours", "7d": "Last 7 days", "30d": "Last 30 days" };
    actions = (
      <>
        <Link href="/api/platform/audit/export?format=csv" className={buttonVariants({ variant: "secondary", size: "sm" })}><Download aria-hidden size={14} />CSV</Link>
        <Link href="/api/platform/audit/export?format=json" className={buttonVariants({ variant: "secondary", size: "sm" })}><Download aria-hidden size={14} />JSON</Link>
      </>
    );
    content = (
      <TableCard search={{ q: query.q, placeholder: "Search actor, target, action or reason…" }} actions={actions} total={total} page={page} size={query.size} href={pageLinks(BASE, current, defaults, fixed)} noun="entry"
        filters={[
          { name: "period", label: "Period", value: query.filters.period, options: [{ value: "all", label: "All time" }, ...Object.keys(PERIODS).map((value) => ({ value, label: periodLabel[value] }))] },
          { name: "action", label: "Action", value: query.filters.action, options: [{ value: "all", label: "All actions" }, ...actionNames.map((value) => ({ value, label: value }))] },
          { name: "role", label: "Actor type", value: query.filters.role, options: [{ value: "all", label: "All actors" }, ...ROLES.map((value) => ({ value, label: value.charAt(0) + value.slice(1).toLowerCase() }))] },
        ]}>
        <AuditTable rows={rows} now={now} sorts={sortLinks(BASE, sorts, current, defaults, fixed, ["when"])} filtered={Boolean(query.q) || Object.values(query.filters).some((value) => value !== "all")} />
      </TableCard>
    );
  } else if (tab === "sessions") {
    content = <SessionsTable />;
  } else {
    const sorts = ["name", "scope", "status", "created"] as const;
    const defaults = { sort: "created", dir: "desc" as SortDir };
    const query = parseTableQuery(params, { sorts, defaultSort: "created", defaultDir: "desc", filters: { status: ["enabled", "disabled"] } });
    const [sinks, organizations, deadLetterCounts] = await Promise.all([
      database.selectFrom("auditSinks").selectAll().execute(),
      database.selectFrom("organizations").select(["id", "name"]).orderBy("name").execute(),
      database.selectFrom("auditDeliveryJobs").select(["sinkId"]).select(({ fn }) => fn.countAll<number>().as("count")).where("status", "=", "DEAD_LETTER").groupBy("sinkId").execute(),
    ]);
    const orgNames = new Map(organizations.map((organization) => [organization.id, organization.name]));
    const dead = new Map(deadLetterCounts.map((entry) => [entry.sinkId, Number(entry.count)]));
    const all: SinkRow[] = sinks.map((sink) => ({ id: sink.id, name: sink.name, scope: sink.orgId ? orgNames.get(sink.orgId) ?? "Purged organization" : "Platform", host: new URL(sink.url).host, enabled: sink.enabled, deadLetters: dead.get(sink.id) ?? 0, createdAt: sink.createdAt.toISOString() }));
    const result = applyTableQuery(all, query, {
      search: (sink) => `${sink.name} ${sink.host} ${sink.scope}`,
      sortKey: (sink, sort) => sort === "scope" ? sink.scope : sort === "status" ? Number(sink.enabled) : sort === "created" ? new Date(sink.createdAt).getTime() : sink.name,
      filter: (sink, _name, value) => (value === "enabled") === sink.enabled,
    });
    const current = { ...query, page: result.page };
    const fixed = { tab: "sinks" };
    content = (
      <div className="space-y-4">
        {canManage && (
          <details className="group rounded-card border border-line bg-surface shadow-card open:pb-1" open={sinkTotal === 0}>
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
              Add a SIEM sink
              <span className="ml-auto text-xs font-normal text-ink-dim group-open:hidden">Forward sealed audit entries over signed HTTPS</span>
            </summary>
            <div className="px-4 pb-4 pt-1">
            <PlatformActionForm action={createAuditSink} successMessage="Audit sink created" className="grid gap-4 sm:grid-cols-2" messageClassName="sm:col-span-2">
              <Field label="Sink name" htmlFor="sink-name" required>
                <Input id="sink-name" name="name" maxLength={INPUT_LIMITS.name} placeholder="Sink name" required />
              </Field>
              <Field label="Endpoint URL" htmlFor="sink-url" required>
                <Input id="sink-url" name="url" maxLength={INPUT_LIMITS.url} type="url" placeholder="https://siem.example/events" required />
              </Field>
              <Field label="HMAC signing secret" htmlFor="sink-secret" required hint="At least 32 characters.">
                <Input id="sink-secret" name="secret" maxLength={INPUT_LIMITS.secret} type="password" minLength={32} placeholder="HMAC signing secret (32+ characters)" required />
              </Field>
              <Field label="Audit sink organization" htmlFor="sink-org">
                <Select id="sink-org" name="orgId">
                  <option value="">Platform audit</option>
                  {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
                </Select>
              </Field>
              <div className="flex justify-end sm:col-span-2">
                <Button type="submit">
                  Add sink
                </Button>
              </div>
            </PlatformActionForm>
            </div>
          </details>
        )}
        <TableCard search={{ q: query.q, placeholder: "Search sinks…" }} total={result.total} page={result.page} size={query.size} href={pageLinks(BASE, current, defaults, fixed)} noun="sink"
          filters={[{ name: "status", label: "Status", value: query.filters.status, options: [{ value: "all", label: "All statuses" }, { value: "enabled", label: "Enabled" }, { value: "disabled", label: "Disabled" }] }]}>
          <SinksTable rows={result.rows} canManage={canManage} sorts={sortLinks(BASE, sorts, current, defaults, fixed, ["created"])} filtered={Boolean(query.q) || query.filters.status !== "all"} />
        </TableCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit"
        description="Append-only app logs of operator, authentication, support, lifecycle and worker job activity, the SIEM sinks that receive them, and the sessions signed in to your account."
        icon={ScrollText}
        hue="violet"
      />
      <SectionTabs label="Audit" active={tab} tabs={[
        { id: "log", label: "App Logs", icon: ScrollText, href: BASE, count: entryTotal },
        { id: "sinks", label: "SIEM sinks", icon: Webhook, href: `${BASE}?tab=sinks`, count: sinkTotal },
        { id: "sessions", label: "Active Session", icon: MonitorSmartphone, href: `${BASE}?tab=sessions` },
      ]} />
      {content}
    </div>
  );
}
