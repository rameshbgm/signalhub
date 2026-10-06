import { notFound, redirect } from "next/navigation";
import { LockKeyhole, UsersRound } from "lucide-react";
import { Select } from "@/components/ui/select";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { PlatformSubmitButton } from "@/components/platform/PlatformSubmitButton";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { database } from "@/lib/postgres/client";
import { createAccessGroup, createAccessUser, deleteAccessGroup, deleteAccessUser } from "../access-actions";
import { updatePrivatePagePassword } from "../../actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export default async function PageAccess({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const page = await database.selectFrom("pages").selectAll().where("id", "=", pageId).where("orgId", "=", session.orgId).where("deletedAt", "is", null).executeTakeFirst();
  if (!page) notFound();
  if (page.type === "PUBLIC") redirect(`/organization/pages/${pageId}`);

  if (page.type === "PRIVATE") return (
    <div className="space-y-6">
      <AccessSummary title="Shared-password access" description="Visitors enter one shared password before viewing this page. The password itself is never displayed after saving." />
      <Card>
        <CardHeader><CardTitle>Replace page password</CardTitle><CardDescription>Visitors will use the new password the next time they open this page.</CardDescription></CardHeader>
        <CardContent><PlatformActionForm action={updatePrivatePagePassword.bind(null, pageId)} successMessage="Page password updated" className="max-w-lg space-y-4">
          <Field label="New password" htmlFor="new-page-password" required><Input id="new-page-password" name="password" type="password" required minLength={12} /></Field>
          <PlatformSubmitButton pendingLabel="Updating password…">Update password</PlatformSubmitButton>
        </PlatformActionForm></CardContent>
      </Card>
    </div>
  );

  const [groupDocs, userDocs, components] = await Promise.all([
    database.selectFrom("pageAccessGroups").selectAll().where("pageId", "=", page.id).execute(),
    database.selectFrom("pageAccessUsers").selectAll().where("pageId", "=", page.id).execute(),
    page.isHub ? Promise.resolve([]) : database.selectFrom("components").selectAll().where("pageId", "=", page.id).orderBy("order", "asc").execute(),
  ]);
  const groupById = new Map(groupDocs.map((group) => [group.id, group.name]));
  const users = userDocs.map((user) => ({ ...user, groupName: user.groupId ? groupById.get(user.groupId) ?? null : null }));

  return (
    <div className="space-y-6">
      <AccessSummary title="Audience-specific access" description={page.isHub ? "Each visitor signs in to the hub. Status pages assigned to it continue to enforce their own access rules independently." : "Each visitor signs in and sees only the services assigned directly or through their group."} />
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Access groups</CardTitle><CardDescription>Give a set of visitors access to the same services.</CardDescription></CardHeader>
          <CardContent className="space-y-5">
            <PlatformActionForm action={createAccessGroup.bind(null, pageId)} successMessage="Access group added" className="space-y-4 rounded-control bg-sunken/60 p-4">
              <Field label="Group name" htmlFor="access-group-name" required><Input id="access-group-name" name="name" required maxLength={120} /></Field>
              {!page.isHub && <ComponentChoices components={components} />}
              <Button type="submit" variant="secondary">Add group</Button>
            </PlatformActionForm>
            {groupDocs.length > 0 ? <ul className="space-y-2">{groupDocs.map((group) => <li key={group.id} className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line px-3.5 py-3 text-sm"><span className="font-medium text-ink">{group.name}</span><form action={deleteAccessGroup.bind(null, pageId, group.id)}><Button type="submit" variant="destructive" size="sm">Delete</Button></form></li>)}</ul> : <EmptyState icon={UsersRound} hue="rose" title="No access groups yet" description="Add a group above to share service access across visitors." />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Access users</CardTitle><CardDescription>Add visitors who can sign in to this page.</CardDescription></CardHeader>
          <CardContent className="space-y-5">
            <PlatformActionForm action={createAccessUser.bind(null, pageId)} successMessage="Access user added" className="space-y-4 rounded-control bg-sunken/60 p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Email address" htmlFor="access-user-email" required><Input id="access-user-email" name="email" type="email" required /></Field>
                <Field label="Temporary password" htmlFor="access-user-password" required><Input id="access-user-password" name="password" type="password" required minLength={12} /></Field>
              </div>
              <Field label="Access group" htmlFor="access-user-group"><Select id="access-user-group" name="groupId"><option value="">No group</option>{groupDocs.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</Select></Field>
              {!page.isHub && <ComponentChoices components={components} />}
              <Button type="submit">Add user</Button>
            </PlatformActionForm>
            {users.length > 0 ? <ul className="space-y-2">{users.map((user) => <li key={user.id} className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line px-3.5 py-3 text-sm"><div className="min-w-0"><p className="break-all font-medium text-ink">{user.email}</p>{user.groupName && <p className="mt-0.5 text-xs text-ink-dim">{user.groupName}</p>}</div><form action={deleteAccessUser.bind(null, pageId, user.id)}><Button type="submit" variant="destructive" size="sm">Delete</Button></form></li>)}</ul> : <EmptyState icon={UsersRound} hue="rose" title="No access users yet" description="Add a visitor above to grant access to this page." />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AccessSummary({ title, description }: { title: string; description: string }) {
  return <Card><CardContent className="flex items-start gap-4"><div className="rounded-control bg-danger-bg p-2.5 text-danger-fg"><LockKeyhole aria-hidden size={20} /></div><div><h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-ink-soft">{description}</p></div></CardContent></Card>;
}

function ComponentChoices({ components }: { components: Array<{ id: string; name: string }> }) {
  return <fieldset className="space-y-2"><legend className="text-sm font-medium text-ink">Service access</legend><div className="flex flex-wrap gap-3 rounded-control border border-line bg-surface p-3">{components.map((component) => <label key={component.id} className="flex items-center gap-2 text-sm text-ink-soft"><Checkbox name="componentIds" value={component.id} />{component.name}</label>)}</div></fieldset>;
}
