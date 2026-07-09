import { collections } from "@/lib/db";
import { toId } from "@/lib/mongo-utils";
import { impersonateOrg, suspendOrg, unsuspendOrg, deleteOrgAsPlatform } from "./actions";

export default async function PlatformOrgsPage() {
  const orgDocs = await collections.organizations().find().sort({ createdAt: -1 }).toArray();
  const orgs = orgDocs.map(toId);
  const memberCounts = await Promise.all(orgDocs.map((o) => collections.teamMembers().countDocuments({ orgId: o._id })));

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-medium tracking-tight text-[var(--ink)]">Organizations</h1>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          {orgs.length} organization{orgs.length === 1 ? "" : "s"} across the platform.
        </p>
      </div>

      <div className="rounded-xl border border-black/[0.06] bg-white shadow-sm divide-y divide-black/[0.06]">
        {orgs.map((org, i) => (
          <div key={org.id} className="flex items-center justify-between p-4 text-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--ink)] font-display text-xs font-semibold text-white">
                {org.name.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-[var(--ink)]">{org.name}</span>
                  <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
                    {org.plan}
                  </span>
                  {org.suspended && (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-600">
                      Suspended
                    </span>
                  )}
                </div>
                <span className="text-xs text-[var(--ink-soft)]">
                  {org.slug} · {memberCounts[i]} member{memberCounts[i] === 1 ? "" : "s"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs font-semibold">
              <form action={impersonateOrg.bind(null, org.id)}>
                <button className="text-[var(--up)] hover:underline">Manage</button>
              </form>
              {org.suspended ? (
                <form action={unsuspendOrg.bind(null, org.id)}>
                  <button className="text-[var(--up)] hover:underline">Unsuspend</button>
                </form>
              ) : (
                <form action={suspendOrg.bind(null, org.id)}>
                  <button className="text-amber-600 hover:underline">Suspend</button>
                </form>
              )}
              <form action={deleteOrgAsPlatform.bind(null, org.id)}>
                <button className="text-red-600 hover:underline">Delete</button>
              </form>
            </div>
          </div>
        ))}
        {orgs.length === 0 && <p className="p-4 text-sm text-[var(--ink-soft)]">No organizations yet.</p>}
      </div>
    </div>
  );
}
