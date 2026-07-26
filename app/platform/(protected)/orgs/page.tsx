import { collections, db } from "@/lib/db";
import {
  suspendOrg,
  unsuspendOrg,
  deleteOrgAsPlatform,
  cancelOrganizationPurge,
} from "./actions";
import { requirePlatformCapability } from "@/lib/admin-guard";
import {
  inspectMigrationState,
  LATEST_MIGRATION_ID,
  migrationIssueSummary,
} from "@/lib/migrations";
import { verifySmtp } from "@/lib/smtp";
import { oidcConfigured } from "@/lib/oidc";
import { CreateOrganizationForm } from "@/components/platform/CreateOrganizationForm";
import { hasPlatformCapability } from "@/lib/platform-policy";
import { organizationStatus } from "@/lib/organization-state";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { PlatformSubmitButton } from "@/components/platform/PlatformSubmitButton";
import { organizationPurgeCanBeCancelled } from "@/lib/platform-job-policy";
import { SwitchOrganizationButton } from "@/components/platform/SwitchOrganizationButton";

export default async function PlatformOrgsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; q?: string }>;
}) {
  const actor = await requirePlatformCapability("organizations.read");
  const query = (await searchParams).q?.trim() ?? "";
  // eslint-disable-next-line react-hooks/purity
  const renderedAt = Date.now();
  const databaseOk = await db
    .command({ ping: 1 }, { timeoutMS: 2_000 })
    .then(() => true)
    .catch(() => false);
  const [migrationState, latestHeartbeat, deadLetters, queuedDeliveries, smtp] =
    await Promise.all([
      inspectMigrationState(),
      collections.workerHeartbeats().find().sort({ lastSeenAt: -1 }).limit(1).next(),
      collections.notificationJobs().countDocuments({ status: "DEAD_LETTER" }),
      collections
        .notificationJobs()
        .countDocuments({ status: { $in: ["PENDING", "PROCESSING"] } }),
      verifySmtp(),
    ]);
  const orgDocs = await collections
    .organizations()
    .find(
      query
        ? {
            $or: [
              { name: { $regex: query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
              { slug: { $regex: query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
              {
                contactEmail: {
                  $regex: query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                  $options: "i",
                },
              },
            ],
          }
        : {}
    )
    .sort({ createdAt: -1 })
    .limit(200)
    .toArray();
  const memberships = orgDocs.length
    ? await collections
        .memberships()
        .find({ orgId: { $in: orgDocs.map((organization) => organization._id) } })
        .toArray()
    : [];
  const purgeJobs = orgDocs.length
    ? await collections
        .platformJobs()
        .find({
          organizationId: { $in: orgDocs.map((organization) => organization._id) },
          type: "PURGE_ORGANIZATION",
        })
        .sort({ createdAt: -1 })
        .toArray()
    : [];
  const latestPurgeJobByOrganization = new Map<string, (typeof purgeJobs)[number]>();
  for (const job of purgeJobs) {
    const organizationId = job.organizationId.toHexString();
    if (!latestPurgeJobByOrganization.has(organizationId)) {
      latestPurgeJobByOrganization.set(organizationId, job);
    }
  }
  const canCreate = hasPlatformCapability(actor.role, "organizations.create");
  const canSuspend = hasPlatformCapability(actor.role, "organizations.suspend");
  const canPurge = hasPlatformCapability(actor.role, "organizations.purge");

  return (
    <div className="max-w-6xl space-y-8">
      <section aria-labelledby="instance-health-title" className="space-y-3">
        <div>
          <h1
            id="instance-health-title"
            className="font-mono text-2xl font-semibold text-[var(--fg)]"
          >
            Organizations
          </h1>
          <p className="mt-1 text-sm text-[var(--fg-soft)]">
            Provision, open, freeze, and queue tenant purges with durable audit records.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <HealthCard label="Database" state={databaseOk ? "ok" : "error"} detail={databaseOk ? "reachable" : "unavailable"} />
          <HealthCard
            label="Migrations"
            state={migrationState.current ? "ok" : "error"}
            detail={
              migrationState.current
                ? `${migrationState.verifiedCount}/${migrationState.expectedCount} verified · ${LATEST_MIGRATION_ID}`
                : migrationIssueSummary(migrationState)
            }
          />
          <HealthCard
            label="Worker"
            state={
              latestHeartbeat &&
              latestHeartbeat.status === "READY" &&
              latestHeartbeat.lastSeenAt > new Date(renderedAt - 30_000)
                ? "ok"
                : "error"
            }
            detail={
              latestHeartbeat
                ? `${latestHeartbeat.status.toLowerCase()} · ${relativeTime(latestHeartbeat.lastSeenAt, renderedAt)}`
                : "no heartbeat"
            }
          />
          <HealthCard
            label="SMTP"
            state={!smtp.configured ? "neutral" : smtp.ok ? "ok" : "error"}
            detail={!smtp.configured ? "not configured" : smtp.ok ? "reachable" : smtp.error ?? "unavailable"}
          />
          <HealthCard label="OIDC" state="neutral" detail={oidcConfigured() ? "configured" : "optional · disabled"} />
          <HealthCard
            label="Delivery queue"
            state={deadLetters === 0 ? "ok" : "error"}
            detail={`${queuedDeliveries} queued · ${deadLetters} dead-letter`}
          />
          <HealthCard
            label="Private targets"
            state="neutral"
            detail={process.env.MONITOR_ALLOW_PRIVATE_TARGETS === "true" ? "explicitly enabled" : "blocked"}
          />
        </div>
      </section>

      {canCreate && (
        <section className="space-y-3">
          <div>
            <h2 className="font-mono text-lg font-semibold text-[var(--fg)]">
              Provision organization
            </h2>
            <p className="mt-1 text-xs text-[var(--fg-soft)]">
              Creates an active tenant. Admins can open it immediately and add users from Users &amp; Roles.
            </p>
          </div>
          <CreateOrganizationForm />
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-mono text-lg font-semibold text-[var(--fg)]">Tenant directory</h2>
            <p className="mt-1 text-xs text-[var(--fg-soft)]">
              Showing {orgDocs.length} organization{orgDocs.length === 1 ? "" : "s"}.
            </p>
          </div>
          <form className="flex gap-2">
            <label className="sr-only" htmlFor="organization-search">Search organizations</label>
            <input
              id="organization-search"
              name="q"
              defaultValue={query}
              placeholder="Name, slug, or email"
              className="w-56 border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs"
            />
            <button className="border border-[var(--line)] px-3 py-2 text-xs font-semibold">Search</button>
          </form>
        </div>

        <div className="space-y-3">
          {orgDocs.map((organization) => {
            const id = organization._id.toHexString();
            const status = organizationStatus(organization);
            const purgeJob = latestPurgeJobByOrganization.get(id);
            const purgeCanBeCancelled =
              organizationPurgeCanBeCancelled(purgeJob);
            const orgMemberships = memberships.filter((membership) =>
              membership.orgId.equals(organization._id)
            );
            return (
              <article key={id} className="border border-[var(--line)] bg-[var(--surface)] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-[var(--fg)]">{organization.name}</h3>
                      <StatusPill status={status} />
                    </div>
                    <p className="mt-1 font-mono text-xs text-[var(--fg-dim)]">
                      {organization.slug} · {orgMemberships.length} membership{orgMemberships.length === 1 ? "" : "s"}
                    </p>
                    {organization.statusReason && status !== "ACTIVE" && (
                      <p className="mt-2 text-xs text-[var(--fg-soft)]">
                        Reason: {organization.statusReason}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <p className="text-xs text-[var(--fg-dim)]">Created {organization.createdAt.toLocaleDateString()}</p>
                    {status === "ACTIVE" && <SwitchOrganizationButton organizationId={id} />}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div className="border border-[var(--line)] bg-[var(--bg)] p-3 lg:col-span-2">
                    <p className="text-xs font-semibold text-[var(--fg)]">Lifecycle</p>
                    {status === "ACTIVE" && canSuspend && (
                      <PlatformActionForm
                        action={suspendOrg.bind(null, id)}
                        successMessage="Organization suspended."
                        className="mt-2 flex flex-wrap gap-2"
                      >
                        <input
                          name="reason"
                          minLength={10}
                          required
                          placeholder="Suspension reason"
                          className="min-w-44 flex-1 border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-xs"
                        />
                        <PlatformSubmitButton
                          pendingLabel="Suspending…"
                          confirmMessage={`Suspend ${organization.name} and freeze all tenant traffic and workers?`}
                          className="border border-[var(--amber)]/40 px-3 py-1.5 text-xs font-semibold text-[var(--amber)]"
                        >
                          Suspend
                        </PlatformSubmitButton>
                      </PlatformActionForm>
                    )}
                    {status === "SUSPENDED" && canSuspend && (
                      <PlatformActionForm
                        action={unsuspendOrg.bind(null, id)}
                        successMessage="Organization reactivated."
                        className="mt-2 flex flex-wrap gap-2"
                      >
                        <input
                          name="reason"
                          minLength={10}
                          required
                          placeholder="Reactivation reason"
                          className="min-w-44 flex-1 border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-xs"
                        />
                        <PlatformSubmitButton pendingLabel="Reactivating…" className="border border-[var(--green)]/40 px-3 py-1.5 text-xs font-semibold text-[var(--green)]">
                          Reactivate
                        </PlatformSubmitButton>
                      </PlatformActionForm>
                    )}
                    {status === "SUSPENDED" && canPurge && (
                      <details className="mt-3 border-t border-[var(--line)] pt-3">
                        <summary className="cursor-pointer text-xs font-semibold text-[var(--red)]">
                          Queue permanent purge
                        </summary>
                        <PlatformActionForm
                          action={deleteOrgAsPlatform.bind(null, id)}
                          successMessage="Organization purge queued."
                          className="mt-2 space-y-2"
                        >
                          <input
                            name="reason"
                            minLength={10}
                            required
                            placeholder="Purge reason / ticket"
                            className="w-full border border-[var(--red)]/30 bg-[var(--surface)] px-2 py-1.5 text-xs"
                          />
                          <div className="flex gap-2">
                            <input
                              name="confirmation"
                              required
                              pattern={organization.slug}
                              placeholder={`type ${organization.slug}`}
                              className="min-w-0 flex-1 border border-[var(--red)]/30 bg-[var(--surface)] px-2 py-1.5 text-xs"
                            />
                            <PlatformSubmitButton
                              pendingLabel="Queueing…"
                              confirmMessage={`Queue the permanent purge of ${organization.name}? This cannot be undone.`}
                              className="border border-[var(--red)]/40 px-3 py-1.5 text-xs font-semibold text-[var(--red)]"
                            >
                              Queue purge
                            </PlatformSubmitButton>
                          </div>
                        </PlatformActionForm>
                      </details>
                    )}
                    {status === "DELETING" && (
                      <div className="mt-2 space-y-2">
                        <p className="text-xs text-[var(--amber)]">
                          {purgeCanBeCancelled
                            ? "Purge queued but not started. Progress and retry controls are in Operations."
                            : "Purge cleanup has started and is irreversible. Progress and retry controls are in Operations."}
                        </p>
                        {canPurge && purgeCanBeCancelled && (
                          <PlatformActionForm
                            action={cancelOrganizationPurge.bind(null, id)}
                            successMessage="Queued organization purge cancelled."
                            className="flex flex-wrap gap-2"
                          >
                            <input
                              name="reason"
                              minLength={10}
                              required
                              placeholder="Cancellation reason"
                              className="min-w-44 flex-1 border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-xs"
                            />
                            <PlatformSubmitButton
                              pendingLabel="Cancelling…"
                              className="border border-[var(--green)]/40 px-3 py-1.5 text-xs font-semibold text-[var(--green)]"
                            >
                              Cancel queued purge
                            </PlatformSubmitButton>
                          </PlatformActionForm>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
          {orgDocs.length === 0 && (
            <p className="border border-[var(--line)] bg-[var(--surface)] p-4 text-sm text-[var(--fg-dim)]">
              No organizations match this search.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function relativeTime(date: Date, now: number) {
  const seconds = Math.max(0, Math.floor((now - date.getTime()) / 1_000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3_600)}h ago`;
}

function HealthCard({
  label,
  state,
  detail,
}: {
  label: string;
  state: "ok" | "error" | "neutral";
  detail: string;
}) {
  const color =
    state === "neutral" ? "var(--fg-soft)" : state === "ok" ? "var(--green)" : "var(--red)";
  return (
    <div className="border border-[var(--line)] bg-[var(--surface)] p-3">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />
        <h2 className="font-mono text-xs font-semibold uppercase tracking-wide text-[var(--fg)]">{label}</h2>
      </div>
      <p className="mt-2 truncate text-xs text-[var(--fg-dim)]" title={detail}>{detail}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === "ACTIVE"
      ? "text-[var(--green)] bg-[var(--green-soft)]"
      : status === "DELETING"
        ? "text-[var(--red)] bg-[var(--red-soft)]"
        : "text-[var(--amber)] bg-[var(--amber-soft)]";
  return (
    <span className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${color}`}>
      {status}
    </span>
  );
}
