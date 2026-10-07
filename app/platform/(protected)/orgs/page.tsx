import { CopyPhrase } from "@/components/ui/copy-phrase";
import Link from "next/link";
import { Building2, ClipboardCheck, Cpu, Database, Inbox, KeyRound, Mail, Network, Plus, Search, Trash2 } from "lucide-react";
import { database, verifyDatabaseConnection } from "@/lib/postgres/client";
import {
  suspendOrg,
  unsuspendOrg,
  deleteOrgAsPlatform,
  cancelOrganizationPurge,
} from "./actions";
import { requirePlatformPageCapability } from "@/lib/platform-page-guard";
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
import { OrganizationSettingsSection } from "@/components/platform/OrganizationSettingsSection";
import { SwitchOrganizationButton } from "@/components/platform/SwitchOrganizationButton";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlatformHealth } from "@/components/platform/PlatformStat";
import { INPUT_LIMITS } from "@/lib/input-limits";

export default async function PlatformOrgsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; q?: string }>;
}) {
  const actor = await requirePlatformPageCapability("organizations.read");
  const query = (await searchParams).q?.trim() ?? "";
  // eslint-disable-next-line react-hooks/purity
  const renderedAt = Date.now();
  const databaseOk = await verifyDatabaseConnection()
    .then(() => true)
    .catch(() => false);
  const [migrationState, latestHeartbeat, deadLetters, queuedDeliveries, smtp] =
    await Promise.all([
      inspectMigrationState(),
      database.selectFrom("workerHeartbeats").selectAll().orderBy("lastSeenAt", "desc").executeTakeFirst(),
      countNotificationJobs(["DEAD_LETTER"]),
      countNotificationJobs(["PENDING", "PROCESSING"]),
      verifySmtp(),
    ]);
  let organizationsQuery = database.selectFrom("organizations").selectAll();
  if (query) {
    const pattern = `%${query}%`;
    organizationsQuery = organizationsQuery.where((expression) => expression.or([
      expression("name", "ilike", pattern),
      expression("slug", "ilike", pattern),
      expression("contactEmail", "ilike", pattern),
    ]));
  }
  const orgDocs = await organizationsQuery.orderBy("createdAt", "desc").limit(200).execute();
  const memberships = orgDocs.length
    ? await database.selectFrom("memberships").selectAll()
        .where("orgId", "in", orgDocs.map((organization) => organization.id)).execute()
    : [];
  const purgeJobs = orgDocs.length
    ? await database.selectFrom("platformJobs").selectAll()
        .where("organizationId", "in", orgDocs.map((organization) => organization.id))
        .where("type", "=", "PURGE_ORGANIZATION")
        .orderBy("createdAt", "desc").execute()
    : [];
  const latestPurgeJobByOrganization = new Map<string, (typeof purgeJobs)[number]>();
  for (const job of purgeJobs) {
    const organizationId = job.organizationId;
    if (!latestPurgeJobByOrganization.has(organizationId)) {
      latestPurgeJobByOrganization.set(organizationId, job);
    }
  }
  const canCreate = hasPlatformCapability(actor.role, "organizations.create");
  const canSuspend = hasPlatformCapability(actor.role, "organizations.suspend");
  const canPurge = hasPlatformCapability(actor.role, "organizations.purge");

  const workerReady = Boolean(
    latestHeartbeat &&
      latestHeartbeat.status === "READY" &&
      latestHeartbeat.lastSeenAt > new Date(renderedAt - 30_000)
  );
  const smtpTone: StatusTone = !smtp.configured ? "neutral" : smtp.ok ? "ok" : "danger";

  return (
    <div className="space-y-8">
      <PageHeader
        title="Organizations"
        description="Provision, open, freeze, and queue tenant purges, and manage the settings of the organization you are signed in to."
        icon={Building2}
        hue="violet"
        actions={canCreate && (
          <a href="#provision-organization" className={buttonVariants()}>
            <Plus aria-hidden size={16} />
            Provision organization
          </a>
        )}
      />

      <section aria-label="Instance health" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <PlatformHealth label="Database" icon={Database} tone={databaseOk ? "ok" : "danger"} status={databaseOk ? "Reachable" : "Unavailable"} />
        <PlatformHealth
          label="Migrations"
          icon={ClipboardCheck}
          tone={migrationState.current ? "ok" : "danger"}
          status={migrationState.current ? "Current" : "Action required"}
          detail={
            migrationState.current
              ? `${migrationState.verifiedCount}/${migrationState.expectedCount} verified · ${LATEST_MIGRATION_ID}`
              : migrationIssueSummary(migrationState)
          }
        />
        <PlatformHealth
          label="Worker"
          icon={Cpu}
          tone={workerReady ? "ok" : "danger"}
          status={workerReady ? "Ready" : "Stale"}
          detail={
            latestHeartbeat
              ? `${latestHeartbeat.status.toLowerCase()} · ${relativeTime(latestHeartbeat.lastSeenAt, renderedAt)}`
              : "No heartbeat"
          }
        />
        <PlatformHealth
          label="SMTP"
          icon={Mail}
          tone={smtpTone}
          status={!smtp.configured ? "Not configured" : smtp.ok ? "Reachable" : "Unavailable"}
          detail={smtp.configured && !smtp.ok ? smtp.error ?? undefined : undefined}
        />
        <PlatformHealth label="OIDC" icon={KeyRound} tone="neutral" status={oidcConfigured() ? "Configured" : "Not configured"} detail="Optional" />
        <PlatformHealth
          label="Delivery queue"
          icon={Inbox}
          tone={deadLetters === 0 ? "ok" : "danger"}
          status={deadLetters === 0 ? "Healthy" : "Dead letters"}
          detail={`${queuedDeliveries} queued · ${deadLetters} dead-letter`}
        />
        <PlatformHealth
          label="Private targets"
          icon={Network}
          tone="neutral"
          status={process.env.MONITOR_ALLOW_PRIVATE_TARGETS === "true" ? "Explicitly enabled" : "Blocked"}
          detail="Monitor targets on private networks"
        />
      </section>

      {canCreate && (
        <Card id="provision-organization" className="scroll-mt-6">
          <CardHeader>
            <CardTitle>Provision organization</CardTitle>
            <CardDescription>
              Creates an active tenant. Admins can open it immediately and add users from Users &amp; Roles.
            </CardDescription>
          </CardHeader>
          <div className="p-5">
            <CreateOrganizationForm />
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>Tenant directory</CardTitle>
            <CardDescription>
              Showing {orgDocs.length} organization{orgDocs.length === 1 ? "" : "s"}.
            </CardDescription>
          </div>
          <form className="flex w-full gap-2 sm:w-auto">
            <label className="sr-only" htmlFor="organization-search">Search organizations</label>
            <Input
              id="organization-search"
              name="q"
              defaultValue={query}
              placeholder="Name, slug, or email"
              className="sm:w-64"
            />
            <Button type="submit" variant="secondary">
              <Search aria-hidden size={16} />
              Search
            </Button>
          </form>
        </CardHeader>

        {orgDocs.length === 0 ? (
          <EmptyState
            icon={Building2}
            hue="violet"
            title={query ? "No organizations match this search" : "No organizations yet"}
            description={query ? "Try a different name, slug, or contact email." : "Provision the first organization to give a team its own workspace."}
            action={query
              ? <Link href="/organization/platform/orgs" className={buttonVariants({ variant: "secondary" })}>Clear search</Link>
              : canCreate ? <a href="#provision-organization" className={buttonVariants()}><Plus aria-hidden size={16} />Provision organization</a> : undefined}
            className="border-0 bg-transparent py-12"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead className="max-sm:hidden">Status</TableHead>
                <TableHead className="max-md:hidden">Memberships</TableHead>
                <TableHead className="max-md:hidden">Created</TableHead>
                <TableHead className="text-right"><span className="sr-only">Open</span></TableHead>
              </TableRow>
            </TableHeader>
            {orgDocs.map((organization) => {
              const id = organization.id;
              const status = organizationStatus(organization);
              const purgeJob = latestPurgeJobByOrganization.get(id);
              const purgeCanBeCancelled =
                organizationPurgeCanBeCancelled(purgeJob);
              const membershipCount = memberships.filter((membership) =>
                membership.orgId === organization.id
              ).length;
              const created = organization.createdAt.toLocaleDateString();
              const statusBadge = <StatusBadge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusBadge>;
              const showSuspend = status === "ACTIVE" && canSuspend;
              const showReactivate = status === "SUSPENDED" && canSuspend;
              const showPurge = status === "SUSPENDED" && canPurge;
              const hasLifecycle = showSuspend || showReactivate || showPurge || status === "DELETING";
              return (
                <TableBody key={id} className="border-b border-line last:border-0">
                  <TableRow className={hasLifecycle ? "border-b-0" : undefined}>
                    <TableCell className="min-w-0 text-ink">
                      <p className="font-medium">{organization.name}</p>
                      <p className="mt-0.5 font-mono text-xs text-ink-dim">{organization.slug}</p>
                      <div className="mt-2 sm:hidden">{statusBadge}</div>
                      <p className="mt-1 text-xs text-ink-dim md:hidden">
                        {membershipCount} membership{membershipCount === 1 ? "" : "s"} · Created {created}
                      </p>
                      {organization.statusReason && status !== "ACTIVE" && (
                        <p className="mt-2 max-w-md text-xs text-ink-soft">
                          Reason: {organization.statusReason}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="max-sm:hidden">{statusBadge}</TableCell>
                    <TableCell className="tabular-nums max-md:hidden">{membershipCount}</TableCell>
                    <TableCell className="whitespace-nowrap max-md:hidden">{created}</TableCell>
                    <TableCell className="text-right">
                      {status === "ACTIVE" && (
                        <div className="inline-block text-left">
                          <SwitchOrganizationButton organizationId={id} />
                        </div>
                      )}
                    </TableCell>
                  </TableRow>

                  {hasLifecycle && (
                    <tr>
                      <td colSpan={5} className="px-4 pb-4 pt-0">
                        <div className="space-y-4 rounded-control bg-sunken/50 p-4">
                          <p className="text-sm font-semibold text-ink">Lifecycle</p>
                          {showSuspend && (
                            <PlatformActionForm
                              action={suspendOrg.bind(null, id)}
                              successMessage="Organization suspended."
                              className="flex items-end gap-3"
                            >
                              <Field label="Suspension reason" htmlFor={`suspend-reason-${id}`} className="min-w-56 flex-1">
                                <Input
                                  id={`suspend-reason-${id}`}
                                  name="reason" maxLength={INPUT_LIMITS.reason}
                                  minLength={10}
                                  required
                                  placeholder="Suspension reason"
                                />
                              </Field>
                              <PlatformSubmitButton
                                variant="destructive"
                                pendingLabel="Suspending…"
                                confirmMessage={`Suspend ${organization.name} and freeze all tenant traffic and workers?`}
                              >
                                Suspend
                              </PlatformSubmitButton>
                            </PlatformActionForm>
                          )}
                          {showReactivate && (
                            <PlatformActionForm
                              action={unsuspendOrg.bind(null, id)}
                              successMessage="Organization reactivated."
                              className="flex items-end gap-3"
                            >
                              <Field label="Reactivation reason" htmlFor={`reactivate-reason-${id}`} className="min-w-56 flex-1">
                                <Input
                                  id={`reactivate-reason-${id}`}
                                  name="reason" maxLength={INPUT_LIMITS.reason}
                                  minLength={10}
                                  required
                                  placeholder="Reactivation reason"
                                />
                              </Field>
                              <PlatformSubmitButton pendingLabel="Reactivating…" variant="soft">
                                Reactivate
                              </PlatformSubmitButton>
                            </PlatformActionForm>
                          )}
                          {showPurge && (
                            <details className="group rounded-control border border-danger/25 bg-danger-bg/40 p-3.5">
                              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-chip text-sm font-semibold text-danger-fg outline-none focus-visible:ring-4 focus-visible:ring-danger/25 [&::-webkit-details-marker]:hidden">
                                <Trash2 aria-hidden size={16} />
                                Queue permanent purge
                              </summary>
                              <p className="mt-2 text-xs leading-5 text-ink-soft">
                                Removes the organization and its data once the purge job runs. This cannot be undone.
                              </p>
                              <PlatformActionForm
                                action={deleteOrgAsPlatform.bind(null, id)}
                                successMessage="Organization purge queued."
                                className="mt-4 grid gap-4 sm:grid-cols-2"
                                messageClassName="sm:col-span-2"
                              >
                                <Field label="Purge reason or ticket" htmlFor={`purge-reason-${id}`}>
                                  <Input
                                    id={`purge-reason-${id}`}
                                    name="reason" maxLength={INPUT_LIMITS.reason}
                                    minLength={10}
                                    required
                                    placeholder="Purge reason / ticket"
                                  />
                                </Field>
                                <Field label={<>Type <CopyPhrase text={organization.slug} /> to confirm</>} htmlFor={`purge-confirm-${id}`}>
                                  <Input
                                    id={`purge-confirm-${id}`}
                                    name="confirmation"
                                    required
                                    pattern={organization.slug}
                                    placeholder={`type ${organization.slug}`}
                                    className="font-mono"
                                  />
                                </Field>
                                <div className="flex justify-end sm:col-span-2">
                                  <PlatformSubmitButton
                                    variant="destructive"
                                    pendingLabel="Queueing…"
                                    confirmMessage={`Queue the permanent purge of ${organization.name}? This cannot be undone.`}
                                  >
                                    Queue purge
                                  </PlatformSubmitButton>
                                </div>
                              </PlatformActionForm>
                            </details>
                          )}
                          {status === "DELETING" && (
                            <div className="space-y-3">
                              <Alert tone="warn" role="note">
                                {purgeCanBeCancelled
                                  ? "Purge queued but not started. Progress and retry controls are in Operations."
                                  : "Purge cleanup has started and is irreversible. Progress and retry controls are in Operations."}
                              </Alert>
                              {canPurge && purgeCanBeCancelled && (
                                <PlatformActionForm
                                  action={cancelOrganizationPurge.bind(null, id)}
                                  successMessage="Queued organization purge cancelled."
                                  className="flex items-end gap-3"
                                >
                                  <Field label="Cancellation reason" htmlFor={`cancel-reason-${id}`} className="min-w-56 flex-1">
                                    <Input
                                      id={`cancel-reason-${id}`}
                                      name="reason" maxLength={INPUT_LIMITS.reason}
                                      minLength={10}
                                      required
                                      placeholder="Cancellation reason"
                                    />
                                  </Field>
                                  <PlatformSubmitButton pendingLabel="Cancelling…" variant="secondary">
                                    Cancel queued purge
                                  </PlatformSubmitButton>
                                </PlatformActionForm>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </TableBody>
              );
            })}
          </Table>
        )}
      </Card>

      <OrganizationSettingsSection />
    </div>
  );
}

const STATUS_TONE: Record<string, StatusTone> = { ACTIVE: "ok", SUSPENDED: "warn", DELETING: "danger", PROVISIONING: "info" };
const STATUS_LABEL: Record<string, string> = { ACTIVE: "Active", SUSPENDED: "Suspended", DELETING: "Deleting", PROVISIONING: "Provisioning" };

function relativeTime(date: Date, now: number) {
  const seconds = Math.max(0, Math.floor((now - date.getTime()) / 1_000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3_600)}h ago`;
}

async function countNotificationJobs(
  statuses: Array<"PENDING" | "PROCESSING" | "DEAD_LETTER">
) {
  const row = await database.selectFrom("notificationJobs")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .where("status", "in", statuses).executeTakeFirstOrThrow();
  return Number(row.count);
}
