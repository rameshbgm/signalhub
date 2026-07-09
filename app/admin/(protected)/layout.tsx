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
    <div className="min-h-screen flex bg-[var(--paper)] text-[var(--ink)]">
      <aside className="w-64 bg-white/70 backdrop-blur-sm border-r border-black/[0.06] shrink-0 flex flex-col">
        <OrgSwitcher orgName={org.name} plan={org.plan} pages={pages.map((p) => ({ id: p.id, name: p.name, slug: p.slug }))} />
        <AdminNav />
        <div className="px-4 py-3 border-t border-black/[0.06] text-xs">
          <p className="font-semibold text-[var(--ink)]">{session.name}</p>
          <p className="text-[var(--ink-soft)]">{session.email}</p>
          <LogoutButton />
        </div>
      </aside>
      <main className="flex-1 min-w-0 p-6 overflow-x-hidden">{children}</main>
    </div>
  );
}
