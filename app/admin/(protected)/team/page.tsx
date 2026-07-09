import { requireSession } from "@/lib/require-session";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { inviteMember, removeMember } from "./actions";

export default async function TeamPage() {
  const { org } = await requireSession();
  const members = (await collections.teamMembers().find({ orgId: oid(org.id) }).sort({ createdAt: 1 }).toArray()).map(toId);

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="font-display text-2xl font-medium tracking-tight text-[var(--ink)]">Team</h1>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">Invite teammates and control what they can do.</p>
      </div>

      <form action={inviteMember} className="rounded-xl border border-black/[0.06] bg-white p-5 shadow-sm">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-soft)]">Invite a member</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <input
            name="name"
            placeholder="Full name"
            className="rounded-lg border border-black/10 px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--ink)]"
            required
          />
          <input
            name="email"
            type="email"
            placeholder="Email"
            className="rounded-lg border border-black/10 px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--ink)]"
            required
          />
          <select
            name="role"
            className="rounded-lg border border-black/10 px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--ink)]"
          >
            <option value="TENANT_ADMIN">Tenant Admin</option>
            <option value="TENANT_USER">Tenant User</option>
          </select>
          <input
            name="password"
            type="password"
            placeholder="Temporary password"
            className="rounded-lg border border-black/10 px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--ink)]"
            required
          />
          <button className="rounded-full bg-[var(--ink)] py-2.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 sm:col-span-2">
            Invite Member
          </button>
        </div>
      </form>

      <div className="rounded-xl border border-black/[0.06] bg-white shadow-sm divide-y divide-black/[0.06]">
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between p-4 text-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--paper)] font-display text-xs font-semibold text-[var(--ink)]">
                {m.name.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[var(--ink)]">{m.name}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      m.role === "TENANT_ADMIN" ? "bg-[var(--up-soft)] text-[var(--up)]" : "bg-black/[0.04] text-[var(--ink-soft)]"
                    }`}
                  >
                    {m.role === "TENANT_ADMIN" ? "Admin" : "Member"}
                  </span>
                </div>
                <span className="text-xs text-[var(--ink-soft)]">{m.email}</span>
              </div>
            </div>
            <form action={removeMember.bind(null, m.id)}>
              <button className="text-xs font-semibold text-red-600 hover:underline">Remove</button>
            </form>
          </div>
        ))}
        {members.length === 0 && <p className="p-4 text-sm text-[var(--ink-soft)]">No teammates yet.</p>}
      </div>
    </div>
  );
}
