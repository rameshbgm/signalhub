import { Activity, Ban, CheckCheck, CheckCircle2, ClipboardCheck, Cpu, Hourglass, Inbox, ListChecks, Mail, Send, Terminal } from "lucide-react";
import { database } from "@/lib/postgres/client";
import { requirePlatformPageCapability } from "@/lib/platform-page-guard";
import { hasPlatformCapability } from "@/lib/platform-policy";
import {
  inspectMigrationState,
  LATEST_MIGRATION_ID,
  migrationIssueSummary,
} from "@/lib/migrations";
import { verifySmtp } from "@/lib/smtp";
import { retryPlatformJob } from "@/app/platform/(protected)/orgs/actions";
import { retryNotificationDelivery, updatePlatformRetention } from "./actions";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { PlatformSubmitButton } from "@/components/platform/PlatformSubmitButton";
import { effectiveRetention, RETENTION_BOUNDS } from "@/lib/retention";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { IconTile } from "@/components/ui/icon-tile";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlatformStat } from "@/components/platform/PlatformStat";
import { INPUT_LIMITS } from "@/lib/input-limits";

export default async function PlatformOperationsPage() {
  const actor = await requirePlatformPageCapability("operations.read");
  // eslint-disable-next-line react-hooks/purity
  const renderedAt = Date.now();
  const [
    workers,
    platformJobs,
    deadLetterJobs,
    deadLetterCount,
    migrationState,
    queued,
    processing,
    blocked,
    delivered,
    smtp,
  ] = await Promise.all([
    database.selectFrom("workerHeartbeats").selectAll().orderBy("lastSeenAt", "desc").limit(20).execute(),
    database.selectFrom("platformJobs").selectAll().orderBy("createdAt", "desc").limit(100).execute(),
    database.selectFrom("notificationJobs").selectAll().where("status", "=", "DEAD_LETTER")
      .orderBy("updatedAt", "desc").limit(50).execute(),
    countNotificationJobs("DEAD_LETTER"),
    inspectMigrationState(),
    countNotificationJobs("PENDING"),
    countNotificationJobs("PROCESSING"),
    countNotificationJobs("BLOCKED"),
    countNotificationJobs("SENT"),
    verifySmtp(),
  ]);
  const canRetry = hasPlatformCapability(actor.role, "operations.retry");
  const platformRetention = await effectiveRetention(null);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Operations"
        description="Runtime and durable queue visibility. Only safe, idempotent retry operations are exposed."
        icon={Activity}
        hue="violet"
      />

      <section aria-label="Runtime summary" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <PlatformStat label="Queued deliveries" value={queued} icon={Send} />
        <PlatformStat label="Processing" value={processing} icon={Hourglass} />
        <PlatformStat label="Blocked by freeze" value={blocked} icon={Ban} tone={blocked ? "warn" : "normal"} />
        <PlatformStat label="Delivered" value={delivered} icon={CheckCheck} />
        <PlatformStat label="Dead-letter" value={deadLetterCount} icon={Inbox} tone={deadLetterCount ? "danger" : "normal"} />
        <PlatformStat
          label={`Migrations (${migrationState.verifiedCount}/${migrationState.expectedCount})`}
          value={migrationState.current ? "Current" : "Required"}
          icon={ClipboardCheck}
          tone={migrationState.current ? "normal" : "danger"}
        />
        <PlatformStat label="SMTP" value={!smtp.configured ? "Not configured" : smtp.ok ? "Reachable" : "Unavailable"} icon={Mail} tone={!smtp.configured ? "warn" : smtp.ok ? "normal" : "danger"} />
        <PlatformStat label="Workers seen" value={workers.length} icon={Cpu} />
      </section>

      {!migrationState.current && (
        <Alert tone="danger" title="Migration state requires deployment attention">
          {migrationIssueSummary(migrationState)}. Run the migration CLI from your deployment
          environment; migrations cannot be executed from this console.
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Platform jobs</CardTitle>
          <CardDescription>
            Organization purges are leased, retryable, and leave durable job and tombstone records.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {platformJobs.length === 0 ? (
            <EmptyState icon={ListChecks} hue="violet" title="No platform jobs yet" description="No platform jobs have been queued." className="border-0 bg-transparent py-8" />
          ) : (
            <ul className="space-y-2">
              {platformJobs.map((job) => (
                <li key={job.id} className="rounded-control border border-line px-3.5 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-ink">Purge <span className="font-mono text-sm">{job.organizationSlug}</span></p>
                        <StatusBadge tone={JOB_TONE[job.status] ?? "warn"}>{titleCase(job.status)}</StatusBadge>
                      </div>
                      <p className="mt-1 text-xs text-ink-dim">
                        Attempt {job.attempts}/{job.maxAttempts} · queued {job.createdAt.toLocaleString()}
                      </p>
                      <p className="mt-2 text-sm text-ink-soft">{job.reason}</p>
                      {job.lastError && <p className="mt-2 text-sm text-danger-fg">{job.lastError}</p>}
                    </div>
                    {canRetry &&
                      job.status === "FAILED" &&
                      job.attempts >= job.maxAttempts && (
                      <PlatformActionForm
                        action={retryPlatformJob.bind(null, job.id)}
                        successMessage="Platform job queued for retry."
                        className="flex items-end gap-3 sm:shrink-0"
                      >
                        <Field label="Retry reason" htmlFor={`job-retry-${job.id}`} className="min-w-48 flex-1 sm:w-56 sm:flex-none">
                          <Input
                            id={`job-retry-${job.id}`}
                            name="reason" maxLength={INPUT_LIMITS.reason}
                            minLength={10}
                            required
                            placeholder="Retry reason"
                          />
                        </Field>
                        <PlatformSubmitButton pendingLabel="Queueing…" variant="secondary">
                          Retry
                        </PlatformSubmitButton>
                      </PlatformActionForm>
                      )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dead-letter deliveries</CardTitle>
          <CardDescription>
            Terminal delivery failures do not count as transient health failures. Retry resets the bounded attempt counter.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {deadLetterJobs.length === 0 ? (
            <EmptyState icon={CheckCircle2} hue="emerald" title="No terminal delivery failures" description="Deliveries that exhaust their retries will appear here." className="border-0 bg-transparent py-8" />
          ) : (
            <ul className="space-y-2">
              {deadLetterJobs.map((job) => (
                <li key={job.id} className="rounded-control border border-line px-3.5 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{job.subject}</p>
                      <p className="mt-1 text-xs text-ink-dim">
                        {job.channel} · {redactContact(job.contact)} · {job.attempts} attempts
                      </p>
                      <p className="mt-2 text-sm text-danger-fg">{job.lastError ?? "Delivery exhausted"}</p>
                    </div>
                    {canRetry && (
                      <PlatformActionForm
                        action={retryNotificationDelivery.bind(null, job.id)}
                        successMessage="Notification delivery queued for retry."
                        className="flex items-end gap-3 sm:shrink-0"
                      >
                        <Field label="Retry reason" htmlFor={`delivery-retry-${job.id}`} className="min-w-48 flex-1 sm:w-56 sm:flex-none">
                          <Input
                            id={`delivery-retry-${job.id}`}
                            name="reason" maxLength={INPUT_LIMITS.reason}
                            minLength={10}
                            required
                            placeholder="Retry reason"
                          />
                        </Field>
                        <PlatformSubmitButton pendingLabel="Queueing…" variant="secondary">Retry</PlatformSubmitButton>
                      </PlatformActionForm>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Worker heartbeats</CardTitle>
          <CardDescription>The 20 most recent workers, newest first. A worker is healthy when it reports ready within 30 seconds.</CardDescription>
        </CardHeader>
        {workers.length === 0 ? (
          <EmptyState icon={Cpu} hue="violet" title="No worker heartbeats yet" description="No worker heartbeat has been recorded." className="border-0 bg-transparent py-8" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Worker</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Last heartbeat</TableHead>
                <TableHead className="max-md:hidden">Loop / error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workers.map((worker) => {
                const fresh = worker.lastSeenAt > new Date(renderedAt - 30_000);
                const loop = worker.lastError ?? (worker.lastLoopAt ? `loop ${worker.lastLoopAt.toLocaleString()}` : "No loop telemetry yet");
                return (
                  <TableRow key={worker.id}>
                    <TableCell className="text-ink">
                      <span className="break-all font-mono text-xs">{worker.workerId}</span>
                      <p className="mt-1 text-xs text-ink-dim md:hidden">{loop}</p>
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={fresh && worker.status === "READY" ? "ok" : "danger"}>{titleCase(worker.status)}</StatusBadge>
                    </TableCell>
                    <TableCell className="text-xs">{worker.lastSeenAt.toLocaleString()}</TableCell>
                    <TableCell className="text-xs max-md:hidden">{loop}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card>
        <CardContent className="flex items-start gap-4">
          <IconTile icon={Terminal} hue="slate" />
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight text-ink">Deployment-owned operations</h2>
            <p className="mt-1 text-sm leading-6 text-ink-soft">
              Database backups, restore drills, process restarts, secret rotation, and migration execution are intentionally read-only here. Current expected migration: <code className="rounded-chip bg-sunken px-1.5 py-0.5 font-mono text-xs text-ink">{LATEST_MIGRATION_ID}</code>. Use your deployment runbook and CLI so infrastructure permissions remain outside the web process.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Platform retention defaults</CardTitle>
          <CardDescription>Organizations may override these values within the displayed hard bounds.</CardDescription>
        </CardHeader>
        <CardContent>
          {canRetry ? (
            <PlatformActionForm action={updatePlatformRetention} successMessage="Retention defaults updated" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(RETENTION_BOUNDS).map(([key, bounds]) => (
                <Field key={key} label={retentionLabel(key)} htmlFor={`retention-${key}`} hint={`${bounds.min} to ${bounds.max} days`}>
                  <Input id={`retention-${key}`} type="number" name={key} min={bounds.min} max={bounds.max} defaultValue={platformRetention[key as keyof typeof platformRetention]} />
                </Field>
              ))}
              <div className="flex justify-end sm:col-span-2 lg:col-span-4">
                <PlatformSubmitButton pendingLabel="Saving…">Save defaults</PlatformSubmitButton>
              </div>
            </PlatformActionForm>
          ) : (
            <pre className="overflow-auto rounded-control bg-sunken p-4 font-mono text-xs text-ink-soft">{JSON.stringify(platformRetention, null, 2)}</pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const JOB_TONE: Record<string, StatusTone> = { SUCCEEDED: "ok", FAILED: "danger", PROCESSING: "info", QUEUED: "warn", CANCELLED: "neutral" };

function titleCase(value: string) {
  const text = value.replaceAll("_", " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function retentionLabel(key: string) {
  const words = key.replace(/Days$/, "").replace(/([A-Z])/g, " $1").trim().toLowerCase();
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} (days)`;
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

async function countNotificationJobs(status: "PENDING" | "PROCESSING" | "BLOCKED" | "SENT" | "DEAD_LETTER") {
  const row = await database.selectFrom("notificationJobs")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .where("status", "=", status).executeTakeFirstOrThrow();
  return Number(row.count);
}
