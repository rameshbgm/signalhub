import Link from "next/link";
import { requireSession } from "@/lib/require-session";
import { LogoutButton } from "@/components/admin/LogoutButton";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/pages", label: "Pages" },
  { href: "/admin/incidents", label: "Incidents" },
  { href: "/admin/maintenance", label: "Maintenance" },
  { href: "/admin/templates", label: "Templates" },
  { href: "/admin/subscribers", label: "Subscribers" },
  { href: "/admin/metrics", label: "Metrics" },
  { href: "/admin/third-party", label: "Third-Party Catalog" },
  { href: "/admin/team", label: "Team" },
  { href: "/admin/api-keys", label: "API Keys" },
  { href: "/admin/embed", label: "Status Embed" },
  { href: "/admin/audit-log", label: "Audit Log" },
  { href: "/admin/billing", label: "Billing" },
  { href: "/admin/settings", label: "Settings" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { session, org } = await requireSession();

  return (
    <div className="min-h-screen flex bg-gray-50">
      <aside className="w-60 bg-white border-r shrink-0 flex flex-col">
        <div className="px-4 py-4 border-b">
          <p className="font-semibold text-sm">{org.name}</p>
          <p className="text-xs text-gray-400">{org.plan} plan</p>
        </div>
        <nav className="flex-1 py-2">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="block px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="px-4 py-3 border-t text-xs text-gray-500">
          <p>{session.name}</p>
          <p className="text-gray-400">{session.email}</p>
          <LogoutButton />
        </div>
      </aside>
      <main className="flex-1 min-w-0 p-6">{children}</main>
    </div>
  );
}
