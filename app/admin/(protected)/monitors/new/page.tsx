import { selectedPage } from "@/lib/selected-page";
import Link from "next/link";
import { ArrowLeft, MonitorDot } from "lucide-react";
import { requireSession } from "@/lib/require-session";
import { database } from "@/lib/postgres/client";
import { createMonitor, testMonitor } from "../actions";
import { MonitorForm } from "@/components/admin/MonitorForm";
import { NoPagesState, PostingTo } from "@/components/admin/operate-ui";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { effectiveMonitoringSettings } from "@/lib/monitoring-settings";
import { proxyItems } from "../proxy-items";
import { getScopedPages, requireCapability, sessionHasCapability } from "@/lib/admin-guard";

export default async function NewMonitorPage({ searchParams }: { searchParams: Promise<{ pageId?: string; returnToService?: string }> }) {
  const { session, org } = await requireSession();
  await requireCapability("monitor.manage");
  const { pageId: pageIdParam, returnToService: returnToServiceParam } = await searchParams;
  const pages = await getScopedPages(session, org.id, { isHub: false });
  const pageId = (await selectedPage(pages, session, pageIdParam))?.id;
  const returnToService = returnToServiceParam === "true" && sessionHasCapability(session, "page.configure");
  const backHref = pageId ? returnToService ? `/organization/pages/${pageId}/content?addService=automatic` : `/organization/monitors?pageId=${pageId}` : "/organization/monitors";

  const [components, monitors] = pageId
    ? await Promise.all([
        database.selectFrom("components").select(["id", "name"]).where("pageId", "=", pageId).orderBy("order", "asc").execute(),
        database.selectFrom("monitors").select("groupName").where("pageId", "=", pageId).execute(),
      ])
    : [[], []];
  const { proxies, createProxy } = await proxyItems(session);
  const settings = await effectiveMonitoringSettings(org.id);
  const defaultProxyId = proxies.find((proxy) => proxy.isDefault && proxy.enabled)?.id ?? "";
  const groups = [...new Set(monitors.flatMap((m) => (m.groupName ? [m.groupName] : [])))].sort();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Add a monitor"
        icon={MonitorDot}
        hue="sky"
        description={returnToService ? "Create a monitor, then return to add it as an automatic service. The service is only added when you save it." : "Check a service on a schedule and keep its status up to date."}
        actions={
          <Link href={backHref} className={buttonVariants({ variant: "secondary" })}>
            <ArrowLeft aria-hidden size={16} />
            {returnToService ? "Back to services" : "Back to monitors"}
          </Link>
        }
      />

      {pageId ? (
        <>
          <MonitorForm testAction={testMonitor.bind(null, pageId, null)} returnToService={returnToService} pageSwitcher={returnToService ? undefined : <PostingTo field pages={pages.map((p) => ({ id: p.id, name: p.name }))} basePath="/organization/monitors/new" selected={pageId} />} action={createMonitor.bind(null, pageId)} components={components} groups={groups} cancelHref={backHref} proxies={proxies} createProxy={createProxy} defaultProxyId={defaultProxyId} expiryDefaults={{ certDays: settings.certExpiryWarnDays, domainDays: settings.domainExpiryWarnDays }} />
        </>
      ) : (
        <NoPagesState description="Monitors belong to a status page. Create one before you add monitors." canCreate={sessionHasCapability(session, "page.configure")} />
      )}
    </div>
  );
}
