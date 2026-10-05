import Link from "next/link";
import { notFound } from "next/navigation";
import { Boxes, FolderTree, Layers3, Pencil, Plus, Trash2 } from "lucide-react";
import { ComponentOrderList } from "@/components/admin/ComponentOrderList";
import { PageSubmitButton } from "@/components/admin/PageSubmitButton";
import { dangerGhost, formMessage } from "@/components/admin/page-management-styles";
import { Select } from "@/components/ui/select";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { database } from "@/lib/postgres/client";
import { COMPONENT_STATUSES, COMPONENT_STATUS_LABEL, type ComponentStatus } from "@/lib/status";
import { attachChildPage, detachChildPage } from "../../actions";
import { createComponent, createGroup, deleteComponent, deleteGroup, updateComponentDetails, updateComponentStatus } from "../components-actions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";

function statusTone(status: ComponentStatus): StatusTone {
  if (status === "OPERATIONAL") return "ok";
  if (status === "MAJOR_OUTAGE") return "danger";
  if (status === "UNDER_MAINTENANCE") return "info";
  return "warn";
}

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
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <CardTitle>Status pages in this hub</CardTitle>
          <CardDescription className="mt-1 max-w-2xl">A hub summarizes normal status pages. Services always belong to those status pages, never directly to the hub.</CardDescription>
        </div>
        <Link href={`/organization/pages/new?hubParentId=${pageId}`} className={buttonVariants({ variant: "soft" })}><Plus aria-hidden size={16} />Create status page in this hub</Link>
      </CardHeader>
      <CardContent className="space-y-5">
        {available.length > 0 && (
          <PlatformActionForm action={attachChildPage.bind(null, pageId)} successMessage="Status page added to hub" className="flex flex-col gap-3 rounded-control bg-sunken/60 p-4 sm:flex-row sm:items-center" messageClassName={formMessage}>
            <Select aria-label="Status page to add" name="childPageId" required className="w-full flex-1"><option value="">Choose a standalone status page</option>{available.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</Select>
            <Button type="submit" variant="secondary">Add to hub</Button>
          </PlatformActionForm>
        )}
        {members.length > 0 ? (
          <ul className="space-y-2">
            {members.map((member) => {
              const state = member.setupCompletedAt === null ? "Draft" : member.publicVisible === false ? "Hidden" : "Published";
              return (
                <li key={member.id} className="flex flex-col gap-3 rounded-control border border-line px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                    <p className="truncate font-semibold text-ink">{member.name}</p>
                    <span className="font-mono text-xs text-ink-dim">/{member.slug}</span>
                    <StatusBadge tone={state === "Published" ? "ok" : state === "Hidden" ? "neutral" : "warn"}>{state}</StatusBadge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/organization/pages/${member.id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>Manage</Link>
                    <form action={detachChildPage.bind(null, pageId, member.id)}><Button type="submit" variant="ghost" size="sm" className={dangerGhost}>Remove</Button></form>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon={Layers3}
            hue="violet"
            title="No status pages assigned yet"
            description="Add an existing standalone status page, or create a new one inside this hub."
            action={<Link href={`/organization/pages/new?hubParentId=${pageId}`} className={buttonVariants()}><Plus aria-hidden size={16} />Create status page in this hub</Link>}
          />
        )}
      </CardContent>
    </Card>
  );
}

async function StatusPageContent({ pageId }: { pageId: string }) {
  const [groups, components] = await Promise.all([
    database.selectFrom("componentGroups").selectAll().where("pageId", "=", pageId).orderBy("order").execute(),
    database.selectFrom("components").selectAll().where("pageId", "=", pageId).orderBy("order").execute(),
  ]);

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <Card>
        <CardHeader>
          <CardTitle>Services</CardTitle>
          <CardDescription>Services are the systems whose health appears on this status page.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <PlatformActionForm action={createComponent.bind(null, pageId)} successMessage="Service added" className="grid gap-4 rounded-control bg-sunken/60 p-4 sm:grid-cols-2" messageClassName={formMessage}>
            <Field label="Service name" htmlFor="new-service-name" required>
              <Input id="new-service-name" name="name" required maxLength={120} placeholder="e.g. Public API" />
            </Field>
            <Field label="Group" htmlFor="new-service-group">
              <Select id="new-service-group" aria-label="Service group" name="groupId" className="w-full"><option value="">No group</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</Select>
            </Field>
            <Field label="Description" htmlFor="new-service-description" hint="Optional." className="sm:col-span-2">
              <Input id="new-service-description" name="description" maxLength={500} />
            </Field>
            <div className="flex justify-end sm:col-span-2">
              <PageSubmitButton pendingLabel="Adding…"><Plus aria-hidden size={16} />Add service</PageSubmitButton>
            </div>
          </PlatformActionForm>

          {components.length > 0 ? (
            <ComponentOrderList key={components.map((component) => component.id).join(":")} pageId={pageId} components={components.map((component) => ({ id: component.id, name: component.name }))}>
              {components.map((component) => (
                <article key={component.id} className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-base font-semibold tracking-tight text-ink">{component.name}</h3>
                        <StatusBadge tone={statusTone(component.status as ComponentStatus)}>{COMPONENT_STATUS_LABEL[component.status as ComponentStatus]}</StatusBadge>
                        {!component.visible && <Badge>Hidden</Badge>}
                      </div>
                      <p className="mt-1 text-xs text-ink-dim">{component.groupId ? groups.find((group) => group.id === component.groupId)?.name ?? "—" : "Ungrouped"}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <a href={`#service-details-${component.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}><Pencil aria-hidden size={14} />Edit</a>
                      <form action={deleteComponent.bind(null, pageId, component.id)}>
                        <PageSubmitButton variant="ghost" size="sm" className={dangerGhost} pendingLabel="Deleting…" confirmMessage={`Delete ${component.name}? This action cannot be undone.`}><Trash2 aria-hidden size={14} />Delete</PageSubmitButton>
                      </form>
                    </div>
                  </div>
                  <div className="mt-4 grid items-start gap-5 border-t border-line pt-4 lg:grid-cols-2">
                    <PlatformActionForm action={updateComponentStatus.bind(null, pageId, component.id)} successMessage="Status updated" className="flex items-end gap-2" messageClassName={formMessage}>
                      <Field label="Public status" htmlFor={`status-${component.id}`} className="min-w-0 flex-1">
                        <Select id={`status-${component.id}`} aria-label={`Public status for ${component.name}`} name="status" defaultValue={component.status} className="w-full">{COMPONENT_STATUSES.map((status) => <option key={status} value={status}>{COMPONENT_STATUS_LABEL[status]}</option>)}</Select>
                      </Field>
                      <PageSubmitButton variant="secondary" pendingLabel="Updating…">Update</PageSubmitButton>
                    </PlatformActionForm>
                    <PlatformActionForm id={`service-details-${component.id}`} action={updateComponentDetails.bind(null, pageId, component.id)} successMessage="Service details saved" className="grid scroll-mt-24 gap-4 sm:grid-cols-2" messageClassName={formMessage}>
                      <Field label="Name" htmlFor={`name-${component.id}`}>
                        <Input id={`name-${component.id}`} name="name" defaultValue={component.name} required maxLength={120} />
                      </Field>
                      <Field label="Description" htmlFor={`description-${component.id}`}>
                        <Input id={`description-${component.id}`} name="description" defaultValue={component.description} maxLength={1000} />
                      </Field>
                      <Field label="Group" htmlFor={`group-${component.id}`} className="sm:col-span-2">
                        <Select id={`group-${component.id}`} aria-label={`Group for ${component.name}`} name="groupId" defaultValue={component.groupId ?? ""} className="w-full"><option value="">No group</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</Select>
                      </Field>
                      <div className="flex flex-wrap gap-x-6 gap-y-2 sm:col-span-2">
                        <label className="flex items-center gap-2 text-sm text-ink-soft"><Checkbox name="visible" defaultChecked={component.visible} /> Visible publicly</label>
                        <label className="flex items-center gap-2 text-sm text-ink-soft"><Checkbox name="showUptime" defaultChecked={component.showUptime} /> Show uptime</label>
                      </div>
                      <div className="flex justify-end sm:col-span-2">
                        <PageSubmitButton variant="secondary" pendingLabel="Saving…">Save service</PageSubmitButton>
                      </div>
                    </PlatformActionForm>
                  </div>
                </article>
              ))}
            </ComponentOrderList>
          ) : (
            <EmptyState
              icon={Boxes}
              hue="sky"
              title="No services yet"
              description="Add the first service to make this page publishable."
              action={<a href="#new-service-name" className={buttonVariants()}><Plus aria-hidden size={16} />Add a service</a>}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Service groups</CardTitle>
          <CardDescription>Groups are optional. Use them to organize related services on the public page.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <PlatformActionForm action={createGroup.bind(null, pageId)} successMessage="Service group added" className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end" messageClassName={formMessage}>
            <Field label="Group name" htmlFor="new-group-name">
              <Input id="new-group-name" name="name" required maxLength={120} placeholder="e.g. Core platform" />
            </Field>
            <PageSubmitButton variant="secondary" pendingLabel="Adding…" className="w-full sm:w-auto"><Plus aria-hidden size={16} />Add group</PageSubmitButton>
          </PlatformActionForm>
          {groups.length > 0 ? (
            <ul className="space-y-2">
              {groups.map((group) => {
                const count = components.filter((component) => component.groupId === group.id).length;
                return (
                  <li key={group.id} className="flex items-center justify-between gap-3 rounded-control border border-line px-3.5 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{group.name}</p>
                      <p className="text-xs text-ink-dim">{count} {count === 1 ? "service" : "services"}</p>
                    </div>
                    <form action={deleteGroup.bind(null, pageId, group.id)}><Button type="submit" variant="ghost" size="sm" className={dangerGhost}><Trash2 aria-hidden size={14} />Delete</Button></form>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon={FolderTree} hue="slate" title="No groups yet" description="Add a group to organize related services." className="border-0 bg-transparent px-0! py-6!" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
