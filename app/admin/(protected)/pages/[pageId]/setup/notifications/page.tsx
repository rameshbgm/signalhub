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

const CHANNELS = [
  { icon: "✉️", label: "Email", desc: "Verified via a one-time code sent to the inbox." },
  { icon: "▣", label: "Chat destinations", desc: "Post through a verified incoming webhook or bot connection." },
  { icon: "⌁", label: "On-call destinations", desc: "Trigger an external escalation or alerting workflow." },
  { icon: "🪝", label: "Signed webhook", desc: "Verified HTTPS delivery with HMAC signatures and retries." },
  { icon: "◉", label: "RSS / Atom", desc: "Public feeds or revocable signed URLs for protected pages." },
];

export default async function SetupNotificationsPage({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const [endpointDocs, destinations, capabilities] = await Promise.all([
    collections.webhookEndpoints().find({ pageId: oid(pageId) }).toArray(),
    collections.notificationDestinations().find({ pageId: oid(pageId) }).sort({ createdAt: 1 }).toArray(),
    subscriptionCapabilities(),
  ]);
  const endpoints = endpointDocs.map(toId);

  return (
    <div>
      <SetupStepper pageId={pageId} current="notifications" />
      <h1 className="font-mono text-2xl font-semibold text-[var(--fg)]">How subscribers get notified</h1>
      <p className="mt-3 text-sm text-[var(--fg-soft)] leading-relaxed max-w-lg">
        Every incident and maintenance update uses the same durable delivery queue. Set up an outbound webhook now, or skip and
        invite subscribers later from the Subscribers page.
      </p>

      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        {[
          ["Delivery worker", capabilities.workerReady, capabilities.workerReady ? "Ready" : "Offline"],
          ["Email subscriptions", capabilities.email.enabled, capabilities.email.reason ?? "Ready"],
          ["SMS subscriptions", capabilities.sms.enabled, capabilities.sms.reason ?? "Ready"],
        ].map(([label, ready, detail]) => (
          <div key={String(label)} className="border border-[var(--line)] bg-[var(--surface)] p-3 text-xs">
            <p className="font-semibold text-[var(--fg)]">{label}</p>
            <p className={ready ? "mt-1 text-[var(--green)]" : "mt-1 text-[var(--amber)]"}>{detail}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid sm:grid-cols-2 gap-3">
        {CHANNELS.map((c) => (
          <div key={c.label} className="flex items-start gap-3 border border-[var(--line)] bg-[var(--surface)] p-4">
            <span className="text-xl leading-none">{c.icon}</span>
            <div>
              <p className="text-sm font-semibold text-[var(--fg)]">{c.label}</p>
              <p className="text-xs text-[var(--fg-dim)] mt-0.5">{c.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5">
        <h2 className="mb-3 font-semibold text-sm text-[var(--fg)]">Add and verify a notification destination</h2>
        <NotificationDestinationManager
          pageId={pageId}
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

        <h2 className="font-semibold text-sm mb-3 mt-6 text-[var(--fg)] flex items-center gap-1.5">
          Or register an outbound status-event webhook
          <HelpTip text="We'll POST a JSON payload to this URL every time an incident or maintenance event happens." />
        </h2>
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

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mt-12 pt-6 border-t border-[var(--line)]">
        <Link href={`/admin/pages/${pageId}/setup/logo`} className="text-sm text-[var(--fg-soft)] hover:text-[var(--fg)]">
          ← Back
        </Link>
        <div className="flex gap-3 items-center">
          <Link href={`/admin/pages/${pageId}/setup/team`} className="text-sm text-[var(--fg-soft)] hover:text-[var(--fg)] self-center">
            Skip
          </Link>
          <Link href={`/admin/pages/${pageId}/setup/team`} className="bg-[var(--cyan)] text-[var(--on-cyan)] px-5 py-2.5 text-sm font-semibold font-mono">
            Next: Invite team →
          </Link>
        </div>
      </div>
    </div>
  );
}
