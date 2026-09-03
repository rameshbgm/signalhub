import { requireSession } from "@/lib/require-session";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { AdminNav } from "@/components/admin/AdminNav";
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

  const sidebar = (
      <aside className="dispatch-command-deck">
        <OrgSwitcher
          orgId={org.id}
          orgName={org.name}
          organizations={organizations}
          pages={pages.map((p) => ({ id: p.id, name: p.name, slug: p.slug }))}
          canConfigurePages={capabilities.includes("page.configure")}
        />
        <AdminNav capabilities={capabilities} />
        <div className="dispatch-operator">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-[var(--line-bright)] bg-[var(--surface-raised)] font-mono text-xs font-semibold text-[var(--fg)]">
              {session.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--fg)]">{session.name}</p>
              <p className="truncate text-xs text-[var(--fg-dim)]">{session.email}</p>
            </div>
          </div>
          <LogoutButton />
        </div>
      </aside>
  );

  return <AdminShell sidebar={sidebar}>{children}</AdminShell>;
}
