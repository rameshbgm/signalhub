import { requireSession } from "@/lib/require-session";
import { SecurityManager } from "@/components/admin/SecurityManager";

export default async function SecurityPage() {
  const { session } = await requireSession();
  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="font-mono text-xl font-semibold">Security</h1>
        <p className="mt-1 text-sm text-[var(--fg-soft)]">Manage multi-factor authentication and revoke signed-in devices.</p>
      </div>
      <SecurityManager enrollmentRequired={session.mfaVerified === false} />
    </div>
  );
}
