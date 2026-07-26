import AdminLayout from "@/app/admin/(protected)/layout";
import { requireOrgSession } from "@/lib/admin-guard";
import { redirect } from "next/navigation";

export default async function InstallationAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireOrgSession();
  if (session.role !== "ADMIN") redirect("/organization");
  return <AdminLayout>{children}</AdminLayout>;
}
