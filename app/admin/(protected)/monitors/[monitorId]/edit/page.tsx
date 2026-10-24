import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MonitorDot } from "lucide-react";
import { requireSession } from "@/lib/require-session";
import { database } from "@/lib/postgres/client";
import { updateMonitor } from "../../actions";
import { HeartbeatTokenManager } from "@/components/admin/HeartbeatTokenManager";
import { MonitorForm } from "@/components/admin/MonitorForm";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { assertPageInOrg, notFoundIfMissing, requireCapability } from "@/lib/admin-guard";
import { isDatabaseId } from "@/lib/database-id";
import { effectiveMonitoringSettings } from "@/lib/monitoring-settings";
import { proxyItems } from "../../proxy-items";
import { monitorFormValues } from "@/lib/monitor-form-values";

export default async function EditMonitorPage({ params }: { params: Promise<{ monitorId: string }> }) {
  const { monitorId } = await params;
  const { session } = await requireSession();
  if (!isDatabaseId(monitorId)) notFound();
  const monitor = await database.selectFrom("monitors").selectAll().where("id", "=", monitorId).executeTakeFirst();
  if (!monitor) notFound();
  await notFoundIfMissing(requireCapability("monitor.manage", monitor.pageId));
  await notFoundIfMissing(assertPageInOrg(monitor.pageId, session.orgId));

  const [components, siblings] = await Promise.all([
    database.selectFrom("components").select(["id", "name"]).where("pageId", "=", monitor.pageId).orderBy("order", "asc").execute(),
    database.selectFrom("monitors").select("groupName").where("pageId", "=", monitor.pageId).execute(),
  ]);
  const { proxies, createProxy } = await proxyItems(session);
  const settings = await effectiveMonitoringSettings(session.orgId);
  const groups = [...new Set(siblings.flatMap((m) => (m.groupName ? [m.groupName] : [])))].sort();
  const backHref = `/organization/monitors?pageId=${monitor.pageId}`;

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Edit ${monitor.name}`}
        icon={MonitorDot}
        hue="sky"
        description="Changes apply on the next poll."
        actions={
          <Link href={backHref} className={buttonVariants({ variant: "secondary" })}>
            <ArrowLeft aria-hidden size={16} />
            Back to monitors
          </Link>
        }
      />
      {monitor.type === "HEARTBEAT" && <HeartbeatTokenManager monitorId={monitor.id} auth={{ type: monitor.authType, username: monitor.authUsername }} />}
      <MonitorForm action={updateMonitor.bind(null, monitor.id)} components={components} groups={groups} monitor={monitorFormValues(monitor)} cancelHref={backHref} proxies={proxies} createProxy={createProxy} expiryDefaults={{ certDays: settings.certExpiryWarnDays, domainDays: settings.domainExpiryWarnDays }} />
    </div>
  );
}
