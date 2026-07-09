import { redirect } from "next/navigation";
import { getPlatformSession } from "@/lib/auth";
import { PlatformLogoutButton } from "@/components/platform/PlatformLogoutButton";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const session = await getPlatformSession();
  if (!session) redirect("/platform/login");

  return (
    <div className="min-h-screen flex bg-[var(--paper)] text-[var(--ink)]">
      <aside className="grain relative w-60 shrink-0 flex flex-col overflow-hidden bg-[var(--ink)] text-white">
        <div className="relative px-4 py-4">
          <div className="flex items-center gap-2 font-display text-sm font-semibold">
            statuspage <span className="mt-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--up)] pulse-dot" />
          </div>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-white/40">Platform console</p>
        </div>
        <nav className="relative flex-1 px-2 pt-2">
          <a
            href="/platform/orgs"
            className="flex items-center gap-2.5 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium text-white"
          >
            <span className="w-4 text-center text-xs text-white/50" aria-hidden>
              ◧
            </span>
            Organizations
          </a>
        </nav>
        <div className="relative px-4 py-3 border-t border-white/10 text-xs">
          <p className="font-semibold text-white">{session.name}</p>
          <p className="text-white/40">{session.email}</p>
          <PlatformLogoutButton />
        </div>
      </aside>
      <main className="flex-1 min-w-0 p-6 overflow-x-hidden">{children}</main>
    </div>
  );
}
