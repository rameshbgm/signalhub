import Link from "next/link";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { SetupStepper } from "@/components/admin/SetupStepper";
import { HelpTip } from "@/components/HelpTip";
import { WebhookEndpointManager } from "@/components/admin/WebhookEndpointManager";
import { secretLabel } from "@/lib/secrets";
import { NotificationDestinationManager } from "@/components/admin/NotificationDestinationManager";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { subscriptionCapabilities } from "@/lib/notification-capabilities";
import { enabledDestinationChannels } from "@/lib/platform-configuration";

export default async function SetupNotificationsPage({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const [endpointDocs, destinations, capabilities, enabledChannels] = await Promise.all([
    collections.webhookEndpoints().find({ pageId: oid(pageId) }).toArray(),
    collections.notificationDestinations().find({ pageId: oid(pageId) }).sort({ createdAt: 1 }).toArray(),
    subscriptionCapabilities(),
    enabledDestinationChannels(),
  ]);
  const endpoints = endpointDocs.map(toId);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <SetupStepper pageId={pageId} current="notifications" />
      <h1 className="font-mono text-2xl font-semibold text-[var(--fg)]">How subscribers get notified</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--fg-soft)]">
        Subscriber channels and team destinations use the same durable delivery queue. Configure the channels your visitors use,
        then connect the operational tools that should receive every incident and maintenance update.
      </p>

      <div className={`mt-6 flex flex-col gap-2 border p-4 text-sm sm:flex-row sm:items-center sm:justify-between ${capabilities.workerReady ? "border-[var(--green)]/30 bg-[var(--green-soft)]" : "border-[var(--amber)]/30 bg-[var(--amber-soft)]"}`}>
        <div>
          <p className="font-semibold text-[var(--fg)]">Delivery worker</p>
          <p className="mt-0.5 text-xs text-[var(--fg-soft)]">Processes queued subscriber and destination notifications with retries.</p>
        </div>
        <span className={`font-mono text-xs font-semibold uppercase tracking-wider ${capabilities.workerReady ? "text-[var(--green)]" : "text-[var(--amber)]"}`}>
          {capabilities.workerReady ? "Ready" : "Offline"}
        </span>
      </div>

      <section className="mt-8" aria-labelledby="subscriber-channels-title">
        <div>
          <h2 id="subscriber-channels-title" className="font-mono text-base font-semibold text-[var(--fg)]">Subscriber channels</h2>
          <p className="mt-1 text-sm text-[var(--fg-dim)]">Visitors choose these channels from the public subscribe dialog. Manage people from the Subscribers page.</p>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {[
            {
              label: "Email",
              detail: "Verified with a one-time code sent to the subscriber inbox.",
              ready: capabilities.email.enabled,
              state: capabilities.email.reason ?? "Available",
            },
            {
              label: "SMS",
              detail: "Verified mobile subscriptions delivered through the configured Twilio sender.",
              ready: capabilities.sms.enabled,
              state: capabilities.sms.reason ?? "Available",
            },
            {
              label: "RSS / Atom",
              detail: "Public feeds and revocable signed feed URLs for protected pages.",
              ready: true,
              state: "Available",
            },
          ].map((channel) => (
            <article key={channel.label} className="flex min-h-36 flex-col border border-[var(--line)] bg-[var(--surface)] p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-semibold text-[var(--fg)]">{channel.label}</h3>
                <span className={`font-mono text-[9px] font-semibold uppercase tracking-wider ${channel.ready ? "text-[var(--green)]" : "text-[var(--amber)]"}`}>{channel.state}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-[var(--fg-dim)]">{channel.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10" aria-labelledby="team-destinations-title">
        <h2 id="team-destinations-title" className="font-mono text-base font-semibold text-[var(--fg)]">Team and on-call destinations</h2>
        <p className="mb-4 mt-1 text-sm text-[var(--fg-dim)]">Connect Slack, Teams, Discord, Google Chat, Telegram, WhatsApp, PagerDuty, Opsgenie, or ntfy. Each connection is tested before it is enabled.</p>
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

      </section>

      <section className="mt-10" aria-labelledby="status-webhooks-title">
        <div className="flex items-center gap-1.5">
          <h2 id="status-webhooks-title" className="font-mono text-base font-semibold text-[var(--fg)]">Signed status-event webhooks</h2>
          <HelpTip text="We'll POST a JSON payload to this URL every time an incident or maintenance event happens." />
        </div>
        <p className="mb-4 mt-1 text-sm text-[var(--fg-dim)]">For custom systems, register an HTTPS endpoint with HMAC signatures, verification, retries, and secret rotation.</p>
        <WebhookEndpointManager
          pageId={pageId}
          endpoints={endpoints.map((endpoint) => ({
            id: endpoint.id,
            url: endpoint.url,
            secretLabel: secretLabel(endpoint.secretPrefix, endpoint.secretLastFour),
            verifiedAt: endpoint.verifiedAt?.toISOString() ?? null,
          }))}
        />
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mt-12 pt-6 border-t border-[var(--line)]">
        <Link href={`/organization/pages/${pageId}/setup/logo`} className="text-sm text-[var(--fg-soft)] hover:text-[var(--fg)]">
          ← Back
        </Link>
        <div className="flex gap-3 items-center">
          <Link href={`/organization/pages/${pageId}/setup/incidents`} className="text-sm text-[var(--fg-soft)] hover:text-[var(--fg)] self-center">
            Skip
          </Link>
          <Link href={`/organization/pages/${pageId}/setup/incidents`} className="bg-[var(--cyan)] text-[var(--on-cyan)] px-5 py-2.5 text-sm font-semibold font-mono">
            Next: Incidents →
          </Link>
        </div>
      </div>
    </div>
  );
}
