import AdminLayout from "@/app/admin/(protected)/layout";
import { PlatformNav } from "@/components/platform/PlatformNav";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { Alert } from "@/components/ui/alert";
import { requirePlatformPageCapability } from "@/lib/platform-page-guard";
import { database } from "@/lib/postgres/client";
import { organizationIsActive } from "@/lib/organization-state";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function InstallationAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePlatformPageCapability("overview.read");
  if (session.mustCompleteProfile) redirect("/organization/change-password");
  const organization = await database.selectFrom("organizations").selectAll()
    .where("id", "=", session.orgId).executeTakeFirst();
  if (!organization || organization.suspended || !organizationIsActive(organization)) {
    return (
      <div className="min-h-screen bg-canvas text-ink">
        <a href="#platform-main" className="sr-only focus:not-sr-only focus:absolute focus:bg-surface focus:p-3">Skip to content</a>
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <Link href="/organization/platform" className="rounded-control font-bold text-primary-ink outline-none focus-visible:ring-4 focus-visible:ring-primary/25">SignalHub · Platform administration</Link>
            <LogoutButton compact />
          </div>
        </header>
        <main id="platform-main" className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
          <Alert title="Platform access is available">
            Your current workspace is suspended or unavailable. Workspace access remains blocked; you can review and reactivate organizations here.
          </Alert>
          <PlatformNav />
          {children}
        </main>
      </div>
    );
  }
  return (
    <AdminLayout>
      <div className="space-y-6">
        <PlatformNav />
        {children}
      </div>
    </AdminLayout>
  );
}
