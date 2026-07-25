import { collections } from "@/lib/db";
import { requirePlatformCapability } from "@/lib/admin-guard";
import { hasPlatformCapability, normalizedPlatformRole } from "@/lib/platform-policy";
import { PlatformInviteForm } from "@/components/platform/PlatformInviteForm";
import {
  resetPlatformAdminMfa,
  revokePlatformAdminSessions,
  revokePlatformInvite,
  setPlatformAdminStatus,
  updatePlatformAdminRole,
} from "./actions";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { PlatformSubmitButton } from "@/components/platform/PlatformSubmitButton";

export default async function PlatformAdminsPage() {
  const actor = await requirePlatformCapability("admins.read");
  const [admins, invitations] = await Promise.all([
    collections.platformAdmins().find().sort({ createdAt: 1 }).toArray(),
    collections.platformInvites().find().sort({ createdAt: -1 }).limit(100).toArray(),
  ]);
  const canManage = hasPlatformCapability(actor.role, "admins.manage");
  const now = new Date();

  return (
    <div className="max-w-6xl space-y-7">
      <div>
        <h1 className="font-mono text-2xl font-semibold text-[var(--fg)]">Platform administrators</h1>
        <p className="mt-1 text-sm text-[var(--fg-soft)]">Owner, Operator, and Auditor identities use password plus mandatory TOTP and live session revocation.</p>
      </div>
      {canManage && <PlatformInviteForm />}
      <section className="space-y-3">
        <h2 className="font-mono text-lg font-semibold text-[var(--fg)]">Accounts</h2>
        {admins.map((admin) => {
          const role = normalizedPlatformRole(admin);
          const status = admin.status ?? "ACTIVE";
          const desiredStatus = status === "ACTIVE" ? "DISABLED" : "ACTIVE";
          return (
            <article key={admin._id.toHexString()} className="border border-[var(--line)] bg-[var(--surface)] p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-[var(--fg)]">{admin.name}</h3>
                    <span className="bg-[var(--cyan-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--cyan)]">{role}</span>
                    <span className={`px-2 py-0.5 text-[10px] font-semibold ${status === "ACTIVE" ? "bg-[var(--green-soft)] text-[var(--green)]" : "bg-[var(--red-soft)] text-[var(--red)]"}`}>{status}</span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--fg-soft)]">{admin.email}</p>
                  <p className="mt-1 text-xs text-[var(--fg-dim)]">MFA {admin.totpSecretCiphertext ? `enrolled ${admin.mfaEnrolledAt?.toLocaleString() ?? ""}` : "enrollment required"} · last login {admin.lastLoginAt?.toLocaleString() ?? "never"}</p>
                </div>
                {canManage && (
                  <div className="grid gap-2">
                    <PlatformActionForm
                      action={updatePlatformAdminRole.bind(null, admin._id.toHexString())}
                      successMessage="Administrator role updated."
                      className="flex flex-wrap gap-2"
                    >
                      <select name="role" defaultValue={role} className="border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-xs"><option>OWNER</option><option>OPERATOR</option><option>AUDITOR</option></select>
                      <input name="reason" minLength={10} required placeholder="Reason" className="w-32 border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-xs" />
                      <PlatformSubmitButton pendingLabel="Saving…" className="border border-[var(--cyan)]/40 px-2 py-1.5 text-xs font-semibold text-[var(--cyan)]">Save role</PlatformSubmitButton>
                    </PlatformActionForm>
                    <PlatformActionForm
                      action={setPlatformAdminStatus.bind(
                        null,
                        admin._id.toHexString(),
                        desiredStatus
                      )}
                      successMessage={
                        desiredStatus === "DISABLED"
                          ? "Administrator disabled and sessions revoked."
                          : "Administrator reactivated."
                      }
                      className="flex flex-wrap gap-2"
                    >
                      <input name="reason" minLength={10} required placeholder="Reason" className="w-32 border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-xs" />
                      <PlatformSubmitButton
                        pendingLabel={status === "ACTIVE" ? "Disabling…" : "Reactivating…"}
                        confirmMessage={status === "ACTIVE" ? `Disable ${admin.email} and revoke their live sessions?` : undefined}
                        className={`border px-2 py-1.5 text-xs font-semibold ${status === "ACTIVE" ? "border-[var(--red)]/40 text-[var(--red)]" : "border-[var(--green)]/40 text-[var(--green)]"}`}
                      >
                        {status === "ACTIVE" ? "Disable" : "Reactivate"}
                      </PlatformSubmitButton>
                    </PlatformActionForm>
                    <PlatformActionForm
                      action={revokePlatformAdminSessions.bind(
                        null,
                        admin._id.toHexString()
                      )}
                      successMessage="Administrator sessions revoked."
                      className="flex flex-wrap gap-2"
                    >
                      <input
                        name="reason"
                        minLength={10}
                        required
                        placeholder="Revocation reason"
                        className="w-32 border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-xs"
                      />
                      <PlatformSubmitButton
                        pendingLabel="Revoking…"
                        confirmMessage={`Revoke every platform and support session for ${admin.email}?`}
                        className="border border-[var(--amber)]/40 px-2 py-1.5 text-xs font-semibold text-[var(--amber)]"
                      >
                        Revoke sessions
                      </PlatformSubmitButton>
                    </PlatformActionForm>
                    {status === "ACTIVE" && admin.totpSecretCiphertext && (
                      <PlatformActionForm
                        action={resetPlatformAdminMfa.bind(
                          null,
                          admin._id.toHexString()
                        )}
                        successMessage="Administrator MFA reset and sessions revoked."
                        className="grid gap-2 border border-[var(--amber)]/20 p-2 sm:grid-cols-2"
                        messageClassName="sm:col-span-2"
                      >
                        <p className="text-[10px] text-[var(--fg-dim)] sm:col-span-2">
                          Reauthenticate as {actor.email} to reset MFA.
                        </p>
                        <input
                          name="currentPassword"
                          type="password"
                          required
                          maxLength={1024}
                          autoComplete="current-password"
                          aria-label="Your current platform password"
                          placeholder="Your current password"
                          className="min-w-0 border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-xs"
                        />
                        <input
                          name="currentTotpCode"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          pattern="[0-9]{6}"
                          minLength={6}
                          maxLength={6}
                          required
                          aria-label="Your current six-digit authenticator code"
                          placeholder="Current 6-digit code"
                          className="min-w-0 border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 font-mono text-xs"
                        />
                        <input
                          name="reason"
                          minLength={10}
                          required
                          placeholder="MFA reset reason"
                          className="min-w-0 border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-xs"
                        />
                        <PlatformSubmitButton
                          pendingLabel="Resetting…"
                          confirmMessage={`Reset MFA for ${admin.email} and revoke their active sessions?`}
                          className="border border-[var(--amber)]/40 px-2 py-1.5 text-xs font-semibold text-[var(--amber)]"
                        >
                          Reset MFA
                        </PlatformSubmitButton>
                      </PlatformActionForm>
                    )}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </section>
      <section className="space-y-3">
        <h2 className="font-mono text-lg font-semibold text-[var(--fg)]">Invitation history</h2>
        {invitations.map((invitation) => {
          const state = invitation.acceptedAt ? "ACCEPTED" : invitation.revokedAt ? "REVOKED" : invitation.expiresAt <= now ? "EXPIRED" : "PENDING";
          return (
            <article key={invitation._id.toHexString()} className="flex flex-col gap-3 border border-[var(--line)] bg-[var(--surface)] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="font-semibold text-[var(--fg)]">{invitation.name} · {invitation.role}</p><p className="mt-1 text-xs text-[var(--fg-dim)]">{invitation.email} · {state} · expires {invitation.expiresAt.toLocaleString()}</p></div>
              {canManage && state === "PENDING" && (
                <PlatformActionForm
                  action={revokePlatformInvite.bind(null, invitation._id.toHexString())}
                  successMessage="Platform invitation revoked."
                  className="flex flex-wrap gap-2"
                >
                  <input name="reason" minLength={10} required placeholder="Revocation reason" className="w-40 border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-xs" />
                  <PlatformSubmitButton pendingLabel="Revoking…" className="border border-[var(--red)]/40 px-3 py-1.5 text-xs font-semibold text-[var(--red)]">Revoke</PlatformSubmitButton>
                </PlatformActionForm>
              )}
            </article>
          );
        })}
        {invitations.length === 0 && <p className="border border-[var(--line)] bg-[var(--surface)] p-4 text-sm text-[var(--fg-dim)]">No platform invitations.</p>}
      </section>
    </div>
  );
}
