import { collections } from "@/lib/db";
import { toId } from "@/lib/mongo-utils";
import { impersonateOrg, suspendOrg, unsuspendOrg, deleteOrgAsPlatform } from "./actions";

export default async function PlatformOrgsPage() {
  const orgDocs = await collections.organizations().find().sort({ createdAt: -1 }).toArray();
  const orgs = orgDocs.map(toId);
  const memberCounts = await Promise.all(orgDocs.map((o) => collections.teamMembers().countDocuments({ orgId: o._id })));

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-xl font-semibold">Organizations</h1>

      <div className="bg-white border rounded-lg divide-y">
        {orgs.map((org, i) => (
          <div key={org.id} className="flex items-center justify-between p-4 text-sm">
            <div>
              <span className="font-medium">{org.name}</span>
              <span className="text-xs text-gray-400 ml-2">{org.slug}</span>
              <span className="text-xs bg-gray-100 rounded px-1.5 py-0.5 ml-2">{org.plan}</span>
              <span className="text-xs text-gray-400 ml-2">{memberCounts[i]} member{memberCounts[i] === 1 ? "" : "s"}</span>
              {org.suspended && <span className="text-xs bg-red-100 text-red-700 rounded px-1.5 py-0.5 ml-2">suspended</span>}
            </div>
            <div className="flex gap-3">
              <form action={impersonateOrg.bind(null, org.id)}>
                <button className="text-xs text-blue-600 hover:underline">Manage</button>
              </form>
              {org.suspended ? (
                <form action={unsuspendOrg.bind(null, org.id)}>
                  <button className="text-xs text-blue-600 hover:underline">Unsuspend</button>
                </form>
              ) : (
                <form action={suspendOrg.bind(null, org.id)}>
                  <button className="text-xs text-amber-600 hover:underline">Suspend</button>
                </form>
              )}
              <form action={deleteOrgAsPlatform.bind(null, org.id)}>
                <button className="text-xs text-red-600 hover:underline">Delete</button>
              </form>
            </div>
          </div>
        ))}
        {orgs.length === 0 && <p className="p-4 text-sm text-gray-400">No organizations yet.</p>}
      </div>
    </div>
  );
}
