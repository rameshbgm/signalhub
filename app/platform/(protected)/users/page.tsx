import { sql } from "kysely";
import { UserCog, UsersRound } from "lucide-react";
import { TeamMemberCreateForm } from "@/components/admin/TeamMemberCreateForm";
import { SectionTabs } from "@/components/platform/table/SectionTabs";
import { pageLinks, sortLinks } from "@/components/platform/table/links";
import { MembersTable, type MemberRow } from "@/components/platform/table/MembersTable";
import { TableCard } from "@/components/platform/table/TableCard";
import { UsersTable, type UserRow } from "@/components/platform/table/UsersTable";
import { PageHeader } from "@/components/ui/page-header";
import { requireCapability } from "@/lib/admin-guard";
import { MEMBERSHIP_ROLES } from "@/lib/identity";
import { getOrganizationMembers } from "@/lib/memberships";
import { requirePlatformPageCapability } from "@/lib/platform-page-guard";
import { hasPlatformCapability } from "@/lib/platform-policy";
import { mfaOverview } from "@/lib/mfa/requests";
import { database } from "@/lib/postgres/client";
import { applyTableQuery, parseTableQuery, type SortDir } from "@/lib/table-query";

const BASE = "/organization/platform/users";
const USER_SORTS = ["name", "email", "status", "created"] as const;
const MEMBER_SORTS = ["name", "email", "role", "status", "added"] as const;
const roleLabel = (role: string) => role.replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());

type Search = Record<string, string | string[] | undefined>;

