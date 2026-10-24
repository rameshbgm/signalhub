import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { requireSession } from "@/lib/require-session";
import { MfaCard } from "@/components/admin/MfaCard";
import { SessionsTable } from "@/components/platform/table/SessionsTable";
import { PageHeader } from "@/components/ui/page-header";

export default async function SecurityPage() {
  const { session } = await requireSession();
  // Admins manage their MFA on the Security section's Identity tab and their sessions under Audit.
  if (session.role === "ADMIN") redirect("/organization/platform/identity");
  return (
    <div className="space-y-6">
      <PageHeader title="Security" description="Manage multi-factor authentication and revoke signed-in devices." icon={ShieldCheck} hue="violet" />
      <MfaCard />
      <SessionsTable />
    </div>
  );
}
