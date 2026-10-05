import Link from "next/link";
import { Search, UsersRound } from "lucide-react";
import { database } from "@/lib/postgres/client";
import { requirePlatformPageCapability } from "@/lib/platform-page-guard";
import { hasPlatformCapability } from "@/lib/platform-policy";
import { disableUser, reactivateUser } from "./actions";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { PlatformSubmitButton } from "@/components/platform/PlatformSubmitButton";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
    <div className="space-y-8">
      <PageHeader
        title="Global users"
        description="Inspect cross-organization membership and apply emergency account freezes."
        icon={UsersRound}
        hue="violet"
      />

      <Card className="overflow-hidden">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>Accounts</CardTitle>
            <CardDescription>
              Showing {users.length} user{users.length === 1 ? "" : "s"}.
            </CardDescription>
          </div>
          <form className="flex w-full gap-2 sm:w-auto">
            <Input
              name="q"
              defaultValue={query}
              aria-label="Search users"
              placeholder="Email or name"
              className="sm:w-64"
            />
            <Button type="submit" variant="secondary">
              <Search aria-hidden size={16} />
              Search
            </Button>
          </form>
        </CardHeader>

        {users.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            hue="violet"
            title={query ? "No users match this search" : "No users yet"}
            description={query ? "Try a different email address or name." : "Accounts appear here once an organization admin creates them."}
            action={query ? <Link href="/organization/platform/users" className={buttonVariants({ variant: "secondary" })}>Clear search</Link> : undefined}
            className="border-0 bg-transparent py-12"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Identity</TableHead>
                <TableHead className="max-md:hidden">Memberships</TableHead>
                <TableHead className="max-lg:hidden">Authentication</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            {users.map((user) => {
              const userMemberships = memberships.filter((membership) =>
                membership.userId === user.id
              );
              const membershipList = userMemberships.length ? (
                <ul className="space-y-1 text-xs text-ink-soft">
                  {userMemberships.map((membership) => (
                    <li key={membership.id}>
                      <span className="font-medium text-ink">{orgName.get(membership.orgId) ?? "Deleted organization"}</span>
                      {" · "}{membership.role} · {membership.status}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-xs text-ink-dim">No memberships</span>
              );
              const authentication = (
                <>
                  <p>{user.passwordHash ? "Password" : "No password"}</p>
                  <p>{user.oidcIssuer ? "OIDC linked" : "OIDC not linked"}</p>
                </>
              );
              return (
                <TableBody key={user.id} className="border-b border-line last:border-0">
                  <TableRow className={canMutate ? "border-b-0 align-top" : "align-top"}>
                    <TableCell>
                      <p className="font-medium text-ink">{user.name}</p>
                      <p className="text-xs text-ink-soft">{user.email}</p>
                      <p className="mt-1 break-all font-mono text-2xs text-ink-dim">{user.id}</p>
                      <div className="mt-3 md:hidden">{membershipList}</div>
                      <div className="mt-2 text-xs text-ink-soft lg:hidden">{authentication}</div>
                    </TableCell>
                    <TableCell className="max-md:hidden">{membershipList}</TableCell>
                    <TableCell className="text-xs max-lg:hidden">{authentication}</TableCell>
                    <TableCell>
                      <StatusBadge tone={user.disabled ? "danger" : "ok"}>{user.disabled ? "Disabled" : "Active"}</StatusBadge>
                    </TableCell>
                  </TableRow>
                  {canMutate && (
                    <tr>
                      <td colSpan={4} className="px-4 pb-4 pt-0">
                        <div className="rounded-control border border-line bg-sunken/50 p-4">
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
                            className="flex items-end gap-3"
                          >
                            <Field
                              label={user.disabled ? "Reactivation reason" : "Emergency reason or ticket"}
                              htmlFor={`user-reason-${user.id}`}
                              className="min-w-56 flex-1"
                            >
                              <Input
                                id={`user-reason-${user.id}`}
                                name="reason"
                                minLength={10}
                                required
                                placeholder="Emergency reason / ticket"
                              />
                            </Field>
                            <PlatformSubmitButton
                              variant={user.disabled ? "soft" : "destructive"}
                              pendingLabel={user.disabled ? "Reactivating…" : "Disabling…"}
                              confirmMessage={user.disabled ? undefined : `Disable ${user.email} across every organization?`}
                            >
                              {user.disabled ? "Reactivate" : "Disable"}
                            </PlatformSubmitButton>
                          </PlatformActionForm>
                        </div>
                      </td>
                    </tr>
                  )}
                </TableBody>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}