export default async function UserManagementPage({ searchParams }: { searchParams: Promise<Search> }) {
  const actor = await requirePlatformPageCapability("users.read");
  const params = await searchParams;
  const tab: "users" | "teams" = params.tab === "teams" ? "teams" : "users";
  const canMutate = hasPlatformCapability(actor.role, "users.disable");
  const canDelete = hasPlatformCapability(actor.role, "users.delete");
  const session = await requireCapability("team.manage");

  const [{ count: userTotal }, members, pages] = await Promise.all([
    database.selectFrom("users").select((expression) => expression.fn.countAll<string>().as("count")).executeTakeFirstOrThrow(),
    getOrganizationMembers(session.orgId),
    database.selectFrom("pages").select(["id", "name"]).where("orgId", "=", session.orgId).where("deletedAt", "is", null).orderBy("name").execute(),
  ]);
  const organization = await database.selectFrom("organizations").select("name").where("id", "=", session.orgId).executeTakeFirst();
  const counts = { users: Number(userTotal), teams: members.filter((member) => member.status !== "REVOKED").length };

  const header = (
    <>
      <PageHeader
        title="User management"
        description="Every account on this installation, and the people who have access to the current organization."
        icon={UsersRound}
        hue="violet"
      />
      <SectionTabs label="User management" active={tab} tabs={[
        { id: "users", label: "Users", icon: UsersRound, href: BASE, count: counts.users },
        { id: "teams", label: "Teams", icon: UserCog, href: `${BASE}?tab=teams`, count: counts.teams },
      ]} />
    </>
  );

  if (tab === "teams") {
    const defaults = { sort: "name", dir: "asc" as SortDir };
    const query = parseTableQuery(params, { sorts: MEMBER_SORTS, defaultSort: "name", defaultDir: "asc", filters: { role: MEMBERSHIP_ROLES, status: ["ACTIVE", "INVITED", "REVOKED"] } });
    const result = applyTableQuery(members, query, {
      search: (member) => `${member.name} ${member.email} ${member.username}`,
      sortKey: (member, sort) => sort === "email" ? member.email : sort === "role" ? member.role : sort === "status" ? member.status : sort === "added" ? member.createdAt.getTime() : member.name,
      filter: (member, name, value) => (name === "role" ? member.role === value : member.status === value),
    });
    const current = { ...query, page: result.page };
    const rows: MemberRow[] = result.rows.map((member) => ({
      id: member.id, name: member.name, email: member.email, username: member.username, role: member.role, status: member.status,
      createdAt: member.createdAt.toISOString(), pageIds: member.pageIds, self: member.id === session.membershipId,
    }));
    const hrefFor = pageLinks(BASE, current, defaults, { tab: "teams" });
    return (
      <div className="space-y-6">
        {header}
        <details className="group rounded-card border border-line bg-surface shadow-card open:pb-1">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
            Add a team member
            <span className="ml-auto text-xs font-normal text-ink-dim group-open:hidden">Create an active user for {organization?.name ?? "this organization"}</span>
          </summary>
          <div className="px-1 pb-1"><TeamMemberCreateForm pages={pages} /></div>
        </details>
        <TableCard
          search={{ q: query.q, placeholder: "Search members…" }}
          filters={[
            { name: "role", label: "Role", value: query.filters.role, options: [{ value: "all", label: "All roles" }, ...MEMBERSHIP_ROLES.map((role) => ({ value: role, label: roleLabel(role) }))] },
            { name: "status", label: "Status", value: query.filters.status, options: [{ value: "all", label: "All statuses" }, { value: "ACTIVE", label: "Active" }, { value: "INVITED", label: "Invited" }, { value: "REVOKED", label: "Removed" }] },
          ]}
          total={result.total} page={result.page} size={query.size} href={hrefFor} noun="member"
        >
          <MembersTable rows={rows} pages={pages} orgName={organization?.name ?? "this organization"} sorts={sortLinks(BASE, MEMBER_SORTS, current, defaults, { tab: "teams" }, ["added"])} filtered={Boolean(query.q) || Object.values(query.filters).some((value) => value !== "all")} />
        </TableCard>
      </div>
    );
  }

  const defaults = { sort: "created", dir: "desc" as SortDir };
  const query = parseTableQuery(params, { sorts: USER_SORTS, defaultSort: "created", defaultDir: "desc", filters: { status: ["active", "disabled"], role: MEMBERSHIP_ROLES } });
  let filtered = database.selectFrom("users");
  if (query.q) {
    const pattern = `%${query.q.replace(/[\\%_]/g, "\\$&")}%`;
    filtered = filtered.where((expression) => expression.or([
      expression("email", "ilike", pattern), expression("name", "ilike", pattern), expression("username", "ilike", pattern),
    ]));
  }
  if (query.filters.status !== "all") filtered = filtered.where("disabled", "=", query.filters.status === "disabled");
  if (query.filters.role !== "all") {
    filtered = filtered.where((expression) => expression.exists(
      expression.selectFrom("memberships").select("memberships.id").whereRef("memberships.userId", "=", "users.id").where("memberships.role", "=", query.filters.role as (typeof MEMBERSHIP_ROLES)[number]),
    ));
  }
  const matching = Number((await filtered.select((expression) => expression.fn.countAll<string>().as("count")).executeTakeFirstOrThrow()).count);
  const lastPage = Math.max(1, Math.ceil(matching / query.size));
  const page = Math.min(query.page, lastPage);
  const column = { name: "name", email: "email", status: "disabled", created: "createdAt" }[query.sort] as "name" | "email" | "disabled" | "createdAt";
  const users = await filtered
    .select(["id", "name", "email", "username", "disabled", "createdAt", "passwordHash", "oidcIssuer"])
    .orderBy(column === "name" || column === "email" ? sql`lower(${sql.ref(column)})` : column, query.dir)
    .orderBy("id")
    .limit(query.size).offset((page - 1) * query.size)
    .execute();
  const memberships = users.length
    ? await database.selectFrom("memberships").innerJoin("organizations", "organizations.id", "memberships.orgId")
        .select(["memberships.userId", "memberships.role", "memberships.status", "organizations.name as orgName"])
        .where("memberships.userId", "in", users.map((user) => user.id)).orderBy("organizations.name").execute()
    : [];
  const mfa = await mfaOverview(users.map((user) => user.id));
  const rows: UserRow[] = users.map((user) => ({
    mfa: {
      devices: mfa.get(user.id)?.devices ?? 0, lastUsedAt: mfa.get(user.id)?.lastUsedAt?.toISOString() ?? null,
      lockedUntil: mfa.get(user.id)?.lockedUntil?.toISOString() ?? null, reenroll: mfa.get(user.id)?.reenroll ?? false,
    },
    id: user.id, name: user.name, email: user.email, username: user.username, disabled: user.disabled,
    createdAt: user.createdAt.toISOString(), hasPassword: Boolean(user.passwordHash), oidc: Boolean(user.oidcIssuer),
    self: user.id === actor.userId,
    orgs: memberships.filter((membership) => membership.userId === user.id).map((membership) => ({ name: membership.orgName, role: membership.role, status: membership.status })),
  }));
  const current = { ...query, page };
  const hrefFor = pageLinks(BASE, current, defaults);

  return (
    <div className="space-y-6">
      {header}
      <TableCard
        search={{ q: query.q, placeholder: "Search users…" }}
        filters={[
          { name: "status", label: "Status", value: query.filters.status, options: [{ value: "all", label: "All statuses" }, { value: "active", label: "Active" }, { value: "disabled", label: "Disabled" }] },
          { name: "role", label: "Role", value: query.filters.role, options: [{ value: "all", label: "Any role" }, ...MEMBERSHIP_ROLES.map((role) => ({ value: role, label: roleLabel(role) }))] },
        ]}
        total={matching} page={page} size={query.size} href={hrefFor} noun="user"
      >
        <UsersTable rows={rows} canMutate={canMutate} canDelete={canDelete} canManageMfa={hasPlatformCapability(actor.role, "mfa.manage")} sorts={sortLinks(BASE, USER_SORTS, current, defaults, {}, ["created"])} filtered={Boolean(query.q) || Object.values(query.filters).some((value) => value !== "all")} />
      </TableCard>
    </div>
  );
}
