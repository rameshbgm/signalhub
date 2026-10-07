import Link from "next/link";
import { notFound } from "next/navigation";
import { Boxes, Eye, EyeOff, Layers3, Plus, Trash2 } from "lucide-react";
import { ComponentOrderList } from "@/components/admin/ComponentOrderList";
import { PageSubmitButton } from "@/components/admin/PageSubmitButton";
import { ServiceEditorDialog } from "@/components/admin/ServiceEditorDialog";
import { ServiceStatusSelect } from "@/components/admin/ServiceStatusSelect";
import { formMessage, toneIcon } from "@/components/admin/page-management-styles";
import { Select } from "@/components/ui/select";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { database } from "@/lib/postgres/client";
import { COMPONENT_STATUS_LABEL, COMPONENT_STATUS_TONE, type ComponentStatus } from "@/lib/status";
import { attachChildPage, bulkPageAction } from "../../actions";
import { PageGroup } from "@/components/admin/page-group";
import { memberRow } from "@/lib/page-rows";
import { createComponent, deleteComponent, setComponentVisibility, updateComponentDetails, updateComponentStatus } from "../components-actions";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { InlineActionForm } from "@/components/InlineActionForm";

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
        <Link href={`/organization/pages/new?hubParentId=${pageId}`} className={buttonVariants()}><Plus aria-hidden size={16} />Create status page in this hub</Link>
      </CardHeader>
      <CardContent className="space-y-4">
        {available.length > 0 && (
          <PlatformActionForm action={attachChildPage.bind(null, pageId)} successMessage="Status page added to hub" className="flex max-w-xl flex-col gap-2 sm:flex-row sm:items-center" messageClassName={formMessage}>
            <div className="min-w-0 flex-1">
              <Select aria-label="Status page to add" name="childPageId" required className="w-full"><option value="">Choose a standalone status page</option>{available.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</Select>
            </div>
            <PageSubmitButton variant="secondary" pendingLabel="Adding…">Add to hub</PageSubmitButton>
          </PlatformActionForm>
        )}
        {members.length > 0 ? (
          <PageGroup bare label="Status pages in this hub" rows={members.map(memberRow)} hubId={pageId} action={bulkPageAction.bind(null, pageId)} defaultOpen canConfigure />
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
  const groupOptions = groups.map((group) => ({
    id: group.id,
    name: group.name,
    serviceCount: components.filter((component) => component.groupId === group.id).length,
  }));
  const groupName = new Map(groups.map((group) => [group.id, group.name]));
  const addService = <ServiceEditorDialog pageId={pageId} groups={groupOptions} action={createComponent.bind(null, pageId)} />;

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <CardTitle>Services{components.length ? <span className="ml-2 font-normal text-ink-dim">{components.length}</span> : null}</CardTitle>
          <CardDescription className="mt-1 max-w-2xl">The systems whose health appears on this page. Drag to reorder; a status change is published immediately.</CardDescription>
        </div>
        {addService}
      </CardHeader>
      <CardContent className="py-1">
        {components.length > 0 ? (
          <ComponentOrderList key={components.map((component) => component.id).join(":")} pageId={pageId} components={components.map((component) => ({ id: component.id, name: component.name }))}>
            {components.map((component) => {
              const status = component.status as ComponentStatus;
              const details = [
                component.groupId ? groupName.get(component.groupId) ?? "Ungrouped" : "Ungrouped",
                component.description,
              ].filter(Boolean).join(" · ");
              return (
                <article key={component.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 pt-1.5 sm:pt-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-semibold text-ink">{component.name}</h3>
                      <StatusBadge tone={COMPONENT_STATUS_TONE[status]}>{COMPONENT_STATUS_LABEL[status]}</StatusBadge>
                      {!component.visible && <Badge>Unpublished</Badge>}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-ink-dim" title={details}>{details}</p>
                  </div>
                  <div className="flex items-start gap-1 sm:shrink-0">
                    <ServiceStatusSelect action={updateComponentStatus.bind(null, pageId, component.id)} serviceId={component.id} serviceName={component.name} status={status} />
                    <PlatformActionForm action={setComponentVisibility.bind(null, pageId, component.id, !component.visible)} successMessage={component.visible ? `${component.name} unpublished` : `${component.name} published`} className="flex">
                      <PageSubmitButton
                        variant="ghost"
                        size="icon"
                        className={`size-8 ${component.visible ? toneIcon.hide : toneIcon.publish}`}
                        pendingLabel=""
                        aria-label={`${component.visible ? "Unpublish" : "Publish"} ${component.name}`}
                        title={component.visible ? "Unpublish service" : "Publish service"}
                        confirmMessage={component.visible ? `Unpublish ${component.name}? It disappears from the public page until you publish it again.` : `Publish ${component.name}? It becomes visible on the public page.`}
                      >
                        {component.visible ? <EyeOff aria-hidden size={16} /> : <Eye aria-hidden size={16} />}
                      </PageSubmitButton>
                    </PlatformActionForm>
                    <ServiceEditorDialog
                      trigger="icon"
                      pageId={pageId}
                      groups={groupOptions}
                      action={updateComponentDetails.bind(null, pageId, component.id)}
                      service={{ id: component.id, name: component.name, description: component.description, groupId: component.groupId, visible: component.visible, showUptime: component.showUptime }}
                    />
                    <InlineActionForm action={deleteComponent.bind(null, pageId, component.id)}>
                      <PageSubmitButton variant="ghost" size="icon" className={`size-8 ${toneIcon.delete}`} pendingLabel="" aria-label={`Delete ${component.name}`} title="Delete service" confirmMessage={`Delete ${component.name}? This action cannot be undone.`}>
                        <Trash2 aria-hidden size={16} />
                      </PageSubmitButton>
                    </InlineActionForm>
                  </div>
                </article>
              );
            })}
          </ComponentOrderList>
        ) : (
          <EmptyState
            icon={Boxes}
            hue="sky"
            title="No services yet"
            description="Add the first service to make this page publishable."
            action={addService}
            className="py-12"
          />
        )}
      </CardContent>
    </Card>
  );
}
