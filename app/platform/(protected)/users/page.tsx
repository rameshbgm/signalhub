import { database } from "@/lib/postgres/client";
import { requirePlatformPageCapability } from "@/lib/platform-page-guard";
import { hasPlatformCapability } from "@/lib/platform-policy";
import { disableUser, reactivateUser } from "./actions";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { PlatformSubmitButton } from "@/components/platform/PlatformSubmitButton";

export default async function PlatformUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const actor = await requirePlatformPageCapability("users.read");
  const query = (await searchParams).q?.trim() ?? "";
  let usersQuery = database.selectFrom("users").selectAll();
  if (query) {
    const pattern = `%${query}%`;
    usersQuery = usersQuery.where((expression) => expression.or([
      expression("email", "ilike", pattern),
      expression("name", "ilike", pattern),
    ]));
  }
  const users = await usersQuery.orderBy("createdAt", "desc").limit(200).execute();
  const memberships = users.length
    ? await database.selectFrom("memberships").selectAll()
        .where("userId", "in", users.map((user) => user.id)).execute()
    : [];
  const organizations = memberships.length
    ? await database.selectFrom("organizations").select(["id", "name"])
        .where("id", "in", memberships.map((membership) => membership.orgId)).execute()
    : [];
  const orgName = new Map(
    organizations.map((organization) => [organization.id, organization.name])
  );
  const canMutate = hasPlatformCapability(actor.role, "users.disable");

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-mono text-2xl font-semibold text-[var(--fg)]">Global users</h1>
          <p className="mt-1 text-sm text-[var(--fg-soft)]">
            Inspect cross-organization membership and apply emergency account freezes.
          </p>
        </div>
        <form className="flex gap-2">
          <input
            name="q"
            defaultValue={query}
            aria-label="Search users"
            placeholder="Email or name"
            className="w-56 border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs"
          />
          <button className="border border-[var(--line)] px-3 py-2 text-xs font-semibold">Search</button>
        </form>
      </div>

      <div className="overflow-x-auto border border-[var(--line)] bg-[var(--surface)]">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-[var(--line)] bg-[var(--bg)] font-mono text-[10px] uppercase tracking-wide text-[var(--fg-dim)]">
            <tr>
              <th className="px-4 py-3">Identity</th>
              <th className="px-4 py-3">Memberships</th>
              <th className="px-4 py-3">Authentication</th>
              <th className="px-4 py-3">State / emergency action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {users.map((user) => {
              const userMemberships = memberships.filter((membership) =>
                membership.userId === user.id
              );
              return (
                <tr key={user.id} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[var(--fg)]">{user.name}</p>
                    <p className="text-xs text-[var(--fg-dim)]">{user.email}</p>
                    <p className="mt-1 font-mono text-[10px] text-[var(--fg-dim)]">{user.id}</p>
                  </td>
                  <td className="px-4 py-3">
                    {userMemberships.length ? (
                      <ul className="space-y-1 text-xs text-[var(--fg-soft)]">
                        {userMemberships.map((membership) => (
                          <li key={membership.id}>
                            {orgName.get(membership.orgId) ?? "Deleted organization"} · {membership.role} · {membership.status}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-xs text-[var(--fg-dim)]">No memberships</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--fg-soft)]">
                    <p>{user.passwordHash ? "Password" : "No password"}</p>
                    <p>{user.oidcIssuer ? "OIDC linked" : "OIDC not linked"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className={`text-xs font-semibold ${user.disabled ? "text-[var(--red)]" : "text-[var(--green)]"}`}>
                      {user.disabled ? "DISABLED" : "ACTIVE"}
                    </p>
                    {canMutate && (
                      <PlatformActionForm
                        action={(user.disabled ? reactivateUser : disableUser).bind(
                          null,
                          user.id
                        )}
                        successMessage={
                          user.disabled
                            ? "User reactivated."
                            : "User disabled across all organizations."
                        }
                        className="mt-2 flex flex-wrap gap-2"
                      >
                        <input
                          name="reason"
                          minLength={10}
                          required
                          placeholder="Emergency reason / ticket"
                          className="w-48 border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-xs"
                        />
                        <PlatformSubmitButton
                          pendingLabel={user.disabled ? "Reactivating…" : "Disabling…"}
                          confirmMessage={user.disabled ? undefined : `Disable ${user.email} across every organization?`}
                          className={`border px-2 py-1.5 text-xs font-semibold ${user.disabled ? "border-[var(--green)]/40 text-[var(--green)]" : "border-[var(--red)]/40 text-[var(--red)]"}`}
                        >
                          {user.disabled ? "Reactivate" : "Disable"}
                        </PlatformSubmitButton>
                      </PlatformActionForm>
                    )}
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-[var(--fg-dim)]">No users match this search.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
