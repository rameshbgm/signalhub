import Link from "next/link";
import { requireSession } from "@/lib/require-session";
import { SetupStepper } from "@/components/admin/SetupStepper";
import { TeamInviteForm } from "@/components/admin/TeamInviteForm";
import { getOrganizationMembers } from "@/lib/memberships";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";

export default async function SetupTeamPage({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const { org } = await requireSession();
  const session = await requireCapability("team.manage", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const members = await getOrganizationMembers(org.id);

  return (
    <div>
      <SetupStepper pageId={pageId} current="team" />
      <h1 className="font-mono text-2xl font-semibold text-[var(--fg)]">Invite your team</h1>
      <p className="mt-3 text-sm text-[var(--fg-soft)] leading-relaxed max-w-lg">
        Owners control organization ownership. Admins manage users and
        configuration. Responders run incidents and day-to-day reliability
        workflows. Organization deletion is handled by platform administrators
        through the suspend-and-purge lifecycle.
      </p>

      <TeamInviteForm
        scopedPageId={pageId}
        canGrantOwnership={session.role === "OWNER"}
        className="mt-8 grid gap-3 border border-[var(--line)] bg-[var(--surface)] p-4 sm:grid-cols-2"
      />

      <div className="mt-6 bg-[var(--surface)] border border-[var(--line)] divide-y divide-[var(--line)]">
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between p-3 text-sm gap-2">
            <div className="min-w-0">
              <span className="font-medium text-[var(--fg)]">{m.name}</span>
              <span className="text-xs text-[var(--fg-dim)] ml-2">{m.email}</span>
            </div>
            <span className="text-[10px] uppercase tracking-wide bg-[var(--surface-raised)] text-[var(--fg-soft)] px-1.5 py-0.5 shrink-0">{m.role}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mt-12 pt-6 border-t border-[var(--line)]">
        <Link href={`/admin/pages/${pageId}/setup/notifications`} className="text-sm text-[var(--fg-soft)] hover:text-[var(--fg)]">
          ← Back
        </Link>
        <div className="flex gap-3 items-center">
          <Link href={`/admin/pages/${pageId}/setup/incidents`} className="text-sm text-[var(--fg-soft)] hover:text-[var(--fg)] self-center">
            Skip
          </Link>
          <Link href={`/admin/pages/${pageId}/setup/incidents`} className="bg-[var(--cyan)] text-[var(--on-cyan)] px-5 py-2.5 text-sm font-semibold font-mono">
            Next: Incidents →
          </Link>
        </div>
      </div>
    </div>
  );
}
