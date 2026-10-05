import { Mail, MessageSquare, Rss } from "lucide-react";
import { database } from "@/lib/postgres/client";
import { subscriptionCapabilities } from "@/lib/notification-capabilities";
import { enabledDestinationChannels } from "@/lib/platform-configuration";
import { secretLabel } from "@/lib/secrets";
import { NotificationDestinationManager } from "@/components/admin/NotificationDestinationManager";
import { WebhookEndpointManager } from "@/components/admin/WebhookEndpointManager";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import { StatusBadge } from "@/components/ui/status-badge";

export async function PageNotificationsSection({ pageId }: { pageId: string }) {
  const [endpointDocs, destinations, capabilities, enabledChannels] = await Promise.all([
    database.selectFrom("webhookEndpoints").selectAll().where("pageId", "=", pageId).execute(),
    database.selectFrom("notificationDestinations").selectAll().where("pageId", "=", pageId).orderBy("createdAt").execute(),
    subscriptionCapabilities(),
    enabledDestinationChannels(),
  ]);
  const endpoints = endpointDocs;

  const subscriberChannels = [
    { label: "Email", icon: Mail, ready: capabilities.email.enabled, state: capabilities.email.reason ?? "Available" },
    { label: "SMS", icon: MessageSquare, ready: capabilities.sms.enabled, state: capabilities.sms.reason ?? "Available" },
    { label: "RSS / Atom", icon: Rss, ready: true, state: "Available" },
  ];

  return (
    <section id="notifications" className="space-y-6">
      <p className="max-w-3xl text-sm leading-6 text-ink-soft">Configure subscriber readiness, operational destinations, and signed status-event delivery in one place.</p>

      <Alert tone={capabilities.workerReady ? "ok" : "warn"} title={capabilities.workerReady ? "Delivery worker is ready" : "Delivery worker is offline"}>
        Processes queued notifications with retries.
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Subscriber channels</CardTitle>
          <CardDescription>How visitors can subscribe to updates from this page.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-3 sm:grid-cols-3">
            {subscriberChannels.map((channel) => (
              <li key={channel.label} className="flex items-start gap-3 rounded-control border border-line px-3.5 py-3">
                <IconTile icon={channel.icon} hue={channel.ready ? "emerald" : "amber"} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{channel.label}</p>
                  <StatusBadge tone={channel.ready ? "ok" : "warn"} className="mt-1">{channel.ready ? "Available" : "Needs setup"}</StatusBadge>
                  {channel.state !== "Available" && <p className="mt-1.5 text-xs leading-5 text-ink-dim">{channel.state}</p>}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Team and on-call destinations</CardTitle>
          <CardDescription>Connections are tested before they are enabled.</CardDescription>
        </CardHeader>
        <CardContent>
          <NotificationDestinationManager
            pageId={pageId}
            enabledChannels={enabledChannels}
            initial={destinations.map((destination) => ({
              id: destination.id,
              name: destination.name,
              channel: destination.channel,
              active: destination.active,
              verifiedAt: destination.verifiedAt?.toISOString() ?? null,
              lastTestOk: destination.lastTestOk,
              lastError: destination.lastError,
            }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Signed status-event webhooks</CardTitle>
          <CardDescription>Register HTTPS endpoints with verification, HMAC signatures, retries, and secret rotation.</CardDescription>
        </CardHeader>
        <CardContent>
          <WebhookEndpointManager
            pageId={pageId}
            endpoints={endpoints.map((endpoint) => ({
              id: endpoint.id,
              url: endpoint.url,
              secretLabel: secretLabel(endpoint.secretPrefix, endpoint.secretLastFour),
              verifiedAt: endpoint.verifiedAt?.toISOString() ?? null,
            }))}
          />
        </CardContent>
      </Card>
    </section>
  );
}
