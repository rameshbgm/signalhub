import { redirect } from "next/navigation";
import { getPlatformSession } from "@/lib/auth";
import { PlatformLogoutButton } from "@/components/platform/PlatformLogoutButton";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const session = await getPlatformSession();
  if (!session) redirect("/platform/login");

  return (
    <div className="min-h-screen flex bg-gray-50">
      <aside className="w-56 bg-gray-900 text-white shrink-0 flex flex-col">
        <div className="px-4 py-4 font-mono text-xs uppercase tracking-widest text-gray-400">statuspage · platform</div>
        <nav className="flex-1 px-2">
          <a href="/platform/orgs" className="block rounded-md px-3 py-2 text-sm text-gray-200 hover:bg-gray-800">
            Organizations
          </a>
        </nav>
        <div className="px-4 py-3 border-t border-gray-800 text-xs text-gray-400">
          <p className="font-medium text-gray-200">{session.name}</p>
          <p>{session.email}</p>
          <PlatformLogoutButton />
        </div>
      </aside>
      <main className="flex-1 min-w-0 p-6 overflow-x-hidden">{children}</main>
    </div>
  );
}
