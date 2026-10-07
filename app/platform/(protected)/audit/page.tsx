import { database } from "@/lib/postgres/client";
import { Select } from "@/components/ui/select";
import { requirePlatformPageCapability } from "@/lib/platform-page-guard";
import Link from "next/link";
import { ArrowRight, Download, Funnel, Plus, ScrollText, Webhook } from "lucide-react";
import { hasPlatformCapability } from "@/lib/platform-policy";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { createAuditSink, setAuditSinkEnabled } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { INPUT_LIMITS } from "@/lib/input-limits";

export default async function PlatformAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; action?: string }>;
}) {
  const session = await requirePlatformPageCapability("audit.read");
  const parameters = await searchParams;
  const query = parameters.q?.trim() ?? "";
  const action = parameters.action?.trim() ?? "";
  let entriesQuery = database.selectFrom("platformAuditLogs").selectAll();
  if (query) {
    const pattern = `%${query}%`;
    entriesQuery = entriesQuery.where((expression) => expression.or([
      expression("actorEmail", "ilike", pattern),
      expression("targetId", "ilike", pattern),
      expression("reason", "ilike", pattern),
    ]));
  }
  if (action) entriesQuery = entriesQuery.where("action", "=", action);
  const entries = await entriesQuery.orderBy("createdAt", "desc").limit(300).execute();
  const organizationIds = entries
    .map((entry) => entry.organizationId)
    .filter((value): value is string => Boolean(value));
  const organizations = organizationIds.length
    ? await database.selectFrom("organizations").select(["id", "name"])
        .where("id", "in", organizationIds).execute()
    : [];
  const organizationNames = new Map(
    organizations.map((organization) => [organization.id, organization.name])
  );
  const [actionRows, sinks, sinkOrganizations, deadLetterCounts] = await Promise.all([
    database.selectFrom("platformAuditLogs").select("action").groupBy("action").execute(),
    database.selectFrom("auditSinks").selectAll().orderBy("createdAt", "desc").execute(),
    database.selectFrom("organizations").select(["id", "name"]).orderBy("name").execute(),
    database.selectFrom("auditDeliveryJobs").select(["sinkId"])
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("status", "=", "DEAD_LETTER").groupBy("sinkId").execute(),
  ]);
  const actions = actionRows.map((row) => row.action);
  const canManage = hasPlatformCapability(session.role, "audit.manage");
  const sinkOrgNames = new Map(sinkOrganizations.map((org) => [org.id, org.name]));
  const deadLetters = new Map(deadLetterCounts.map((entry) => [entry.sinkId, Number(entry.count)]));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Platform audit"
        description="Append-only operator, authentication, support, lifecycle, and worker job evidence."
        icon={ScrollText}
        hue="violet"
        actions={
          <>
            <Link href="/api/platform/audit/export?format=csv" className={buttonVariants({ variant: "secondary" })}>
              <Download aria-hidden size={16} />
              Export CSV
            </Link>
            <Link href="/api/platform/audit/export?format=json" className={buttonVariants({ variant: "secondary" })}>
              <Download aria-hidden size={16} />
              Export JSON
            </Link>
          </>
        }
      />

      <Card>
        <CardContent>
          <form className="grid items-end gap-4 sm:grid-cols-[1fr_16rem_auto]">
            <Field label="Search audit" htmlFor="audit-search">
              <Input
                id="audit-search"
                name="q"
                defaultValue={query}
                placeholder="Actor, target ID, or reason"
              />
            </Field>
            <Field label="Filter by action" htmlFor="audit-action">
              <Select id="audit-action" name="action" defaultValue={action}>
                <option value="">All actions</option>
                {actions.sort().map((value) => <option key={value} value={value}>{value}</option>)}
              </Select>
            </Field>
            <Button type="submit" variant="secondary">
              <Funnel aria-hidden size={16} />
              Filter
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>External SIEM sinks</CardTitle>
          <CardDescription>
            Sealed audit entries are delivered by the worker over signed HTTPS with retries and dead-letter visibility.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {canManage && (
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
                  {sinkOrganizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
                </Select>
              </Field>
              <div className="flex justify-end sm:col-span-2">
                <Button type="submit">
                  <Plus aria-hidden size={16} />
                  Add sink
                </Button>
              </div>
            </PlatformActionForm>
          )}

          {sinks.length ? (
            <ul className="space-y-2">
              {sinks.map((sink) => (
                <li key={sink.id} className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line px-3.5 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-ink">{sink.name}</p>
                      <StatusBadge tone={sink.enabled ? "ok" : "neutral"}>{sink.enabled ? "Enabled" : "Disabled"}</StatusBadge>
                    </div>
                    <p className="mt-1 text-xs text-ink-dim">{sink.orgId ? sinkOrgNames.get(sink.orgId) ?? "Purged organization" : "Platform"} · <span className="font-mono">{new URL(sink.url).host}</span></p>
                    {deadLetters.get(sink.id) ? <p className="mt-1 text-xs font-medium text-danger-fg">{deadLetters.get(sink.id)} dead-letter deliveries</p> : null}
                  </div>
                  {canManage && (
                    <PlatformActionForm action={setAuditSinkEnabled.bind(null, sink.id)} successMessage={sink.enabled ? "Sink disabled" : "Sink enabled"}>
                      <input type="hidden" name="enabled" value={String(!sink.enabled)} />
                      <Button type="submit" variant="outline" size="sm">{sink.enabled ? "Disable" : "Enable"}</Button>
                    </PlatformActionForm>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Webhook} hue="violet" title="No external audit sinks configured" description="Add a sink to forward sealed audit entries to your SIEM." className="py-8" />
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Audit log</CardTitle>
          <CardDescription>Showing {entries.length} entr{entries.length === 1 ? "y" : "ies"}, newest first.</CardDescription>
        </CardHeader>
        {entries.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            hue="violet"
            title={query || action ? "No audit entries match these filters" : "No audit entries yet"}
            description={query || action ? "Clear the filters to see all platform activity." : "Operator actions are recorded here as they happen."}
            action={query || action ? <Link href="/organization/platform/audit" className={buttonVariants({ variant: "secondary" })}>Clear filters</Link> : undefined}
            className="border-0 bg-transparent py-12"
          />
        ) : (
          <Table className="min-w-[44rem]">
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Actor and target</TableHead>
                <TableHead>Reason and details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id} className="align-top">
                  <TableCell className="whitespace-nowrap text-xs">
                    <time dateTime={entry.createdAt.toISOString()}>{entry.createdAt.toLocaleString()}</time>
                  </TableCell>
                  <TableCell>
                    <p className="break-all font-mono text-xs font-medium text-ink">{entry.action}</p>
                    <Badge className="mt-1.5">{entry.actorRole}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    <p className="break-all text-ink">{entry.actorEmail}</p>
                    <p className="mt-1 flex items-start gap-1 text-ink-soft">
                      <ArrowRight aria-hidden size={12} className="mt-0.5 shrink-0" />
                      <span className="break-all font-mono">{entry.targetType}:{entry.targetId}</span>
                    </p>
                    {entry.organizationId && (
                      <p className="mt-1 text-ink-dim">
                        Organization: {organizationNames.get(entry.organizationId) ?? `${entry.organizationId} (purged)`}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    {entry.reason && <p className="text-sm text-ink">{entry.reason}</p>}
                    {hasMetadata(entry.metadata) && (
                      <details className={entry.reason ? "mt-2" : undefined}>
                        <summary className="w-fit cursor-pointer rounded-chip text-xs font-medium text-primary-ink outline-none focus-visible:ring-4 focus-visible:ring-primary/25">Metadata</summary>
                        <pre className="mt-2 max-h-56 overflow-auto rounded-control bg-sunken p-3 font-mono text-2xs text-ink-soft">
                          {JSON.stringify(entry.metadata, null, 2)}
                        </pre>
                      </details>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function hasMetadata(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && Object.keys(value).length > 0);
}
