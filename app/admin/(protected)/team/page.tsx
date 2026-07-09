import { requireSession } from "@/lib/require-session";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { inviteMember, removeMember } from "./actions";

export default async function TeamPage() {
  const { org } = await requireSession();
  const members = (await collections.teamMembers().find({ orgId: oid(org.id) }).sort({ createdAt: 1 }).toArray()).map(toId);

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">Team</h1>

      <form action={inviteMember} className="bg-white border rounded-lg p-4 grid sm:grid-cols-2 gap-3">
        <input name="name" placeholder="Full name" className="border rounded-md px-3 py-2 text-sm" required />
        <input name="email" type="email" placeholder="Email" className="border rounded-md px-3 py-2 text-sm" required />
        <select name="role" className="border rounded-md px-3 py-2 text-sm">
          <option value="TENANT_ADMIN">Tenant Admin</option>
          <option value="TENANT_USER">Tenant User</option>
        </select>
        <input name="password" type="password" placeholder="Temporary password" className="border rounded-md px-3 py-2 text-sm" required />
        <button className="bg-blue-600 text-white rounded-md px-4 py-2 text-sm font-medium sm:col-span-2">Invite Member</button>
      </form>

      <div className="bg-white border rounded-lg divide-y">
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between p-3 text-sm">
            <div>
              <span className="font-medium">{m.name}</span>
              <span className="text-xs text-gray-400 ml-2">{m.email}</span>
              <span className="text-xs bg-gray-100 rounded px-1.5 py-0.5 ml-2">{m.role}</span>
            </div>
            <form action={removeMember.bind(null, m.id)}>
              <button className="text-xs text-red-600 hover:underline">Remove</button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
