import { requireSession } from "@/lib/require-session";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { AdminNav } from "@/components/admin/AdminNav";
import { OrgSwitcher } from "@/components/admin/OrgSwitcher";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { session, org } = await requireSession();
  const pages = (await collections.pages().find({ orgId: oid(org.id) }).sort({ createdAt: 1 }).toArray()).map(toId);

  return (
    <div className="min-h-screen flex bg-gray-50">
      <aside className="w-64 bg-white border-r shrink-0 flex flex-col">
        <OrgSwitcher orgName={org.name} plan={org.plan} pages={pages.map((p) => ({ id: p.id, name: p.name, slug: p.slug }))} />
        <AdminNav />
        <div className="px-4 py-3 border-t text-xs text-gray-500">
          <p className="font-medium text-gray-700">{session.name}</p>
          <p className="text-gray-400">{session.email}</p>
          <LogoutButton />
        </div>
      </aside>
      <main className="flex-1 min-w-0 p-6 overflow-x-hidden">{children}</main>
    </div>
  );
}
