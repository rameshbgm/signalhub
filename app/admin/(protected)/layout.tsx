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
import { EndSupportButton } from "@/components/admin/EndSupportButton";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { session, org } = await requireSession();
  if (session.mustChangePassword) redirect("/admin/change-password");
  const capabilities = roleCapabilities(session.role).filter(
    (capability) =>
      !session.supportSessionId ||
      session.supportMode === "VIEW" ||
      session.supportScopes.includes(capability)
  );
  const [pages, userOrganizations] = await Promise.all([
    collections.pages().find(scopedPageFilter(session, org.id)).sort({ createdAt: 1 }).toArray().then((docs) => docs.map(toId)),
    session.supportSessionId
      ? Promise.resolve([{ id: org.id, name: org.name, slug: org.slug, role: session.role }])
      : getUserOrganizations(session.userId),
  ]);
  const organizations = session.supportSessionId
    ? userOrganizations.filter((organization) => organization.id === org.id)
    : userOrganizations;

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)] text-[var(--fg)] lg:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-[var(--line)] bg-[var(--surface)] lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:border-b-0 lg:border-r">
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
      <main className="min-w-0 flex-1 overflow-x-hidden">
        {session.supportSessionId && (
          <div
            role="status"
            className="flex flex-col gap-2 border-b border-[var(--amber)]/40 bg-[var(--amber-soft)] px-4 py-2 text-sm text-[var(--amber)] sm:flex-row sm:items-center sm:justify-between"
          >
            <span>
              Audited {session.supportMode === "OPERATE" ? "scoped operate" : "view-only"} support
              session as {session.supportActorEmail ?? session.email}.{" "}
              {session.supportMode === "OPERATE" && session.supportScopes.length
                ? `Approved scope: ${session.supportScopes.join(", ")}. `
                : "Mutating actions are disabled. "}
              This session expires automatically.
            </span>
            <EndSupportButton />
          </div>
        )}
        <div className="p-4 sm:p-6">{children}</div>
      </main>
    </div>
  );
}
