import { notFound } from "next/navigation";
import { FluentSelect } from "@/components/FluentSelect";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { PlatformSubmitButton } from "@/components/platform/PlatformSubmitButton";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { activePageFilter } from "@/lib/page-lifecycle";
import { createAccessGroup, createAccessUser, deleteAccessGroup, deleteAccessUser } from "../access-actions";
import { updatePrivatePagePassword } from "../../actions";

export default async function PageAccess({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const page = await collections.pages().findOne(activePageFilter({ _id: oid(pageId), orgId: oid(session.orgId) }));
  if (!page) notFound();
  if (page.type === "PUBLIC") return <AccessSummary title="Public access" description="Anyone with the public URL can view this page. The access model is chosen when the page is created." />;
  if (page.type === "PRIVATE") return (
    <div className="space-y-5">
      <AccessSummary title="Shared-password access" description="Visitors enter one shared password before viewing this page. The password itself is never displayed after saving." />
      <section className="border border-[var(--line)] bg-[var(--surface)] p-5">
        <h2 className="font-mono font-semibold">Replace page password</h2>
        <PlatformActionForm action={updatePrivatePagePassword.bind(null, pageId)} successMessage="Page password updated" className="mt-4 max-w-lg space-y-3">
          <label className="block text-xs font-semibold text-[var(--fg-soft)]">New password<input name="password" type="password" required minLength={12} className="mt-1.5 w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm" /></label>
          <PlatformSubmitButton pendingLabel="Updating password…" className="bg-[var(--cyan)] px-4 py-2 text-sm font-semibold text-[var(--on-cyan)]">Update password</PlatformSubmitButton>
        </PlatformActionForm>
      </section>
    </div>
  );

  const [groupDocs, userDocs, components] = await Promise.all([
    collections.pageAccessGroups().find({ pageId: page._id }).toArray(),
    collections.pageAccessUsers().find({ pageId: page._id }).toArray(),
    page.isHub ? Promise.resolve([]) : collections.components().find({ pageId: page._id }).sort({ order: 1 }).toArray(),
  ]);
  const groups = groupDocs.map(toId);
  const groupById = new Map(groupDocs.map((group) => [group._id.toHexString(), group.name]));
  const users = userDocs.map((user) => ({ ...toId(user), groupName: user.groupId ? groupById.get(user.groupId.toHexString()) ?? null : null }));
  return (
    <div className="space-y-5">
      <AccessSummary title="Audience-specific access" description={page.isHub ? "Each visitor signs in to the hub. Status pages assigned to it continue to enforce their own access rules independently." : "Each visitor signs in and sees only the services assigned directly or through their group."} />
      <section className="border border-[var(--line)] bg-[var(--surface)] p-5">
        <h2 className="font-mono font-semibold">Access groups</h2>
        <PlatformActionForm action={createAccessGroup.bind(null, pageId)} successMessage="Access group added" className="mt-4 grid gap-3 border-b border-[var(--line)] pb-5 sm:grid-cols-2">
          <input name="name" required maxLength={120} placeholder="Group name" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm" />
          {!page.isHub && <ComponentChoices components={components} />}
          <button className="w-fit border border-[var(--line-bright)] px-3 py-2 text-sm font-semibold sm:col-span-2">Add group</button>
        </PlatformActionForm>
        <div className="mt-4 space-y-2">{groups.map((group) => <div key={group.id} className="flex items-center justify-between border border-[var(--line)] px-3 py-2 text-sm"><span>{group.name}</span><form action={deleteAccessGroup.bind(null, pageId, group.id)}><button className="text-xs font-semibold text-[var(--red)]">Delete</button></form></div>)}</div>
      </section>
      <section className="border border-[var(--line)] bg-[var(--surface)] p-5">
        <h2 className="font-mono font-semibold">Access users</h2>
        <PlatformActionForm action={createAccessUser.bind(null, pageId)} successMessage="Access user added" className="mt-4 grid gap-3 border-b border-[var(--line)] pb-5 sm:grid-cols-2">
          <input name="email" type="email" required placeholder="Customer email" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm" />
          <input name="password" type="password" required minLength={12} placeholder="Temporary password" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm" />
          <FluentSelect aria-label="Access group" name="groupId" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm"><option value="">No group</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</FluentSelect>
          {!page.isHub && <ComponentChoices components={components} />}
          <button className="w-fit bg-[var(--cyan)] px-3 py-2 text-sm font-semibold text-[var(--on-cyan)] sm:col-span-2">Add user</button>
        </PlatformActionForm>
        <div className="mt-4 space-y-2">{users.map((user) => <div key={user.id} className="flex items-center justify-between border border-[var(--line)] px-3 py-2 text-sm"><span>{user.email}{user.groupName && <span className="ml-2 text-xs text-[var(--fg-dim)]">{user.groupName}</span>}</span><form action={deleteAccessUser.bind(null, pageId, user.id)}><button className="text-xs font-semibold text-[var(--red)]">Delete</button></form></div>)}</div>
      </section>
    </div>
  );
}

function AccessSummary({ title, description }: { title: string; description: string }) {
  return <section className="border border-[var(--line)] bg-[var(--surface)] p-5"><p className="font-mono text-xs font-semibold uppercase tracking-wider text-[var(--cyan)]">Access model</p><h2 className="mt-1 font-mono text-lg font-semibold">{title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--fg-dim)]">{description}</p></section>;
}

function ComponentChoices({ components }: { components: Array<{ _id: { toHexString(): string }; name: string }> }) {
  return <div className="flex flex-wrap gap-2 border border-[var(--line)] p-2 text-xs text-[var(--fg-soft)]">{components.map((component) => <label key={component._id.toHexString()} className="flex items-center gap-1"><input type="checkbox" name="componentIds" value={component._id.toHexString()} /> {component.name}</label>)}</div>;
}
