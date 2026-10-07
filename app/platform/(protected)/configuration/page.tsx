import Link from "next/link";
import { Activity, ArrowRight, Cpu, Globe, HardDrive, KeyRound, Mail, Smartphone, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { DeliveryProvidersCard } from "@/components/platform/DeliveryProvidersCard";
import { DestinationProvidersCard } from "@/components/platform/DestinationProvidersCard";
import { sanitizeDestinationDefaults } from "@/lib/destination-catalog";
import { database } from "@/lib/postgres/client";
import { requirePlatformPageCapability } from "@/lib/platform-page-guard";
import { hasPlatformCapability } from "@/lib/platform-policy";
import { subscriptionCapabilities } from "@/lib/notification-capabilities";
import { enabledDestinationChannels } from "@/lib/platform-configuration";
import { IconTile, type Hue } from "@/components/ui/icon-tile";
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
  const enabled = new Set(enabledChannels);
  const appUrlConfigured = Boolean(process.env.NEXT_PUBLIC_APP_URL);
  const storageDriver = (process.env.ASSET_STORAGE_DRIVER ?? "local").toLowerCase();
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
        <PlatformHealth label="Asset storage" icon={HardDrive} tone="ok" status={storageDriver === "s3" ? "S3" : "Local filesystem"} />
        <PlatformHealth
          label="Telemetry export"
          icon={Activity}
          tone={telemetryConfigured ? "ok" : "neutral"}
          status={telemetryConfigured ? "OTLP configured" : "Not configured"}
          detail={telemetryConfigured ? undefined : "Optional"}
        />
      </section>

      <DestinationProvidersCard canManage={canManage} enabled={enabled} defaults={sanitizeDestinationDefaults(stored?.destinationDefaults)} />

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

      <section aria-label="Related settings" className="grid gap-4 md:grid-cols-2">
        <ManagementLink href="/organization/platform/identity" icon={KeyRound} hue="teal" title="Identity and provisioning" detail="Manage OIDC, SAML, SCIM, and enterprise authentication policy." />
        <ManagementLink href="/organization/platform/operations" icon={Activity} hue="sky" title="Operations" detail="Inspect workers, delivery queues, migrations, and retention defaults." />
      </section>
    </div>
  );
}

function ManagementLink({ href, icon, hue, title, detail }: { href: string; icon: LucideIcon; hue: Hue; title: string; detail: string }) {
  return (
    <Link href={href} className="group block rounded-card border border-line bg-surface shadow-card p-5 outline-none transition-[border-color,box-shadow,transform] duration-200 ease-soft hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-raised focus-visible:ring-4 focus-visible:ring-primary/25">
      <IconTile icon={icon} hue={hue} />
      <h2 className="mt-4 text-base font-semibold tracking-tight text-ink">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-ink-soft">{detail}</p>
      <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-ink">
        Manage
        <ArrowRight aria-hidden size={16} className="transition-transform duration-200 ease-soft group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
