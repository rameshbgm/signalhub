import { collections } from "@/lib/db";
import { requirePlatformCapability } from "@/lib/admin-guard";
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

export default async function PlatformOperationsPage() {
  const actor = await requirePlatformCapability("operations.read");
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
    collections.workerHeartbeats().find().sort({ lastSeenAt: -1 }).limit(20).toArray(),
    collections.platformJobs().find().sort({ createdAt: -1 }).limit(100).toArray(),
    collections
      .notificationJobs()
      .find({ status: "DEAD_LETTER" })
      .sort({ updatedAt: -1 })
      .limit(50)
      .toArray(),
    collections.notificationJobs().countDocuments({ status: "DEAD_LETTER" }),
    inspectMigrationState(),
    collections.notificationJobs().countDocuments({ status: "PENDING" }),
    collections.notificationJobs().countDocuments({ status: "PROCESSING" }),
    collections.notificationJobs().countDocuments({ status: "BLOCKED" }),
    collections.notificationJobs().countDocuments({ status: "SENT" }),
    verifySmtp(),
  ]);
  const canRetry = hasPlatformCapability(actor.role, "operations.retry");
  const platformRetention = await effectiveRetention(null);

  return (
    <div className="max-w-6xl space-y-8">
      <div>
        <h1 className="font-mono text-2xl font-semibold text-[var(--fg)]">Operations</h1>
        <p className="mt-1 text-sm text-[var(--fg-soft)]">
          Runtime and durable queue visibility. Only safe, idempotent retry operations are exposed.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Summary label="Queued deliveries" value={queued} />
        <Summary label="Processing" value={processing} />
        <Summary label="Blocked by freeze" value={blocked} tone={blocked ? "warning" : "normal"} />
        <Summary label="Delivered" value={delivered} />
        <Summary label="Dead-letter" value={deadLetterCount} tone={deadLetterCount ? "error" : "normal"} />
        <Summary
          label={`Migrations (${migrationState.verifiedCount}/${migrationState.expectedCount})`}
          value={migrationState.current ? "Current" : "Required"}
          tone={migrationState.current ? "normal" : "error"}
        />
        <Summary label="SMTP" value={!smtp.configured ? "Not configured" : smtp.ok ? "Reachable" : "Unavailable"} tone={!smtp.configured ? "warning" : smtp.ok ? "normal" : "error"} />
        <Summary label="Workers seen" value={workers.length} />
      </section>

      {!migrationState.current && (
        <section
          role="alert"
          className="border border-[var(--red)]/40 bg-[var(--red-soft)] p-4"
        >
          <h2 className="font-mono text-sm font-semibold text-[var(--fg)]">
            Migration state requires deployment attention
          </h2>
          <p className="mt-2 text-xs text-[var(--fg-soft)]">
            {migrationIssueSummary(migrationState)}. Run the migration CLI from your deployment
            environment; migrations cannot be executed from this console.
          </p>
        </section>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="font-mono text-lg font-semibold text-[var(--fg)]">Platform jobs</h2>
          <p className="mt-1 text-xs text-[var(--fg-soft)]">
            Organization purges are leased, retryable, and leave durable job and tombstone records.
          </p>
        </div>
        <div className="space-y-2">
          {platformJobs.map((job) => (
            <article key={job._id.toHexString()} className="border border-[var(--line)] bg-[var(--surface)] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-[var(--fg)]">Purge {job.organizationSlug}</p>
                    <JobState value={job.status} />
                  </div>
                  <p className="mt-1 text-xs text-[var(--fg-dim)]">
                    attempt {job.attempts}/{job.maxAttempts} · queued {job.createdAt.toLocaleString()}
                  </p>
                  <p className="mt-2 text-xs text-[var(--fg-soft)]">{job.reason}</p>
                  {job.lastError && <p className="mt-2 text-xs text-[var(--red)]">{job.lastError}</p>}
                </div>
                {canRetry &&
                  job.status === "FAILED" &&
                  job.attempts >= job.maxAttempts && (
                  <PlatformActionForm
                    action={retryPlatformJob.bind(null, job._id.toHexString())}
                    successMessage="Platform job queued for retry."
                    className="flex flex-wrap gap-2"
                  >
                    <input
                      name="reason"
                      minLength={10}
                      required
                      placeholder="Retry reason"
                      className="w-40 border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-xs"
                    />
                    <PlatformSubmitButton pendingLabel="Queueing…" className="border border-[var(--amber)]/40 px-3 py-1.5 text-xs font-semibold text-[var(--amber)]">
                      Retry
                    </PlatformSubmitButton>
                  </PlatformActionForm>
                  )}
              </div>
            </article>
          ))}
          {platformJobs.length === 0 && <Empty text="No platform jobs have been queued." />}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-mono text-lg font-semibold text-[var(--fg)]">Dead-letter deliveries</h2>
          <p className="mt-1 text-xs text-[var(--fg-soft)]">
            Terminal delivery failures do not count as transient health failures. Retry resets the bounded attempt counter.
          </p>
        </div>
        <div className="space-y-2">
          {deadLetterJobs.map((job) => (
            <article key={job._id.toHexString()} className="border border-[var(--line)] bg-[var(--surface)] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold text-[var(--fg)]">{job.subject}</p>
                  <p className="mt-1 text-xs text-[var(--fg-dim)]">
                    {job.channel} · {redactContact(job.contact)} · {job.attempts} attempts
                  </p>
                  <p className="mt-2 text-xs text-[var(--red)]">{job.lastError ?? "Delivery exhausted"}</p>
                </div>
                {canRetry && (
                  <PlatformActionForm
                    action={retryNotificationDelivery.bind(null, job._id.toHexString())}
                    successMessage="Notification delivery queued for retry."
                    className="flex flex-wrap gap-2"
                  >
                    <input
                      name="reason"
                      minLength={10}
                      required
                      placeholder="Retry reason"
                      className="w-40 border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-xs"
                    />
                    <PlatformSubmitButton pendingLabel="Queueing…" className="border border-[var(--amber)]/40 px-3 py-1.5 text-xs font-semibold text-[var(--amber)]">Retry</PlatformSubmitButton>
                  </PlatformActionForm>
                )}
              </div>
            </article>
          ))}
          {deadLetterJobs.length === 0 && <Empty text="No terminal delivery failures." />}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-mono text-lg font-semibold text-[var(--fg)]">Worker heartbeats</h2>
        <div className="overflow-x-auto border border-[var(--line)] bg-[var(--surface)]">
          <table className="w-full min-w-[650px] text-left text-xs">
            <thead className="border-b border-[var(--line)] bg-[var(--bg)] font-mono text-[10px] uppercase tracking-wide text-[var(--fg-dim)]">
              <tr><th className="px-4 py-3">Worker</th><th className="px-4 py-3">State</th><th className="px-4 py-3">Last heartbeat</th><th className="px-4 py-3">Loop / error</th></tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {workers.map((worker) => {
                const fresh = worker.lastSeenAt > new Date(renderedAt - 30_000);
                return (
                  <tr key={worker._id.toHexString()}>
                    <td className="px-4 py-3 font-mono text-[var(--fg)]">{worker.workerId}</td>
                    <td className={`px-4 py-3 font-semibold ${fresh && worker.status === "READY" ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{worker.status}</td>
                    <td className="px-4 py-3 text-[var(--fg-soft)]">{worker.lastSeenAt.toLocaleString()}</td>
                    <td className="px-4 py-3 text-[var(--fg-soft)]">{worker.lastError ?? (worker.lastLoopAt ? `loop ${worker.lastLoopAt.toLocaleString()}` : "No loop telemetry yet")}</td>
                  </tr>
                );
              })}
              {workers.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-[var(--fg-dim)]">No worker heartbeat has been recorded.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="border border-[var(--line)] bg-[var(--surface)] p-4">
        <h2 className="font-mono text-sm font-semibold text-[var(--fg)]">Deployment-owned operations</h2>
        <p className="mt-2 text-xs leading-5 text-[var(--fg-soft)]">
          Database backups, restore drills, process restarts, secret rotation, and migration execution are intentionally read-only here. Current expected migration: <code className="text-[var(--cyan)]">{LATEST_MIGRATION_ID}</code>. Use your deployment runbook and CLI so infrastructure permissions remain outside the web process.
        </p>
      </section>
      <section className="border border-[var(--line)] bg-[var(--surface)] p-4">
        <h2 className="font-mono text-sm font-semibold">Platform retention defaults</h2>
        <p className="mt-1 text-xs text-[var(--fg-dim)]">Organizations may override these values within the displayed hard bounds.</p>
        {canRetry ? (
          <PlatformActionForm action={updatePlatformRetention} successMessage="Retention defaults updated" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {Object.entries(RETENTION_BOUNDS).map(([key, bounds]) => (
              <label key={key} className="text-[10px] text-[var(--fg-soft)]">
                {key.replace(/([A-Z])/g, " $1")}
                <input type="number" name={key} min={bounds.min} max={bounds.max} defaultValue={platformRetention[key as keyof typeof platformRetention]} className="mt-1 w-full border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-xs" />
              </label>
            ))}
            <PlatformSubmitButton pendingLabel="Saving…" className="bg-[var(--cyan)] px-3 py-2 text-xs font-semibold text-[var(--on-cyan)] sm:col-span-2 lg:col-span-5">Save defaults</PlatformSubmitButton>
          </PlatformActionForm>
        ) : (
          <pre className="mt-3 text-xs">{JSON.stringify(platformRetention, null, 2)}</pre>
        )}
      </section>
    </div>
  );
}

function Summary({ label, value, tone = "normal" }: { label: string; value: string | number; tone?: "normal" | "warning" | "error" }) {
  const color = tone === "error" ? "var(--red)" : tone === "warning" ? "var(--amber)" : "var(--cyan)";
  return <div className="border border-[var(--line)] bg-[var(--surface)] p-3"><p className="text-xs text-[var(--fg-dim)]">{label}</p><p className="mt-2 font-mono text-lg font-semibold" style={{ color }}>{value}</p></div>;
}

function JobState({ value }: { value: string }) {
  const color = value === "SUCCEEDED" ? "text-[var(--green)]" : value === "FAILED" ? "text-[var(--red)]" : "text-[var(--amber)]";
  return <span className={`bg-[var(--bg)] px-2 py-0.5 text-[10px] font-semibold ${color}`}>{value}</span>;
}

function Empty({ text }: { text: string }) {
  return <p className="border border-[var(--line)] bg-[var(--surface)] p-4 text-sm text-[var(--fg-dim)]">{text}</p>;
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
