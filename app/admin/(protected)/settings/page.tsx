import { requireSession } from "@/lib/require-session";
import { updateOrgSettings, deleteOrganization } from "./actions";

export default async function OrgSettingsPage() {
  const { session, org } = await requireSession();
  const isAdmin = session.role === "TENANT_ADMIN";

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-xl font-semibold">Organization Settings</h1>

      <section className="bg-white border rounded-lg p-5">
        <h2 className="font-semibold text-sm mb-4">General</h2>
        <form action={updateOrgSettings} className="space-y-3">
          <label className="block text-sm">
            <span className="text-xs text-gray-500 block mb-1">Organization name</span>
            <input name="name" defaultValue={org.name} className="w-full border rounded-md px-3 py-2 text-sm" required disabled={!isAdmin} />
          </label>
          <label className="block text-sm">
            <span className="text-xs text-gray-500 block mb-1">Organization slug</span>
            <input value={org.slug} className="w-full border rounded-md px-3 py-2 text-sm bg-gray-50 text-gray-500" disabled />
          </label>
          <label className="block text-sm">
            <span className="text-xs text-gray-500 block mb-1">Billing email</span>
            <input name="billingEmail" type="email" defaultValue={org.billingEmail ?? ""} className="w-full border rounded-md px-3 py-2 text-sm" disabled={!isAdmin} />
          </label>
          {isAdmin && <button className="bg-blue-600 text-white rounded-md px-4 py-2 text-sm font-medium">Save</button>}
          {!isAdmin && <p className="text-xs text-gray-400">Only tenant admins can change organization settings.</p>}
        </form>
      </section>

      {isAdmin && (
        <section className="bg-white border border-red-200 rounded-lg p-5">
          <h2 className="font-semibold text-sm text-red-700 mb-2">Danger Zone</h2>
          <p className="text-xs text-gray-500 mb-3">
            Permanently deletes this organization, every status page, all incidents, subscribers, team members, API keys, and
            invoices. This cannot be undone. Type <code className="bg-gray-100 px-1 rounded">{org.slug}</code> to confirm.
          </p>
          <form action={deleteOrganization} className="flex gap-2">
            <input name="confirm" placeholder={org.slug} className="flex-1 border rounded-md px-3 py-2 text-sm" required />
            <button className="text-red-600 border border-red-300 rounded-md px-3 py-1.5 text-sm hover:bg-red-50">
              Delete organization
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
