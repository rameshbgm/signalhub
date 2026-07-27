import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { subscriptionCapabilities } from "@/lib/notification-capabilities";
import { enabledDestinationChannels } from "@/lib/platform-configuration";
import { secretLabel } from "@/lib/secrets";
import { NotificationDestinationManager } from "@/components/admin/NotificationDestinationManager";
import { WebhookEndpointManager } from "@/components/admin/WebhookEndpointManager";

export async function PageNotificationsSection({ pageId }: { pageId: string }) {
  const [endpointDocs, destinations, capabilities, enabledChannels] = await Promise.all([
    collections.webhookEndpoints().find({ pageId: oid(pageId) }).toArray(),
    collections.notificationDestinations().find({ pageId: oid(pageId) }).sort({ createdAt: 1 }).toArray(),
    subscriptionCapabilities(),
    enabledDestinationChannels(),
  ]);
  const endpoints = endpointDocs.map(toId);

  const subscriberChannels = [
    { label: "Email", ready: capabilities.email.enabled, state: capabilities.email.reason ?? "Available" },
    { label: "SMS", ready: capabilities.sms.enabled, state: capabilities.sms.reason ?? "Available" },
    { label: "RSS / Atom", ready: true, state: "Available" },
  ];

  return (
    <section id="notifications" className="space-y-8 border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5">
      <div>
        <h2 className="font-mono font-semibold text-[var(--fg)]">Notifications & webhooks</h2>
        <p className="mt-1 text-sm text-[var(--fg-dim)]">Configure subscriber readiness, operational destinations, and signed status-event delivery in one place.</p>
      </div>

      <div className={`flex flex-col gap-2 border p-4 text-sm sm:flex-row sm:items-center sm:justify-between ${capabilities.workerReady ? "border-[var(--green)]/30 bg-[var(--green-soft)]" : "border-[var(--amber)]/30 bg-[var(--amber-soft)]"}`}>
        <div>
          <p className="font-semibold text-[var(--fg)]">Delivery worker</p>
          <p className="mt-0.5 text-xs text-[var(--fg-soft)]">Processes queued notifications with retries.</p>
        </div>
        <span className={`font-mono text-xs font-semibold uppercase tracking-wider ${capabilities.workerReady ? "text-[var(--green)]" : "text-[var(--amber)]"}`}>
          {capabilities.workerReady ? "Ready" : "Offline"}
        </span>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-[var(--fg)]">Subscriber channels</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {subscriberChannels.map((channel) => (
            <article key={channel.label} className="border border-[var(--line)] bg-[var(--bg)] p-3">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold text-[var(--fg)]">{channel.label}</span>
                <span className={`font-mono text-[9px] uppercase tracking-wider ${channel.ready ? "text-[var(--green)]" : "text-[var(--amber)]"}`}>{channel.state}</span>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-[var(--fg)]">Team and on-call destinations</h3>
        <p className="mb-4 mt-1 text-xs text-[var(--fg-dim)]">Connections are tested before they are enabled.</p>
        <NotificationDestinationManager
          pageId={pageId}
          enabledChannels={enabledChannels}
          initial={destinations.map((destination) => ({
            id: destination._id.toHexString(),
            name: destination.name,
            channel: destination.channel,
            active: destination.active,
            verifiedAt: destination.verifiedAt?.toISOString() ?? null,
            lastTestOk: destination.lastTestOk,
            lastError: destination.lastError,
          }))}
        />
      </div>

      <div>
        <h3 className="text-sm font-semibold text-[var(--fg)]">Signed status-event webhooks</h3>
        <p className="mb-4 mt-1 text-xs text-[var(--fg-dim)]">Register HTTPS endpoints with verification, HMAC signatures, retries, and secret rotation.</p>
        <WebhookEndpointManager
          pageId={pageId}
          endpoints={endpoints.map((endpoint) => ({
            id: endpoint.id,
            url: endpoint.url,
            secretLabel: secretLabel(endpoint.secretPrefix, endpoint.secretLastFour),
            verifiedAt: endpoint.verifiedAt?.toISOString() ?? null,
          }))}
        />
      </div>
    </section>
  );
}
