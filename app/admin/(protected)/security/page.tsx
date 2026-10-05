import { ShieldCheck } from "lucide-react";
import { requireSession } from "@/lib/require-session";
import { SecurityManager } from "@/components/admin/SecurityManager";
import { PageHeader } from "@/components/ui/page-header";

export default async function SecurityPage() {
  const { session } = await requireSession();
  return (
    <div className="space-y-8">
      <PageHeader
        title="Security"
        description="Manage multi-factor authentication and revoke signed-in devices."
        icon={ShieldCheck}
        hue="rose"
      />
      <SecurityManager enrollmentRequired={session.mfaVerified === false} />
    </div>
  );
}
