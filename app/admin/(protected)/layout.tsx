import { requireSession } from "@/lib/require-session";
import { OrgSwitcher } from "@/components/admin/OrgSwitcher";
import { getUserOrganizations } from "@/lib/memberships";
import { redirect } from "next/navigation";
import { getScopedPages } from "@/lib/admin-guard";
import { roleCapabilities } from "@/lib/identity";
import { AdminShell } from "@/components/admin/AdminShell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { session, org } = await requireSession();
  if (session.mustChangePassword || session.mustCompleteProfile) redirect("/organization/change-password");
  const capabilities = roleCapabilities(session.role);
  const [pages, userOrganizations] = await Promise.all([
    getScopedPages(session, org.id),
    getUserOrganizations(session.userId),
  ]);
  const organizations = userOrganizations;

  return (
    <AdminShell
      capabilities={capabilities}
      user={{ name: session.name, email: session.email }}
      pages={pages.map((p) => ({ id: p.id, name: p.name }))}
      orgSwitcher={
        <OrgSwitcher
          orgId={org.id}
          orgName={org.name}
          organizations={organizations}
          pages={pages.map((p) => ({ id: p.id, name: p.name, slug: p.slug }))}
          canConfigurePages={capabilities.includes("page.configure")}
        />
      }
    >
      {children}
    </AdminShell>
  );
}
