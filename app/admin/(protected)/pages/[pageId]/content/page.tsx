import Link from "next/link";
import { notFound } from "next/navigation";
import { ComponentOrderList } from "@/components/admin/ComponentOrderList";
import { FluentSelect } from "@/components/FluentSelect";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { PlatformSubmitButton } from "@/components/platform/PlatformSubmitButton";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { database } from "@/lib/postgres/client";
import { COMPONENT_STATUSES, COMPONENT_STATUS_LABEL } from "@/lib/status";
import { attachChildPage, detachChildPage } from "../../actions";
import { createComponent, createGroup, deleteComponent, deleteGroup, updateComponentDetails, updateComponentStatus } from "../components-actions";

const inputClass = "w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)]";

export default async function PageContent({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const page = await database.selectFrom("pages").selectAll()
    .where("id", "=", pageId).where("orgId", "=", session.orgId).where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!page) notFound();
  return page.isHub ? <HubContent pageId={pageId} orgId={session.orgId} /> : <StatusPageContent pageId={pageId} />;
}

async function HubContent({ pageId, orgId }: { pageId: string; orgId: string }) {
  const [members, available] = await Promise.all([
    database.selectFrom("pages").selectAll().where("orgId", "=", orgId).where("hubParentId", "=", pageId).where("isHub", "=", false).where("deletedAt", "is", null).orderBy("createdAt").execute(),
    database.selectFrom("pages").selectAll().where("orgId", "=", orgId).where("isHub", "=", false).where("hubParentId", "is", null).where("deletedAt", "is", null).orderBy("createdAt").execute(),
  ]);

  return (
    <section className="border border-[var(--line)] bg-[var(--surface)] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-mono font-semibold text-[var(--fg)]">Status pages in this hub</h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--fg-dim)]">A hub summarizes normal status pages. Services always belong to those status pages, never directly to the hub.</p>
        </div>
        <Link href={`/organization/pages/new?hubParentId=${pageId}`} className="shrink-0 bg-[var(--cyan)] px-4 py-2 text-sm font-semibold text-[var(--on-cyan)]">Create status page in this hub</Link>
      </div>
      {available.length > 0 && (
        <PlatformActionForm action={attachChildPage.bind(null, pageId)} successMessage="Status page added to hub" className="mt-5 flex flex-col gap-2 border-t border-[var(--line)] pt-5 sm:flex-row">
          <FluentSelect aria-label="Status page to add" name="childPageId" required className={`${inputClass} flex-1`}><option value="">Choose a standalone status page</option>{available.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</FluentSelect>
          <button className="border border-[var(--line-bright)] px-4 py-2 text-sm font-semibold">Add to hub</button>
        </PlatformActionForm>
      )}
      <div className="mt-5 space-y-2">
        {members.map((member) => <article key={member.id} className="flex flex-col gap-3 border border-[var(--line)] bg-[var(--bg)] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-[var(--fg)]">{member.name}</p><p className="mt-0.5 text-xs text-[var(--fg-dim)]">/{member.slug} · {member.setupCompletedAt === null ? "Draft" : member.publicVisible === false ? "Hidden" : "Published"}</p></div><div className="flex gap-2"><Link href={`/organization/pages/${member.id}`} className="border border-[var(--cyan)]/30 px-3 py-1.5 text-xs font-semibold text-[var(--cyan)]">Manage</Link><form action={detachChildPage.bind(null, pageId, member.id)}><button className="border border-[var(--red)]/30 px-3 py-1.5 text-xs font-semibold text-[var(--red)]">Remove</button></form></div></article>)}
        {members.length === 0 && <p className="border border-dashed border-[var(--line-bright)] p-6 text-center text-sm text-[var(--fg-dim)]">No status pages are assigned yet.</p>}
      </div>
    </section>
  );
}

