import Link from "next/link";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { requirePlatformCapability } from "@/lib/admin-guard";
import { hasPlatformCapability } from "@/lib/platform-policy";
import { subscriptionCapabilities } from "@/lib/notification-capabilities";
import { enabledDestinationChannels } from "@/lib/platform-configuration";
import { DESTINATION_CHANNELS } from "@/lib/notification-providers";
import { updatePlatformConfiguration } from "./actions";

const PROVIDER_LABELS: Record<(typeof DESTINATION_CHANNELS)[number], string> = {
  SLACK: "Slack",
  MICROSOFT_TEAMS: "Microsoft Teams",
  DISCORD: "Discord",
  TELEGRAM: "Telegram",
  WHATSAPP: "WhatsApp",
  GOOGLE_CHAT: "Google Chat",
  PAGERDUTY: "PagerDuty",
  OPSGENIE: "Opsgenie",
  NTFY: "Ntfy",
};

export default async function PlatformConfigurationPage() {
  const actor = await requirePlatformCapability("configuration.read");
  const canManage = hasPlatformCapability(actor.role, "configuration.manage");
  const [enabledChannels, capabilities] = await Promise.all([
    enabledDestinationChannels(),
    subscriptionCapabilities(),
  ]);
  const enabled = new Set(enabledChannels);
  const appUrlConfigured = Boolean(process.env.NEXT_PUBLIC_APP_URL);
  const storageDriver = (process.env.ASSET_STORAGE_DRIVER ?? "local").toLowerCase();
  const telemetryConfigured = Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT);

  return (
    <div className="max-w-6xl space-y-8">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-[var(--cyan)]">Control plane</p>
        <h1 className="mt-2 font-mono text-3xl font-semibold text-[var(--fg)]">Platform configuration</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--fg-soft)]">
          Set installation-wide product policy here. Credentials, encryption keys, storage access, and mail provider secrets remain deployment-managed so they cannot leak through the web console.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Runtime readiness">
        <ReadinessCard label="Public application URL" ready={appUrlConfigured} detail={appUrlConfigured ? "Configured" : "NEXT_PUBLIC_APP_URL missing"} />
        <ReadinessCard label="Delivery worker" ready={capabilities.workerReady} detail={capabilities.workerReady ? "Ready" : "Offline or stale"} />
        <ReadinessCard label="Email delivery" ready={capabilities.email.enabled} detail={capabilities.email.reason ?? "Available"} />
        <ReadinessCard label="SMS delivery" ready={capabilities.sms.enabled} detail={capabilities.sms.reason ?? "Available"} />
        <ReadinessCard label="Asset storage" ready detail={storageDriver === "s3" ? "S3" : "Local filesystem"} />
        <ReadinessCard label="Telemetry export" ready={telemetryConfigured} detail={telemetryConfigured ? "OTLP configured" : "Optional; not configured"} neutral={!telemetryConfigured} />
      </section>

      <section className="border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-mono text-lg font-semibold text-[var(--fg)]">Tenant notification providers</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--fg-dim)]">
              Enabled providers appear in every organization console. Tenant credentials are encrypted and verified when an organization connects a destination.
            </p>
          </div>
          <span className="font-mono text-xs text-[var(--fg-dim)]">{enabled.size} of {DESTINATION_CHANNELS.length} enabled</span>
        </div>

        {canManage ? (
          <PlatformActionForm action={updatePlatformConfiguration} successMessage="Platform configuration saved" className="mt-5">
            <fieldset className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <legend className="sr-only">Enabled notification providers</legend>
              {DESTINATION_CHANNELS.map((channel) => (
                <label key={channel} className="flex cursor-pointer items-center gap-3 border border-[var(--line)] bg-[var(--bg)] p-3 text-sm text-[var(--fg)]">
                  <input type="checkbox" name="enabledDestinationChannels" value={channel} defaultChecked={enabled.has(channel)} />
                  <span>{PROVIDER_LABELS[channel]}</span>
                </label>
              ))}
            </fieldset>
            <label className="mt-4 grid max-w-2xl gap-1.5 text-xs font-semibold text-[var(--fg-soft)]">
              Change reason
              <textarea name="reason" rows={3} minLength={10} maxLength={2000} required placeholder="Why is this installation-wide policy changing?" className="border border-[var(--line)] bg-[var(--bg)] p-3 text-sm font-normal text-[var(--fg)]" />
            </label>
            <button className="mt-4 bg-[var(--cyan)] px-5 py-2.5 text-sm font-semibold text-[var(--on-cyan)]">Save provider policy</button>
          </PlatformActionForm>
        ) : (
          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {DESTINATION_CHANNELS.map((channel) => (
              <div key={channel} className="flex items-center justify-between border border-[var(--line)] bg-[var(--bg)] p-3 text-sm">
                <span>{PROVIDER_LABELS[channel]}</span>
                <span className={enabled.has(channel) ? "text-[var(--green)]" : "text-[var(--fg-dim)]"}>{enabled.has(channel) ? "Enabled" : "Disabled"}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <ManagementLink href="/organization/platform/templates" title="Monitor templates" detail="Define installation-wide monitor blueprints for tenant teams." />
        <ManagementLink href="/organization/platform/identity" title="Identity and provisioning" detail="Manage OIDC, SAML, SCIM, and enterprise authentication policy." />
        <ManagementLink href="/organization/platform/operations" title="Operations" detail="Inspect workers, delivery queues, migrations, and retention defaults." />
      </section>
    </div>
  );
}

function ReadinessCard({ label, ready, detail, neutral = false }: { label: string; ready: boolean; detail: string; neutral?: boolean }) {
  const color = neutral ? "var(--fg-dim)" : ready ? "var(--green)" : "var(--amber)";
  return (
    <article className="border border-[var(--line)] bg-[var(--surface)] p-4">
      <p className="text-xs text-[var(--fg-dim)]">{label}</p>
      <p className="mt-2 text-sm font-semibold" style={{ color }}>{detail}</p>
    </article>
  );
}

function ManagementLink({ href, title, detail }: { href: string; title: string; detail: string }) {
  return (
    <Link href={href} className="border border-[var(--line)] bg-[var(--surface)] p-5 transition-colors hover:border-[var(--cyan)]">
      <h2 className="font-mono font-semibold text-[var(--fg)]">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--fg-dim)]">{detail}</p>
      <span className="mt-4 inline-block text-sm font-semibold text-[var(--cyan)]">Manage →</span>
    </Link>
  );
}
