import AdminLayout from "@/app/admin/(protected)/layout";
import { PlatformNav } from "@/components/platform/PlatformNav";
import { requireOrgSession } from "@/lib/admin-guard";
import { redirect } from "next/navigation";

export default async function InstallationAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireOrgSession();
  // Org owners without the platform role still have the Organization settings tab.
  if (session.role !== "ADMIN") redirect("/organization/settings");
  return (
    <AdminLayout>
      <div className="space-y-6">
        <PlatformNav />
        {children}
      </div>
    </AdminLayout>
  );
}
