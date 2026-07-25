import { requireSession } from "@/lib/require-session";
import {
  removeMember,
  updateMemberRole,
} from "./actions";
import {
  TeamInviteForm,
  TeamInviteRenewForm,
  TeamMemberReactivationForm,
} from "@/components/admin/TeamInviteForm";
import { getOrganizationMembers } from "@/lib/memberships";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { MEMBERSHIP_ROLES } from "@/lib/identity";
import { requireCapability } from "@/lib/admin-guard";

export default async function TeamPage() {
  const { org } = await requireSession();
  const session = await requireCapability("team.manage");
  const [members, pages] = await Promise.all([
    getOrganizationMembers(org.id),
    collections.pages().find({ orgId: oid(org.id), isHub: false }).sort({ name: 1 }).toArray().then((docs) => docs.map(toId)),
  ]);

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h1 className="font-mono text-2xl font-semibold tracking-tight text-[var(--fg)]">Team</h1>
        <p className="mt-1 text-sm text-[var(--fg-soft)]">
          Grant an explicit operational role and optionally limit access to selected pages.
        </p>
      </div>

      <TeamInviteForm
        pages={pages}
        canGrantOwnership={session.role === "OWNER"}
      />

      <div className="divide-y divide-[var(--line)] border border-[var(--line)] bg-[var(--surface)]">
        {members.map((m) => (
          <div key={m.id} className="flex flex-col gap-3 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-raised)] font-mono text-xs font-semibold text-[var(--fg)]">
                {m.name.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[var(--fg)]">{m.name}</span>
                  <span
                    className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-[var(--surface-raised)] text-[var(--fg-soft)]"
                  >
                    {m.role}
                  </span>
                  <span className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    m.status === "ACTIVE"
                      ? "bg-[var(--green-soft)] text-[var(--green)]"
                      : m.status === "INVITED"
                        ? "bg-[var(--amber-soft)] text-[var(--amber)]"
                        : "bg-[var(--red-soft)] text-[var(--red)]"
                  }`}>
                    {m.status}
                  </span>
                </div>
                <span className="text-xs text-[var(--fg-dim)]">{m.email}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {m.status !== "REVOKED" &&
                (session.role === "OWNER" || m.role !== "OWNER") && (
                <details className="relative">
                  <summary className="cursor-pointer border border-[var(--line)] px-2.5 py-1 text-xs">
                    Edit access
                  </summary>
                  <form
                    action={updateMemberRole.bind(null, m.id)}
                    className="absolute right-0 z-20 mt-1 w-72 space-y-3 border border-[var(--line)] bg-[var(--surface)] p-3 shadow-xl"
                  >
                    <label className="block text-xs text-[var(--fg-soft)]">
                      Role
                      <select name="role" defaultValue={m.role} className="mt-1 w-full border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-xs text-[var(--fg)]">
                        {MEMBERSHIP_ROLES.filter(
                          (role) => session.role === "OWNER" || role !== "OWNER"
                        ).map((role) => (
                          <option key={role} value={role}>
                            {role.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                    </label>
                    <fieldset className="border border-[var(--line)] p-2">
                      <legend className="px-1 text-[10px] text-[var(--fg-dim)]">
                        Page scope (empty means all)
                      </legend>
                      <div className="max-h-36 space-y-1 overflow-y-auto">
                        {pages.map((page) => (
                          <label key={page.id} className="flex items-center gap-2 text-xs text-[var(--fg-soft)]">
                            <input
                              type="checkbox"
                              name="pageIds"
                              value={page.id}
                              defaultChecked={m.pageIds?.includes(page.id)}
                            />
                            {page.name}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <button className="w-full bg-[var(--cyan)] px-2 py-1.5 text-xs font-semibold text-[var(--on-cyan)]">
                      Save access
                    </button>
                  </form>
                </details>
              )}
              {m.status === "INVITED" && (
                <TeamInviteRenewForm membershipId={m.id} />
              )}
              {m.status === "REVOKED" ? (
                <TeamMemberReactivationForm membershipId={m.id} />
              ) : <form action={removeMember.bind(null, m.id)}>
                <button className="border border-[var(--red)]/30 px-2.5 py-1 text-xs font-semibold text-[var(--red)] transition-colors hover:bg-[var(--red-soft)]">Remove</button>
              </form>}
            </div>
          </div>
        ))}
        {members.length === 0 && <p className="p-4 text-sm text-[var(--fg-dim)]">No teammates yet.</p>}
      </div>
    </div>
  );
}
