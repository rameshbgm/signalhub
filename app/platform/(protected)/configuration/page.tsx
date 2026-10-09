import { Activity, Cpu, Globe, HardDrive, Mail, Smartphone, SlidersHorizontal } from "lucide-react";
import { DeliveryProvidersCard } from "@/components/platform/DeliveryProvidersCard";
import { DestinationProvidersCard } from "@/components/platform/DestinationProvidersCard";
import { sanitizeDestinationDefaults } from "@/lib/destination-catalog";
import { database } from "@/lib/postgres/client";
import { requirePlatformPageCapability } from "@/lib/platform-page-guard";
import { hasPlatformCapability } from "@/lib/platform-policy";
import { subscriptionCapabilities } from "@/lib/notification-capabilities";
import { enabledDestinationChannels, parseDestinationConnections } from "@/lib/platform-configuration";
import { PageHeader } from "@/components/ui/page-header";
import { PlatformHealth } from "@/components/platform/PlatformStat";


export default async function PlatformConfigurationPage() {
  const actor = await requirePlatformPageCapability("configuration.read");
  const canManage = hasPlatformCapability(actor.role, "configuration.manage");
  const [enabledChannels, capabilities, stored] = await Promise.all([
    enabledDestinationChannels(),
    subscriptionCapabilities(),
    database.selectFrom("platformConfiguration").selectAll().where("id", "=", "global").executeTakeFirst(),
  ]);
  const defaults = sanitizeDestinationDefaults(stored?.destinationDefaults);
  const connections = parseDestinationConnections(stored?.destinationConnectionsCiphertext);
  const appUrlConfigured = Boolean(process.env.NEXT_PUBLIC_APP_URL);
  const telemetryConfigured = Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Platform configuration"
        description="Set installation-wide product policy and subscriber delivery providers here. Encryption keys and storage access remain deployment-managed; provider secrets are encrypted and write-only."
        icon={SlidersHorizontal}
        hue="violet"
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Runtime readiness">
        <PlatformHealth
          label="Public application URL"
          icon={Globe}
          tone={appUrlConfigured ? "ok" : "warn"}
          status={appUrlConfigured ? "Configured" : "Missing"}
          detail={appUrlConfigured ? undefined : "NEXT_PUBLIC_APP_URL missing"}
        />
        <PlatformHealth
          label="Delivery worker"
          icon={Cpu}
          tone={capabilities.workerReady ? "ok" : "warn"}
          status={capabilities.workerReady ? "Ready" : "Offline or stale"}
        />
        <PlatformHealth
          label="Email delivery"
          icon={Mail}
          tone={capabilities.email.enabled ? "ok" : "warn"}
          status={capabilities.email.enabled ? "Available" : "Unavailable"}
          detail={capabilities.email.reason ?? undefined}
        />
        <PlatformHealth
          label="SMS delivery"
          icon={Smartphone}
          tone={capabilities.sms.enabled ? "ok" : "warn"}
          status={capabilities.sms.enabled ? "Available" : "Unavailable"}
          detail={capabilities.sms.reason ?? undefined}
        />
        <PlatformHealth label="Asset storage" icon={HardDrive} tone="ok" status="PostgreSQL" />
        <PlatformHealth
          label="Telemetry export"
          icon={Activity}
          tone={telemetryConfigured ? "ok" : "neutral"}
          status={telemetryConfigured ? "OTLP configured" : "Not configured"}
          detail={telemetryConfigured ? undefined : "Optional"}
        />
      </section>

      <DestinationProvidersCard
        canManage={canManage}
        added={enabledChannels.map((channel) => ({ channel, defaults: defaults[channel] ?? {}, shared: Boolean(connections[channel]) }))}
      />

      <DeliveryProvidersCard
        canManage={canManage}
        settings={{
          smtpHost: stored?.smtpHost ?? null,
          smtpPort: stored?.smtpPort ?? null,
          smtpSecure: stored?.smtpSecure ?? false,
          smtpUsername: stored?.smtpUsername ?? null,
          smtpFrom: stored?.smtpFrom ?? null,
          smtpPasswordStored: Boolean(stored?.smtpPasswordCiphertext),
          smsProvider: stored?.smsProvider ?? "TWILIO",
          smsAccountId: stored?.smsAccountId ?? null,
          smsFrom: stored?.smsFrom ?? null,
          smsSecretStored: Boolean(stored?.smsSecretCiphertext),
        }}
      />
    </div>
  );
}
