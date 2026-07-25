import { redirect } from "next/navigation";
import Link from "next/link";
import { PlatformLogoutButton } from "@/components/platform/PlatformLogoutButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { requirePlatformSession } from "@/lib/admin-guard";
import { isPlatformAuthenticationError } from "@/lib/admin-auth-error";
import { hasPlatformCapability } from "@/lib/platform-policy";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  let session: Awaited<ReturnType<typeof requirePlatformSession>>;
  try {
    session = await requirePlatformSession();
  } catch (error) {
    if (isPlatformAuthenticationError(error)) redirect("/platform/login");
    throw error;
  }
  const navigation = [
    { href: "/platform", label: "Overview", capability: "overview.read" as const },
    { href: "/platform/orgs", label: "Organizations", capability: "organizations.read" as const },
    { href: "/platform/users", label: "Users", capability: "users.read" as const },
    { href: "/platform/support", label: "Support", capability: "support.view" as const },
    { href: "/platform/operations", label: "Operations", capability: "operations.read" as const },
    { href: "/platform/templates", label: "Monitor templates", capability: "templates.read" as const },
    { href: "/platform/identity", label: "Identity", capability: "identity.read" as const },
    { href: "/platform/audit", label: "Audit", capability: "audit.read" as const },
    { href: "/platform/admins", label: "Platform admins", capability: "admins.read" as const },
  ].filter((item) => hasPlatformCapability(session.role, item.capability));

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--fg)] lg:flex">
      <aside className="grain relative flex shrink-0 flex-col overflow-hidden border-b border-[var(--line)] bg-[var(--surface)] lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:border-b-0 lg:border-r">
        <div className="relative flex items-center justify-between gap-2 px-4 py-4">
          <Link href="/platform">
            <div className="flex items-center gap-2 font-mono text-sm font-semibold text-[var(--fg)]">
              SignalHub <span className="mt-1.5 inline-block h-1.5 w-1.5 bg-[var(--cyan)] pulse-dot" />
            </div>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-[var(--fg-dim)]">
              Platform console
            </p>
          </Link>
          <ThemeToggle />
        </div>
        <nav aria-label="Platform console" className="relative grid flex-1 gap-1 px-2 pb-3 pt-2 sm:grid-cols-2 lg:block">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block border border-transparent px-3 py-2 font-mono text-sm text-[var(--fg-soft)] transition-colors hover:border-[var(--line)] hover:bg-[var(--bg)] hover:text-[var(--fg)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="relative border-t border-[var(--line)] px-4 py-3 font-mono text-xs">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-[var(--fg)]">{session.name}</p>
            <span className="bg-[var(--cyan-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--cyan)]">
              {session.role}
            </span>
          </div>
          <p className="truncate text-[var(--fg-dim)]">{session.email}</p>
          <PlatformLogoutButton />
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
