import { requireSession } from "@/lib/require-session";
import { database } from "@/lib/postgres/client";
import { PageSelect } from "@/components/admin/PageSelect";
import { NotificationDestinationManager } from "@/components/admin/NotificationDestinationManager";
import { WebhookEndpointManager } from "@/components/admin/WebhookEndpointManager";
import { getScopedPages, requireCapability } from "@/lib/admin-guard";
import { subscriptionCapabilities } from "@/lib/notification-capabilities";
import { enabledDestinationChannels } from "@/lib/platform-configuration";
import { secretLabel } from "@/lib/secrets";

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
  if (!page) return <p className="text-sm text-[var(--fg-dim)]">Create a page first.</p>;
  const [destinations, endpoints, capabilities, enabledChannels] = await Promise.all([
    database.selectFrom("notificationDestinations").selectAll().where("pageId", "=", page.id).orderBy("createdAt", "asc").execute(),
    database.selectFrom("webhookEndpoints").selectAll().where("pageId", "=", page.id).orderBy("createdAt", "asc").execute(),
    subscriptionCapabilities(),
    enabledDestinationChannels(),
  ]);
  return (
    <div className="max-w-6xl space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-mono text-2xl font-semibold">Notifications and destinations</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--fg-soft)]">Configure visitor subscriptions, verified team integrations, and signed status-event webhooks for this page.</p>
        </div>
        <div className="w-60"><PageSelect pages={pages.map((item) => ({ id: item.id, name: item.name }))} selected={page.id} basePath="/organization/notifications" /></div>
      </div>
      <section>
        <h2 className="font-mono text-lg font-semibold text-[var(--fg)]">Subscriber delivery</h2>
        <p className="mt-1 text-sm text-[var(--fg-dim)]">Email and SMS require both a configured provider and the durable delivery worker. RSS and Atom feeds remain available without the worker.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { label: "Email", ready: capabilities.email.enabled, state: capabilities.email.reason ?? "Available" },
            { label: "SMS", ready: capabilities.sms.enabled, state: capabilities.sms.reason ?? "Available" },
            { label: "RSS / Atom", ready: true, state: "Available" },
          ].map((channel) => (
            <article key={channel.label} className="border border-[var(--line)] bg-[var(--surface)] p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-[var(--fg)]">{channel.label}</h3>
                <span className={`font-mono text-[9px] font-semibold uppercase tracking-wider ${channel.ready ? "text-[var(--green)]" : "text-[var(--amber)]"}`}>{channel.state}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-mono text-lg font-semibold text-[var(--fg)]">Team and on-call destinations</h2>
        <p className="mb-4 mt-1 text-sm text-[var(--fg-dim)]">Only providers enabled by the platform administrator are offered. Every destination is tested before it is stored.</p>
        <NotificationDestinationManager
          pageId={page.id}
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
      </section>

      <section>
        <h2 className="font-mono text-lg font-semibold text-[var(--fg)]">Signed status-event webhooks</h2>
        <p className="mb-4 mt-1 text-sm text-[var(--fg-dim)]">Connect custom systems through verified HTTPS endpoints with HMAC signatures, retries, and secret rotation.</p>
        <WebhookEndpointManager
          pageId={page.id}
          endpoints={endpoints.map((endpoint) => ({
            id: endpoint.id,
            url: endpoint.url,
            secretLabel: secretLabel(endpoint.secretPrefix, endpoint.secretLastFour),
            verifiedAt: endpoint.verifiedAt?.toISOString() ?? null,
          }))}
        />
      </section>
    </div>
  );
}
