import Link from "next/link";
import { ArrowLeft, MonitorDot } from "lucide-react";
import { requireSession } from "@/lib/require-session";
import { database } from "@/lib/postgres/client";
import { createMonitor } from "../actions";
import { MonitorForm } from "@/components/admin/MonitorForm";
import { NoPagesState, PostingTo } from "@/components/admin/operate-ui";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { effectiveMonitoringSettings } from "@/lib/monitoring-settings";
import { proxyItems } from "../proxy-items";
import { getScopedPages, requireCapability, sessionHasCapability } from "@/lib/admin-guard";

export default async function NewMonitorPage({ searchParams }: { searchParams: Promise<{ pageId?: string }> }) {
  const { session, org } = await requireSession();
  await requireCapability("monitor.manage");
  const { pageId: pageIdParam } = await searchParams;
  const pages = await getScopedPages(session, org.id, { isHub: false });
  const pageId = pageIdParam && pages.some((p) => p.id === pageIdParam) ? pageIdParam : pages[0]?.id;
  const backHref = pageId ? `/organization/monitors?pageId=${pageId}` : "/organization/monitors";

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
        description="Check a service on a schedule and keep its component status up to date."
        actions={
          <Link href={backHref} className={buttonVariants({ variant: "secondary" })}>
            <ArrowLeft aria-hidden size={16} />
            Back to monitors
          </Link>
        }
      />

      {pageId ? (
        <>
          <MonitorForm pageSwitcher={<PostingTo field pages={pages.map((p) => ({ id: p.id, name: p.name }))} basePath="/organization/monitors/new" selected={pageId} />} action={createMonitor.bind(null, pageId)} components={components} groups={groups} cancelHref={backHref} proxies={proxies} createProxy={createProxy} defaultProxyId={defaultProxyId} expiryDefaults={{ certDays: settings.certExpiryWarnDays, domainDays: settings.domainExpiryWarnDays }} />
        </>
      ) : (
        <NoPagesState description="Monitors belong to a status page. Create one before you add monitors." canCreate={sessionHasCapability(session, "page.configure")} />
      )}
    </div>
  );
}
