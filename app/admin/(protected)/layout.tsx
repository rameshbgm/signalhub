import { requireSession } from "@/lib/require-session";
import { collections } from "@/lib/db";
import { toId } from "@/lib/mongo-utils";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { AdminNav } from "@/components/admin/AdminNav";
import { OrgSwitcher } from "@/components/admin/OrgSwitcher";
import { getUserOrganizations } from "@/lib/memberships";
import { redirect } from "next/navigation";
import { scopedPageFilter } from "@/lib/admin-guard";
import { roleCapabilities } from "@/lib/identity";
import { AdminShell } from "@/components/admin/AdminShell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { session, org } = await requireSession();
  if (session.mustChangePassword || session.mustCompleteProfile) redirect("/organization/change-password");
  const capabilities = roleCapabilities(session.role);
  const [pages, userOrganizations] = await Promise.all([
    collections.pages().find(scopedPageFilter(session, org.id)).sort({ createdAt: 1 }).toArray().then((docs) => docs.map(toId)),
    getUserOrganizations(session.userId),
  ]);
  const organizations = userOrganizations;

  const sidebar = (
      <aside className="flex h-full w-full shrink-0 flex-col bg-[var(--surface)] lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:border-r lg:border-[var(--line)]">
        <OrgSwitcher
          orgId={org.id}
          orgName={org.name}
          organizations={organizations}
          pages={pages.map((p) => ({ id: p.id, name: p.name, slug: p.slug }))}
          canConfigurePages={capabilities.includes("page.configure")}
        />
        <AdminNav capabilities={capabilities} />
        <div className="hidden border-t border-[var(--line)] p-3 lg:block">
          <div className="flex min-w-0 items-center gap-2.5 px-2 py-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-raised)] font-mono text-xs font-semibold text-[var(--fg)]">
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
