import { requireSession } from "@/lib/require-session";
import { requestOrgExport, updateOrgRetention, updateOrgSettings } from "./actions";
import { HelpTip } from "@/components/HelpTip";
import { requireCapability } from "@/lib/admin-guard";
import { effectiveRetention, RETENTION_BOUNDS } from "@/lib/retention";
import { oid } from "@/lib/mongo-utils";
import { collections } from "@/lib/db";
import Link from "next/link";

export default async function OrgSettingsPage() {
  const { session, org } = await requireSession();
  await requireCapability("organization.manage");
  const isAdmin = session.role === "OWNER" || session.role === "ADMIN";
  const isOwner = session.role === "OWNER";
  const retention = await effectiveRetention(oid(org.id));
  const exports = isOwner
    ? await collections.dataExportJobs().find({ orgId: oid(org.id) }).sort({ createdAt: -1 }).limit(10).toArray()
    : [];
  const identityConnections = isOwner
    ? await collections.identityConnections().find({
        orgId: oid(org.id),
        audience: "ORGANIZATION",
      }, { projection: { name: 1, slug: 1, type: 1, enabled: 1, roleMappings: 1, defaultRole: 1 } }).toArray()
    : [];

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="font-mono text-xl font-semibold text-[var(--fg)]">Organization Settings</h1>

      <section className="border border-[var(--line)] bg-[var(--surface)] p-5">
        <h2 className="mb-4 font-mono text-sm font-semibold text-[var(--fg)]">General</h2>
        <form action={updateOrgSettings} className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-[var(--fg-dim)]">Organization name</span>
            <input
              name="name"
              defaultValue={org.name}
              className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none disabled:opacity-50"
              required
              disabled={!isAdmin}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 flex items-center gap-1.5 text-xs text-[var(--fg-dim)]">
              Organization slug
              <HelpTip text="The organization slug is a stable internal identifier and is not changed here." />
            </span>
            <input
              value={org.slug}
              className="w-full border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--fg-soft)]"
              disabled
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-[var(--fg-dim)]">Organization contact email</span>
            <input
              name="contactEmail"
              type="email"
              defaultValue={org.contactEmail ?? ""}
              className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none disabled:opacity-50"
              disabled={!isAdmin}
            />
          </label>
          {isAdmin && <button className="bg-[var(--cyan)] px-4 py-2 text-sm font-medium text-[var(--on-cyan)]">Save</button>}
          {!isAdmin && <p className="text-xs text-[var(--fg-dim)]">Only Owners and Admins can change organization settings.</p>}
        </form>
      </section>

      {isOwner && (
        <section className="border border-[var(--line)] bg-[var(--surface)] p-5">
          <h2 className="font-mono text-sm font-semibold">Data retention</h2>
          <p className="mt-1 text-xs text-[var(--fg-dim)]">
            Organization overrides are bounded by installation safety limits and processed by the worker.
          </p>
          <form action={updateOrgRetention} className="mt-4 grid gap-3 sm:grid-cols-2">
            {Object.entries(RETENTION_BOUNDS).map(([key, bounds]) => (
              <label key={key} className="text-xs text-[var(--fg-soft)]">
                {key.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase())}
                <input
                  type="number"
                  name={key}
                  min={bounds.min}
                  max={bounds.max}
                  defaultValue={retention[key as keyof typeof retention]}
                  className="mt-1 w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm"
                />
              </label>
            ))}
            <button className="bg-[var(--cyan)] px-4 py-2 text-sm font-medium text-[var(--on-cyan)] sm:col-span-2">
              Save retention policy
            </button>
          </form>
        </section>
      )}

      {isOwner && (
        <section className="border border-[var(--line)] bg-[var(--surface)] p-5">
          <h2 className="font-mono text-sm font-semibold">Enterprise identity assignments</h2>
          <p className="mt-1 text-xs text-[var(--fg-dim)]">
            Connection credentials and provisioning tokens are controlled by platform administrators.
          </p>
          <div className="mt-3 divide-y divide-[var(--line)] border border-[var(--line)]">
            {identityConnections.map((connection) => (
              <div key={connection._id.toHexString()} className="p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{connection.name} · {connection.type}</span>
                  <span className={connection.enabled ? "text-[var(--green)]" : "text-[var(--red)]"}>{connection.enabled ? "Enabled" : "Disabled"}</span>
                </div>
                <p className="mt-1 text-[var(--fg-dim)]">Default role: {connection.defaultRole ?? "None"} · {connection.roleMappings.length} group mappings</p>
                {connection.enabled && (
                  <Link href={`/api/auth/${connection.type.toLowerCase()}/${connection.slug}/start`} className="mt-2 inline-block font-semibold text-[var(--cyan)]">
                    Test sign-in
                  </Link>
                )}
              </div>
            ))}
            {!identityConnections.length && <p className="p-3 text-xs text-[var(--fg-dim)]">No enterprise identity connection is assigned.</p>}
          </div>
        </section>
      )}

      {isOwner && (
        <section className="border border-[var(--line)] bg-[var(--surface)] p-5">
          <h2 className="font-mono text-sm font-semibold">Organization data export</h2>
          <p className="mt-1 text-xs text-[var(--fg-dim)]">
            Creates a checksummed JSON archive and asset manifest. Stored credential material is excluded.
          </p>
          <form action={requestOrgExport} className="mt-3">
            <button className="border border-[var(--cyan)]/40 px-3 py-2 text-xs font-semibold text-[var(--cyan)]">
              Request export
            </button>
          </form>
          <div className="mt-4 divide-y divide-[var(--line)] border border-[var(--line)]">
            {exports.map((job) => (
              <div key={job._id.toHexString()} className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs">
                <span>{job.createdAt.toLocaleString()} · {job.status}</span>
                {job.status === "SUCCEEDED" ? (
                  <a href={`/api/admin/exports/${job._id.toHexString()}`} className="font-semibold text-[var(--cyan)]">Download</a>
                ) : job.lastError ? <span className="text-[var(--red)]">{job.lastError}</span> : null}
              </div>
            ))}
            {!exports.length && <p className="p-3 text-xs text-[var(--fg-dim)]">No exports requested.</p>}
          </div>
        </section>
      )}

      {isOwner && (
        <section className="border border-[var(--red)]/40 bg-[var(--surface)] p-5">
          <h2 className="mb-2 font-mono text-sm font-semibold text-[var(--red)]">
            Organization deletion
          </h2>
          <p className="text-xs leading-5 text-[var(--fg-soft)]">
            Permanent deletion is handled by a platform Owner using the audited
            suspend, review, and queued-purge workflow. Contact your platform
            operator and include organization slug{" "}
            <code className="bg-[var(--bg)] px-1 text-[var(--fg)]">
              {org.slug}
            </code>
            .
          </p>
        </section>
      )}
    </div>
  );
}