async function StatusPageContent({ pageId }: { pageId: string }) {
  const [groups, components] = await Promise.all([
    database.selectFrom("componentGroups").selectAll().where("pageId", "=", pageId).orderBy("order").execute(),
    database.selectFrom("components").selectAll().where("pageId", "=", pageId).orderBy("order").execute(),
  ]);

  return (
    <div className="space-y-5">
      <section className="border border-[var(--line)] bg-[var(--surface)] p-5">
        <h2 className="font-mono font-semibold">Service groups</h2>
        <PlatformActionForm action={createGroup.bind(null, pageId)} successMessage="Service group added" className="mt-4 flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
          <input name="name" required maxLength={120} placeholder="New group name" className={`${inputClass} min-w-0 flex-1`} />
          <button className="w-full whitespace-nowrap border border-[var(--line-bright)] px-4 py-2 text-sm font-semibold sm:w-auto">Add group</button>
        </PlatformActionForm>
        <div className="mt-4 space-y-2">{groups.map((group) => <div key={group.id} className="flex items-center justify-between border border-[var(--line)] px-3 py-2 text-sm"><span>{group.name}</span><form action={deleteGroup.bind(null, pageId, group.id)}><button className="text-xs font-semibold text-[var(--red)]">Delete</button></form></div>)}</div>
      </section>

      <section className="border border-[var(--line)] bg-[var(--surface)] p-5">
        <h2 className="font-mono font-semibold">Services</h2>
        <p className="mt-1 text-sm text-[var(--fg-dim)]">Services are the systems whose health appears on this status page.</p>
        <PlatformActionForm action={createComponent.bind(null, pageId)} successMessage="Service added" className="mt-4 grid gap-3 border-b border-[var(--line)] pb-5 sm:grid-cols-2">
          <input name="name" required maxLength={120} placeholder="Service name" className={inputClass} />
          <FluentSelect aria-label="Service group" name="groupId" className={inputClass}><option value="">No group</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</FluentSelect>
          <input name="description" maxLength={500} placeholder="Description (optional)" className={`${inputClass} sm:col-span-2`} />
          <button className="w-fit bg-[var(--cyan)] px-4 py-2 text-sm font-semibold text-[var(--on-cyan)] sm:col-span-2">Add service</button>
        </PlatformActionForm>
        <ComponentOrderList key={components.map((component) => component.id).join(":")} pageId={pageId} components={components.map((component) => ({ id: component.id, name: component.name }))}>
          <div className="mt-5 space-y-3">
            {components.map((component) => <article key={component.id} className="border border-[var(--line)] bg-[var(--surface-raised)] p-4">
              <div className="flex items-start justify-between gap-3"><div><h3 className="font-mono font-semibold">{component.name}</h3><p className="mt-1 text-xs text-[var(--fg-dim)]">{component.groupId ? groups.find((group) => group.id === component.groupId)?.name ?? "—" : "Ungrouped"}</p></div><div className="flex gap-2"><a href={`#service-details-${component.id}`} className="border border-[var(--cyan)]/40 px-3 py-1.5 text-xs font-semibold text-[var(--cyan)]">Edit</a><form action={deleteComponent.bind(null, pageId, component.id)}><PlatformSubmitButton pendingLabel="Deleting…" confirmMessage={`Delete ${component.name}? This action cannot be undone.`} className="text-xs font-semibold text-[var(--red)]">Delete</PlatformSubmitButton></form></div></div>
              <div className="mt-4 grid items-start gap-4 border-t border-[var(--line)] pt-4 lg:grid-cols-2">
                <PlatformActionForm action={updateComponentStatus.bind(null, pageId, component.id)} successMessage="Status updated" className="flex items-start gap-2">
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    <FluentSelect aria-label={`Public status for ${component.name}`} name="status" defaultValue={component.status} className={`${inputClass} min-w-0 flex-1`}>{COMPONENT_STATUSES.map((status) => <option key={status} value={status}>{COMPONENT_STATUS_LABEL[status]}</option>)}</FluentSelect>
                    <PlatformSubmitButton pendingLabel="Updating…" className="self-start whitespace-nowrap border border-[var(--line)] px-3 py-2 text-xs">Update</PlatformSubmitButton>
                  </div>
                </PlatformActionForm>
                <PlatformActionForm id={`service-details-${component.id}`} action={updateComponentDetails.bind(null, pageId, component.id)} successMessage="Service details saved" className="grid gap-2 sm:grid-cols-2">
                  <input name="name" defaultValue={component.name} required maxLength={120} className={inputClass} /><input name="description" defaultValue={component.description} maxLength={1000} className={inputClass} />
                  <FluentSelect aria-label={`Group for ${component.name}`} name="groupId" defaultValue={component.groupId ?? ""} className={inputClass}><option value="">No group</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</FluentSelect>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="visible" defaultChecked={component.visible} /> Visible publicly</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="showUptime" defaultChecked={component.showUptime} /> Show uptime</label>
                  <PlatformSubmitButton pendingLabel="Saving…" className="border border-[var(--cyan)]/40 px-3 py-2 text-xs font-semibold text-[var(--cyan)]">Save service</PlatformSubmitButton>
                </PlatformActionForm>
              </div>
            </article>)}
            {components.length === 0 && <p className="border border-dashed border-[var(--line-bright)] p-6 text-center text-sm text-[var(--fg-dim)]">No services yet. Add the first service to make this page publishable.</p>}
          </div>
        </ComponentOrderList>
      </section>
    </div>
  );
}
