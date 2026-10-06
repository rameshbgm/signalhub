import { Pencil, Trash2, UsersRound } from "lucide-react";
import { requireSession } from "@/lib/require-session";
import { Select } from "@/components/ui/select";
import {
  removeMember,
  updateMemberRole,
} from "./actions";
import { TeamMemberCreateForm } from "@/components/admin/TeamMemberCreateForm";
import { getOrganizationMembers } from "@/lib/memberships";
import { database } from "@/lib/postgres/client";
import { MEMBERSHIP_ROLES } from "@/lib/identity";
import { requireCapability } from "@/lib/admin-guard";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<string, StatusTone> = { ACTIVE: "ok", INVITED: "warn" };

function sentence(value: string) {
  const text = value.replaceAll("_", " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default async function TeamPage() {
  const { org } = await requireSession();
  await requireCapability("team.manage");
  const [members, pages] = await Promise.all([
    getOrganizationMembers(org.id),
    database.selectFrom("pages").selectAll()
      .where("orgId", "=", org.id)
      .where("deletedAt", "is", null)
      .orderBy("name")
      .execute(),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Users and roles"
        description="Create active organization users, assign an operational role, and optionally limit access to selected pages."
        icon={UsersRound}
        hue="indigo"
      />

      <TeamMemberCreateForm pages={pages} />

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>{members.length} {members.length === 1 ? "person has" : "people have"} access to this organization.</CardDescription>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <EmptyState icon={UsersRound} hue="indigo" title="No teammates yet" description="Create a user above to give someone access to this organization." className="border-0 bg-transparent py-8" />
          ) : (
            <ul className="space-y-2">
              {members.map((m) => (
                <li key={m.id} className="flex flex-col gap-3 rounded-control border border-line px-3.5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <span aria-hidden="true" className="inline-grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary-ink">
                      {m.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium text-ink">{m.name}</span>
                        <Badge>{sentence(m.role)}</Badge>
                        <StatusBadge tone={STATUS_TONE[m.status] ?? "danger"}>{sentence(m.status)}</StatusBadge>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-ink-dim">{m.username} · {m.email}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {m.status !== "REVOKED" && (
                      <details className="relative">
                        <summary className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
                          <Pencil aria-hidden size={14} />
                          Edit access
                        </summary>
                        <form
                          action={updateMemberRole.bind(null, m.id)}
                          className="absolute left-0 z-20 mt-2 w-72 max-w-[calc(100vw-3rem)] space-y-4 rounded-card border border-line bg-surface shadow-card p-4 shadow-float sm:left-auto sm:right-0"
                        >
                          <Field label="Role" htmlFor={`role-${m.id}`}>
                            <Select aria-label="Role" id={`role-${m.id}`} name="role" defaultValue={m.role} className="w-full">
                              {MEMBERSHIP_ROLES.map((role) => (
                                <option key={role} value={role}>
                                  {role.replaceAll("_", " ")}
                                </option>
                              ))}
                            </Select>
                          </Field>
                          <fieldset className="rounded-control border border-line p-3">
                            <legend className="px-1 text-xs font-medium text-ink-soft">
                              Page scope (empty means all)
                            </legend>
                            <div className="max-h-36 space-y-2 overflow-y-auto">
                              {pages.map((page) => (
                                <label key={page.id} className="flex items-center gap-2.5 text-sm text-ink-soft">
                                  <Checkbox
                                    name="pageIds"
                                    value={page.id}
                                    defaultChecked={m.pageIds?.includes(page.id)}
                                  />
                                  {page.name}
                                </label>
                              ))}
                            </div>
                          </fieldset>
                          <Button type="submit" className="w-full">
                            Save access
                          </Button>
                        </form>
                      </details>
                    )}
                    {m.status === "REVOKED" ? (
                      <span className="text-xs text-ink-dim">Create this email again to reactivate</span>
                    ) : (
                      <form action={removeMember.bind(null, m.id)}>
                        <Button type="submit" variant="ghost" size="sm" className="hover:!bg-danger-bg hover:!text-danger-fg [&_svg]:!text-ink-dim hover:[&_svg]:!text-danger-fg">
                          <Trash2 aria-hidden size={14} />
                          Remove
                        </Button>
                      </form>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
