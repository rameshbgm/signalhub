import { requireSession } from "@/lib/require-session";
import { database } from "@/lib/postgres/client";
import { PageSelect } from "@/components/admin/PageSelect";
import { NotificationDestinationManager } from "@/components/admin/NotificationDestinationManager";
import { WebhookEndpointManager } from "@/components/admin/WebhookEndpointManager";
import { getScopedPages, requireCapability } from "@/lib/admin-guard";
import { subscriptionCapabilities } from "@/lib/notification-capabilities";
import { enabledDestinationChannels } from "@/lib/platform-configuration";
import { secretLabel } from "@/lib/secrets";
import { BellRing, Mail, Radio, Rss } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { IconTile } from "@/components/ui/icon-tile";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ pageId?: string }>;
}) {
  const { session, org } = await requireSession();
  await requireCapability("integration.manage");
  const requested = (await searchParams).pageId;
  const pages = await getScopedPages(session, org.id, { orderBy: "name" });
  const page = pages.find((item) => item.id === requested) ?? pages[0];
  if (!page) return <div className="space-y-8"><PageHeader title="Notifications and destinations" icon={BellRing} hue="teal" description="Configure subscriber delivery and team integrations for your status pages." /><EmptyState icon={BellRing} hue="teal" title="Create a status page first" description="Notifications and destinations belong to a status page." /></div>;
  const [destinations, endpoints, capabilities, enabledChannels, components] = await Promise.all([
    database.selectFrom("notificationDestinations").selectAll().where("pageId", "=", page.id).orderBy("createdAt", "asc").execute(),
    database.selectFrom("webhookEndpoints").selectAll().where("pageId", "=", page.id).orderBy("createdAt", "asc").execute(),
    subscriptionCapabilities(),
    enabledDestinationChannels(),
    database.selectFrom("components").select(["id", "name"]).where("pageId", "=", page.id).orderBy("name", "asc").execute(),
  ]);
  return (
    <div className="space-y-8">
      <PageHeader title="Notifications and destinations" icon={BellRing} hue="teal" description="Configure visitor subscriptions, verified team integrations, and signed status-event webhooks for this page." actions={<div className="w-full sm:w-56"><PageSelect pages={pages.map((item) => ({ id: item.id, name: item.name }))} selected={page.id} basePath="/organization/notifications" /></div>} />
      <Card>
        <CardHeader><CardTitle>Subscriber delivery</CardTitle><CardDescription>Email and SMS require a configured provider and the delivery worker. RSS and Atom feeds remain available without the worker.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "Email", icon: Mail, ready: capabilities.email.enabled, state: capabilities.email.reason ?? "Available" },
            { label: "SMS", icon: Radio, ready: capabilities.sms.enabled, state: capabilities.sms.reason ?? "Available" },
            { label: "RSS / Atom", icon: Rss, ready: true, state: "Available" },
          ].map((channel) => (
            <div key={channel.label} className="flex min-w-0 items-start gap-3 rounded-control bg-sunken/60 p-3.5">
              <IconTile icon={channel.icon} hue="teal" size="sm" />
              <div className="min-w-0"><p className="text-sm font-semibold text-ink">{channel.label}</p><StatusBadge tone={channel.ready ? "ok" : "warn"} className="mt-1.5 max-w-full whitespace-normal">{channel.state}</StatusBadge></div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Team and on-call destinations</CardTitle><CardDescription>Only providers enabled by the platform administrator are offered. Every destination is tested before it is stored.</CardDescription></CardHeader>
        <CardContent><NotificationDestinationManager
          pageId={page.id}
          enabledChannels={enabledChannels}
          components={components}
          initial={destinations.map((destination) => ({
            id: destination.id,
            name: destination.name,
            channel: destination.channel,
            active: destination.active,
            verifiedAt: destination.verifiedAt?.toISOString() ?? null,
            lastTestOk: destination.lastTestOk,
            lastError: destination.lastError,
            eventTypes: destination.eventTypes,
            componentIds: destination.componentIds,
          }))}
        /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Signed status-event webhooks</CardTitle><CardDescription>Connect custom systems through verified HTTPS endpoints with HMAC signatures, retries, and secret rotation.</CardDescription></CardHeader>
        <CardContent><WebhookEndpointManager
          pageId={page.id}
          endpoints={endpoints.map((endpoint) => ({
            id: endpoint.id,
            url: endpoint.url,
            secretLabel: secretLabel(endpoint.secretPrefix, endpoint.secretLastFour),
            verifiedAt: endpoint.verifiedAt?.toISOString() ?? null,
          }))}
        /></CardContent>
      </Card>
    </div>
  );
}
