import Link from "next/link";
import { collections } from "@/lib/db";
import { requirePlatformCapability } from "@/lib/admin-guard";
import { hasPlatformCapability } from "@/lib/platform-policy";
import { revokeSupportSession } from "@/app/platform/(protected)/orgs/actions";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { PlatformSubmitButton } from "@/components/platform/PlatformSubmitButton";

export default async function PlatformSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const actor = await requirePlatformCapability("support.view");
  const state = (await searchParams).state ?? "all";
  const now = new Date();
  const filter =
    state === "active"
      ? { revokedAt: null, expiresAt: { $gt: now } }
      : state === "ended"
        ? { $or: [{ revokedAt: { $ne: null } }, { expiresAt: { $lte: now } }] }
        : {};
  const sessions = await collections
    .supportSessions()
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(200)
    .toArray();
  const [organizations, admins] = await Promise.all([
    collections
      .organizations()
      .find({ _id: { $in: sessions.map((session) => session.orgId) } })
      .toArray(),
    collections
      .platformAdmins()
      .find({ _id: { $in: sessions.map((session) => session.platformAdminId) } })
      .toArray(),
  ]);
  const orgById = new Map(
    organizations.map((organization) => [organization._id.toHexString(), organization])
  );
  const adminById = new Map(admins.map((admin) => [admin._id.toHexString(), admin]));
  const canRevoke = hasPlatformCapability(actor.role, "support.operate");

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="font-mono text-2xl font-semibold text-[var(--fg)]">Support sessions</h1>
        <p className="mt-1 text-sm text-[var(--fg-soft)]">
          Immutable access history with mode, approved scope, reason, expiry, and revocation evidence.
        </p>
      </div>
      <div className="flex gap-2 text-xs">
        {["all", "active", "ended"].map((value) => (
          <Link
            key={value}
            href={`/platform/support?state=${value}`}
            className={`border px-3 py-1.5 font-semibold capitalize ${state === value ? "border-[var(--cyan)] text-[var(--cyan)]" : "border-[var(--line)] text-[var(--fg-soft)]"}`}
          >
            {value}
          </Link>
        ))}
      </div>
      <div className="space-y-3">
        {sessions.map((support) => {
          const active = !support.revokedAt && support.expiresAt > now;
          const organization = orgById.get(support.orgId.toHexString());
          const admin = adminById.get(support.platformAdminId.toHexString());
          return (
            <article key={support._id.toHexString()} className="border border-[var(--line)] bg-[var(--surface)] p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-[var(--fg)]">
                      {organization?.name ?? "Purged organization"}
                    </h2>
                    <span className={`px-2 py-0.5 text-[10px] font-semibold ${active ? "bg-[var(--green-soft)] text-[var(--green)]" : "bg-[var(--bg)] text-[var(--fg-dim)]"}`}>
                      {active ? "ACTIVE" : support.revokedAt ? "REVOKED" : "EXPIRED"}
                    </span>
                    <span className="bg-[var(--cyan-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--cyan)]">
                      {support.mode ?? "VIEW"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--fg-soft)]">
                    {admin?.email ?? support.platformAdminId.toHexString()} · started {support.createdAt.toLocaleString()} · expires {support.expiresAt.toLocaleString()}
                  </p>
                  <p className="mt-2 text-sm text-[var(--fg)]">{support.reason}</p>
                  {(support.scopes?.length ?? 0) > 0 && (
                    <p className="mt-2 font-mono text-[11px] text-[var(--fg-dim)]">
                      Scope: {support.scopes!.join(", ")}
                    </p>
                  )}
                  {support.revokedReason && (
                    <p className="mt-2 text-xs text-[var(--red)]">
                      Revoked: {support.revokedReason}
                    </p>
                  )}
                </div>
                {active && canRevoke && (
                  <PlatformActionForm
                    action={revokeSupportSession.bind(null, support._id.toHexString())}
                    successMessage="Support session revoked."
                    className="flex flex-wrap gap-2"
                  >
                    <input
                      name="reason"
                      minLength={10}
                      required
                      placeholder="Revocation reason"
                      className="w-44 border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-xs"
                    />
                    <PlatformSubmitButton pendingLabel="Revoking…" confirmMessage="Revoke this support session immediately?" className="border border-[var(--red)]/40 px-3 py-1.5 text-xs font-semibold text-[var(--red)]">
                      Revoke
                    </PlatformSubmitButton>
                  </PlatformActionForm>
                )}
              </div>
            </article>
          );
        })}
        {sessions.length === 0 && (
          <p className="border border-[var(--line)] bg-[var(--surface)] p-4 text-sm text-[var(--fg-dim)]">
            No support sessions in this view.
          </p>
        )}
      </div>
    </div>
  );
}
