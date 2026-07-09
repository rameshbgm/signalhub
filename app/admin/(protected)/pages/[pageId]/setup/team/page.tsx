import Link from "next/link";
import { requireSession } from "@/lib/require-session";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { SetupStepper } from "@/components/admin/SetupStepper";
import { inviteMember } from "@/app/admin/(protected)/team/actions";

export default async function SetupTeamPage({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const { org } = await requireSession();
  const members = (await collections.teamMembers().find({ orgId: oid(org.id) }).sort({ createdAt: 1 }).toArray()).map(toId);

  return (
    <div>
      <SetupStepper pageId={pageId} current="team" />
      <h1 className="text-2xl font-semibold">Invite your team</h1>
      <p className="mt-3 text-sm text-gray-600 leading-relaxed max-w-lg">
        Tenant admins can post incidents, manage billing, and change tenant settings. Tenant users can run incidents day-to-day
        and post updates.
      </p>

      <form action={inviteMember} className="mt-8 bg-white border rounded-lg p-4 grid sm:grid-cols-2 gap-3">
        <input name="name" placeholder="Full name" className="border rounded-md px-3 py-2 text-sm" required />
        <input name="email" type="email" placeholder="Email" className="border rounded-md px-3 py-2 text-sm" required />
        <select name="role" className="border rounded-md px-3 py-2 text-sm">
          <option value="TENANT_ADMIN">Tenant Admin</option>
          <option value="TENANT_USER">Tenant User</option>
        </select>
        <input name="password" type="password" placeholder="Temporary password" className="border rounded-md px-3 py-2 text-sm" required />
        <button className="bg-blue-600 text-white rounded-md px-4 py-2 text-sm font-medium sm:col-span-2">Invite Member</button>
      </form>

      <div className="mt-6 bg-white border rounded-lg divide-y">
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between p-3 text-sm">
            <div>
              <span className="font-medium">{m.name}</span>
              <span className="text-xs text-gray-400 ml-2">{m.email}</span>
            </div>
            <span className="text-xs bg-gray-100 rounded px-1.5 py-0.5">{m.role}</span>
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center mt-12 pt-6 border-t">
        <Link href={`/admin/pages/${pageId}/setup/notifications`} className="text-sm text-gray-500 hover:text-gray-800">
          ← Back
        </Link>
        <div className="flex gap-3">
          <Link href={`/admin/pages/${pageId}/setup/incidents`} className="text-sm text-gray-500 hover:text-gray-800 self-center">
            Skip
          </Link>
          <Link href={`/admin/pages/${pageId}/setup/incidents`} className="bg-blue-600 text-white rounded-md px-5 py-2.5 text-sm font-medium">
            Next: Incidents →
          </Link>
        </div>
      </div>
    </div>
  );
}
