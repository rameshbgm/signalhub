import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { requireSession } from "@/lib/require-session";
import { requestOrgExport, updateOrgRetention, updateOrgSettings } from "@/app/admin/(protected)/settings/actions";
import { effectiveRetention, RETENTION_BOUNDS } from "@/lib/retention";
import { database } from "@/lib/postgres/client";
import Link from "next/link";
import { Archive, Download, FileDown, Fingerprint, History, TriangleAlert } from "lucide-react";
import { CopyButton } from "@/components/CopyButton";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { IconTile } from "@/components/ui/icon-tile";
import { Input } from "@/components/ui/input";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";

const RETENTION_LABELS: Record<string, string> = {
  monitorChecksDays: "Monitor check history",
  analyticsDays: "Analytics",
  notificationLogsDays: "Notification logs",
  resolvedIncidentsDays: "Resolved incidents",
};

function retentionLabel(key: string) {
  if (RETENTION_LABELS[key]) return RETENTION_LABELS[key];
  const text = key.replace(/([A-Z])/g, " $1").trim().toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const EXPORT_TONE: Record<string, StatusTone> = { SUCCEEDED: "ok", FAILED: "danger" };

function sentence(value: string) {
  const text = value.replaceAll("_", " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The signed-in organization's own settings, shown on the Organizations page.
 * Only reachable through Platform administration, whose layout already requires an Admin.
 */
export async function OrganizationSettingsSection() {
  const { org } = await requireSession();
  const [retention, exports, identityConnections] = await Promise.all([
    effectiveRetention(org.id),
    database.selectFrom("dataExportJobs").selectAll().where("orgId", "=", org.id)
      .orderBy("createdAt", "desc").limit(10).execute(),
    database.selectFrom("identityConnections")
      .select(["id", "name", "slug", "type", "enabled", "roleMappings", "defaultRole"])
      .where("orgId", "=", org.id).where("audience", "=", "ORGANIZATION").execute(),
  ]);

  return (
    <section id="organization-settings" aria-labelledby="organization-settings-title" className="scroll-mt-6 space-y-4">
      <div>
        <h2 id="organization-settings-title" className="text-lg font-semibold tracking-tight text-ink">{org.name} settings</h2>
        <p className="mt-1 text-sm text-ink-soft">Profile, data retention, enterprise sign-in, and exports for the organization you are signed in to.</p>
      </div>
      <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
        <Card>
          <CardHeader>
            <CardTitle>General</CardTitle>
            <CardDescription>The name and contact address shown across your workspace.</CardDescription>
          </CardHeader>
          <PlatformActionForm successMessage="Organization settings saved" action={updateOrgSettings}>
            <CardContent className="space-y-4">
              <Field label="Organization name" htmlFor="org-name">
                <Input id="org-name" name="name" defaultValue={org.name} required />
              </Field>
              <Field label="Organization slug" htmlFor="org-slug" hint="The organization slug is a stable internal identifier and is not changed here.">
                <Input id="org-slug" defaultValue={org.slug} className="font-mono" disabled />
              </Field>
              <Field label="Organization contact email" htmlFor="org-contact-email">
                <Input id="org-contact-email" name="contactEmail" type="email" defaultValue={org.contactEmail ?? ""} />
              </Field>
              <div className="flex justify-end border-t border-line pt-4">
                <Button type="submit">Save changes</Button>
              </div>
            </CardContent>
          </PlatformActionForm>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data retention</CardTitle>
            <CardDescription>
              Organization overrides are bounded by installation safety limits and processed by the worker.
            </CardDescription>
          </CardHeader>
          <PlatformActionForm successMessage="Retention settings saved" action={updateOrgRetention}>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {Object.entries(RETENTION_BOUNDS).map(([key, bounds]) => (
                  <Field key={key} label={retentionLabel(key)} htmlFor={`retention-${key}`} hint={`Days, from ${bounds.min} to ${bounds.max}.`}>
                    <Input
                      id={`retention-${key}`}
                      type="number"
                      name={key}
                      min={bounds.min}
                      max={bounds.max}
                      defaultValue={retention[key as keyof typeof retention]}
                    />
                  </Field>
                ))}
              </div>
              <div className="flex justify-end border-t border-line pt-4">
                <Button type="submit">
                  <History aria-hidden size={16} />
                  Save retention policy
                </Button>
              </div>
            </CardContent>
          </PlatformActionForm>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Enterprise identity assignments</CardTitle>
            <CardDescription>
              Connection credentials and provisioning tokens are controlled by platform administrators.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {identityConnections.length === 0 ? (
              <EmptyState icon={Fingerprint} hue="slate" title="No identity connection" description="No enterprise identity connection is assigned." className="border-0 bg-transparent py-8" />
            ) : (
              <ul className="space-y-2">
                {identityConnections.map((connection) => (
                  <li key={connection.id} className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line px-3.5 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                        {connection.name} · {connection.type}
                        <StatusBadge tone={connection.enabled ? "ok" : "neutral"}>{connection.enabled ? "Enabled" : "Disabled"}</StatusBadge>
                      </p>
                      <p className="mt-0.5 text-xs text-ink-dim">Default role: {connection.defaultRole ?? "None"} · {connection.roleMappings.length} group mappings</p>
                    </div>
                    {connection.enabled && (
                      <Link href={`/api/auth/${connection.type.toLowerCase()}/${connection.slug}/start`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                        Test sign-in
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>Organization data export</CardTitle>
              <CardDescription>
                Creates a checksummed JSON archive and asset manifest. Stored credential material is excluded.
              </CardDescription>
            </div>
            <PlatformActionForm successMessage="Export requested" action={requestOrgExport}>
              <Button type="submit" variant="secondary" size="sm">
                <FileDown aria-hidden size={14} />
                Request export
              </Button>
            </PlatformActionForm>
          </CardHeader>
          <CardContent>
            {exports.length === 0 ? (
              <EmptyState icon={Archive} hue="slate" title="No exports requested" description="Request an export to download your organization data." className="border-0 bg-transparent py-8" />
            ) : (
              <ul className="space-y-2">
                {exports.map((job) => (
                  <li key={job.id} className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line px-3.5 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-ink">
                        {job.createdAt.toLocaleString()}
                        <StatusBadge tone={EXPORT_TONE[job.status] ?? "info"}>{sentence(job.status)}</StatusBadge>
                      </p>
                      {job.status !== "SUCCEEDED" && job.lastError && <p className="mt-0.5 text-xs text-danger-fg">{job.lastError}</p>}
                    </div>
                    {job.status === "SUCCEEDED" && (
                      <a href={`/api/admin/exports/${job.id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                        <Download aria-hidden size={14} />
                        Download
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-start gap-3">
            <IconTile icon={TriangleAlert} hue="rose" />
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight text-danger-fg">Organization deletion</h2>
              <CardDescription>
                Permanent deletion is handled by a platform Admin using the audited suspend, review, and queued-purge
                workflow. Contact your platform operator and include this organization slug.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <code className="rounded-control border border-line-strong bg-sunken px-3 py-2 font-mono text-xs text-ink">{org.slug}</code>
            <CopyButton value={org.slug} label="Copy slug" />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
