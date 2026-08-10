import Link from "next/link";
import { notFound } from "next/navigation";
import { AutomationTokenManager } from "@/components/admin/AutomationTokenManager";
import { ComponentOrderList } from "@/components/admin/ComponentOrderList";
import { ServiceGroupOrganizer } from "@/components/admin/ServiceGroupOrganizer";
import { PageAnnouncementManager } from "@/components/admin/DesignEditor";
import { FluentSelect } from "@/components/FluentSelect";
import { FluentTextarea } from "@/components/FluentTextarea";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { PlatformSubmitButton } from "@/components/platform/PlatformSubmitButton";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { database } from "@/lib/postgres/client";
import { secretLabel } from "@/lib/secrets";
import { COMPONENT_STATUSES, COMPONENT_STATUS_LABEL } from "@/lib/status";
import { attachChildPage, detachChildPage } from "../../actions";
import { createComponent, createGroup, deleteComponent, deleteGroup, updateComponentDetails, updateComponentStatus } from "../components-actions";

export default async function PageContent({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const page = await database.selectFrom("pages").selectAll()
    .where("id", "=", pageId).where("orgId", "=", session.orgId)
    .where("deletedAt", "is", null).executeTakeFirst();
  if (!page) notFound();
  const announcements = await database.selectFrom("pageAnnouncements").selectAll()
    .where("pageId", "=", page.id).orderBy("startsAt", "desc").execute();
  return (
    <div className="space-y-5">
      {page.isHub ? <HubContent pageId={pageId} orgId={session.orgId} /> : <StatusPageContent pageId={pageId} />}
      <section className="border border-[var(--line)] bg-[var(--surface)] p-5">
        <h2 className="font-mono font-semibold">Announcements</h2>
        <p className="mt-1 mb-4 text-sm text-[var(--fg-dim)]">Create scheduled public banners without entering the layout designer.</p>
        <PageAnnouncementManager pageId={pageId} announcements={announcements.map((announcement) => ({ id: announcement.id, title: announcement.title, body: announcement.body, severity: announcement.severity, ctaLabel: announcement.ctaLabel, ctaUrl: announcement.ctaUrl, startsAt: announcement.startsAt.toISOString(), endsAt: announcement.endsAt?.toISOString() ?? null, dismissible: announcement.dismissible, priority: announcement.priority }))} />
      </section>
    </div>
  );
}

async function HubContent({ pageId, orgId }: { pageId: string; orgId: string }) {
  const [members, available] = await Promise.all([
    database.selectFrom("pages").selectAll().where("orgId", "=", orgId)
      .where("hubParentId", "=", pageId).where("isHub", "=", false)
      .where("deletedAt", "is", null).orderBy("createdAt").execute(),
    database.selectFrom("pages").selectAll().where("orgId", "=", orgId)
      .where("isHub", "=", false).where("hubParentId", "is", null)
      .where("deletedAt", "is", null).orderBy("createdAt").execute(),
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
        <PlatformActionForm action={attachChildPage.bind(null, pageId)} successMessage="Status page added to hub" className="mt-5 flex w-full flex-col gap-2 border-t border-[var(--line)] pt-5 sm:flex-row sm:items-start">
          <FluentSelect aria-label="Status page to add" name="childPageId" required className="flex-1 border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)]">
            <option value="">Choose a standalone status page</option>
            {available.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
          </FluentSelect>
          <button className="shrink-0 whitespace-nowrap border border-[var(--line-bright)] bg-[var(--surface-raised)] px-4 py-2 text-sm font-semibold text-[var(--fg)]">Add to hub</button>
        </PlatformActionForm>
      )}
      <div className="mt-5 space-y-2">
        {members.map((member) => (
          <article key={member.id} className="flex flex-col gap-3 border border-[var(--line)] bg-[var(--bg)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-[var(--fg)]">{member.name}</p>
              <p className="mt-0.5 text-xs text-[var(--fg-dim)]">/{member.slug} · {member.setupCompletedAt === null ? "Draft" : member.publicVisible === false ? "Hidden" : "Published"}</p>
            </div>
            <div className="flex gap-2">
              <Link href={`/organization/pages/${member.id}`} className="border border-[var(--cyan)]/30 px-3 py-1.5 text-xs font-semibold text-[var(--cyan)]">Manage</Link>
              <form action={detachChildPage.bind(null, pageId, member.id)}><button className="border border-[var(--red)]/30 px-3 py-1.5 text-xs font-semibold text-[var(--red)]">Remove from hub</button></form>
            </div>
          </article>
        ))}
        {members.length === 0 && <p className="border border-dashed border-[var(--line-bright)] p-6 text-center text-sm text-[var(--fg-dim)]">No status pages are assigned yet. Create one here or add an existing standalone page.</p>}
      </div>
    </section>
  );
}

async function StatusPageContent({ pageId }: { pageId: string }) {
  const [groupDocs, componentDocs] = await Promise.all([
    database.selectFrom("componentGroups").selectAll().where("pageId", "=", pageId).orderBy("order").execute(),
    database.selectFrom("components").selectAll().where("pageId", "=", pageId).orderBy("order").execute(),
  ]);
  const groups = groupDocs;
  const components = componentDocs.map((component) => ({ ...component, groupName: component.groupId ? groupDocs.find((group) => group.id === component.groupId)?.name ?? "—" : "—" }));
  const structureGroups = groups.map((group) => ({
    id: group.id,
    name: group.name,
    collapsed: group.collapsed,
    components: components.filter((component) => component.groupId === group.id).map((component) => ({ id: component.id, name: component.name })),
  }));
  const structureUngrouped = components.filter((component) => !component.groupId).map((component) => ({ id: component.id, name: component.name }));
  return (
    <div className="space-y-5">
      <ServiceGroupOrganizer pageId={pageId} initialGroups={structureGroups} initialUngrouped={structureUngrouped} />
      <section className="border border-[var(--line)] bg-[var(--surface)] p-5">
        <h2 className="font-mono font-semibold text-[var(--fg)]">Service groups</h2>
        <p className="mt-1 text-sm text-[var(--fg-dim)]">Use groups to organize larger service catalogs.</p>
        <PlatformActionForm action={createGroup.bind(null, pageId)} successMessage="Service group added" className="mt-4 flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start">
          <input name="name" required maxLength={120} placeholder="New group name" className="w-full min-w-0 flex-1 border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)]" />
          <button className="shrink-0 whitespace-nowrap border border-[var(--line-bright)] bg-[var(--surface-raised)] px-4 py-2 text-sm font-semibold">Add group</button>
        </PlatformActionForm>
        <div className="mt-4 space-y-2">
          {groups.map((group) => <div key={group.id} className="flex items-center justify-between border border-[var(--line)] px-3 py-2 text-sm"><span>{group.name}</span><form action={deleteGroup.bind(null, pageId, group.id)}><button className="text-xs font-semibold text-[var(--red)]">Delete</button></form></div>)}
        </div>
      </section>

      <section className="border border-[var(--line)] bg-[var(--surface)] p-5">
        <h2 className="font-mono font-semibold text-[var(--fg)]">Services</h2>
        <p className="mt-1 text-sm text-[var(--fg-dim)]">Services are the systems whose health appears on this status page.</p>
        <PlatformActionForm action={createComponent.bind(null, pageId)} successMessage="Service added" className="mt-4 grid gap-3 border-b border-[var(--line)] pb-5 sm:grid-cols-2">
          <input name="name" required maxLength={120} placeholder="Service name" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm" />
          <FluentSelect aria-label="Service group" name="groupId" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm"><option value="">No group</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</FluentSelect>
          <input name="description" maxLength={500} placeholder="Description (optional)" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm sm:col-span-2" />
          <button className="w-fit bg-[var(--cyan)] px-4 py-2 text-sm font-semibold text-[var(--on-cyan)] sm:col-span-2">Add service</button>
        </PlatformActionForm>

        <ComponentOrderList
          key={components.map((component) => component.id).join(":")}
          pageId={pageId}
          components={components.map((component) => ({ id: component.id, name: component.name }))}
        >
          {components.map((component) => (
            <article key={component.id} className="overflow-hidden border border-[var(--line)] bg-[var(--surface-raised)] text-sm">
              <header className="flex items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--surface)] py-3 pl-12 pr-3">
                <div><h3 className="font-mono font-semibold">{component.name}</h3><p className="mt-0.5 text-xs text-[var(--fg-dim)]">{component.groupName}</p></div>
                <div className="flex items-center gap-2">
                  <a href={`#service-details-${component.id}`} className="border border-[var(--cyan)]/40 px-3 py-1.5 text-xs font-semibold text-[var(--cyan)]">Edit</a>
                  <form action={deleteComponent.bind(null, pageId, component.id)}>
                    <PlatformSubmitButton
                      pendingLabel="Deleting…"
                      confirmMessage={`Delete ${component.name}? This action cannot be undone.`}
                      className="border border-[var(--red)]/40 px-3 py-1.5 text-xs font-semibold text-[var(--red)]"
                    >
                      Delete
                    </PlatformSubmitButton>
                  </form>
                </div>
              </header>
              <div className="grid lg:grid-cols-2">
                <PlatformActionForm action={updateComponentStatus.bind(null, pageId, component.id)} successMessage="Status updated" className="space-y-3 border-b border-[var(--line)] p-4 lg:border-b-0 lg:border-r">
                  <h4 className="font-mono text-xs font-semibold uppercase tracking-wider text-[var(--fg-dim)]">Public status</h4>
                  <FluentSelect aria-label={`Public status for ${component.name}`} name="status" defaultValue={component.status} className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm">{COMPONENT_STATUSES.map((status) => <option key={status} value={status}>{COMPONENT_STATUS_LABEL[status]}</option>)}</FluentSelect>
                  <FluentTextarea name="note" rows={3} maxLength={1000} placeholder="Optional public note" aria-label={`Status note for ${component.name}`} className="!w-full !bg-[var(--bg)]" />
                  <PlatformSubmitButton pendingLabel="Updating…" className="border border-[var(--line-bright)] px-3 py-2 text-xs font-semibold">Update status</PlatformSubmitButton>
                </PlatformActionForm>
                <PlatformActionForm id={`service-details-${component.id}`} action={updateComponentDetails.bind(null, pageId, component.id)} successMessage="Service details saved" className="scroll-mt-6 space-y-3 p-4">
                  <h4 className="font-mono text-xs font-semibold uppercase tracking-wider text-[var(--fg-dim)]">Service details</h4>
                  <input name="name" defaultValue={component.name} required maxLength={120} aria-label={`Name for ${component.name}`} className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm" />
                  <input name="description" defaultValue={component.description} maxLength={1000} aria-label={`Description for ${component.name}`} className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm" />
                  <FluentSelect aria-label={`Group for ${component.name}`} name="groupId" defaultValue={component.groupId ?? ""} className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm"><option value="">No group</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</FluentSelect>
                  <div className="flex flex-wrap gap-4"><label className="flex items-center gap-2"><input type="checkbox" name="visible" defaultChecked={component.visible} /> Visible publicly</label><label className="flex items-center gap-2"><input type="checkbox" name="showUptime" defaultChecked={component.showUptime} /> Show uptime</label></div>
                  <PlatformSubmitButton pendingLabel="Saving…" className="border border-[var(--cyan)]/40 px-3 py-2 text-xs font-semibold text-[var(--cyan)]">Save service</PlatformSubmitButton>
                </PlatformActionForm>
              </div>
              <footer className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-xs text-[var(--fg-dim)]"><span className="font-semibold">Automation webhook</span><AutomationTokenManager componentId={component.id} label={secretLabel(component.automationTokenPrefix, component.automationTokenLastFour)} /></footer>
            </article>
          ))}
        </ComponentOrderList>
        {components.length === 0 && <p className="mt-5 border border-dashed border-[var(--line-bright)] p-6 text-center text-sm text-[var(--fg-dim)]">No services yet. Add the first service to make this page publishable.</p>}
      </section>
    </div>
  );
}
