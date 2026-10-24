import { DeliveryProvidersCard } from "@/components/platform/DeliveryProvidersCard";
import { DestinationProvidersCard } from "@/components/platform/DestinationProvidersCard";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { PlatformSubmitButton } from "@/components/platform/PlatformSubmitButton";
import { ConfigurationHeader } from "@/components/platform/SectionHeaders";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { sanitizeDestinationDefaults } from "@/lib/destination-catalog";
import { database } from "@/lib/postgres/client";
import { requirePlatformPageCapability } from "@/lib/platform-page-guard";
import { hasPlatformCapability } from "@/lib/platform-policy";
import { enabledDestinationChannels, parseDestinationConnections } from "@/lib/platform-configuration";
import { effectiveRetention, RETENTION_BOUNDS } from "@/lib/retention";
import { updatePlatformRetention } from "./actions";

export default async function PlatformConfigurationPage() {
  const actor = await requirePlatformPageCapability("configuration.read");
  const canManage = hasPlatformCapability(actor.role, "configuration.manage");
  const [enabledChannels, stored, platformRetention] = await Promise.all([
    enabledDestinationChannels(),
    database.selectFrom("platformConfiguration").selectAll().where("id", "=", "global").executeTakeFirst(),
    effectiveRetention(null),
  ]);
  const defaults = sanitizeDestinationDefaults(stored?.destinationDefaults);
  const connections = parseDestinationConnections(stored?.destinationConnectionsCiphertext);

  return (
    <div className="space-y-6">
      <ConfigurationHeader active="platform" />

      <DestinationProvidersCard
        canManage={canManage}
        added={enabledChannels.map((channel) => ({ channel, defaults: defaults[channel] ?? {}, shared: Boolean(connections[channel]) }))}
      />

      <DeliveryProvidersCard
        canManage={canManage}
        settings={{
          publicSubscriptionsEnabled: stored?.publicSubscriptionsEnabled ?? true,
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

      <Card>
        <CardHeader>
          <CardTitle>Platform retention defaults</CardTitle>
          <CardDescription>Storage retention is applied by the hourly cleanup worker. Organizations may override these values within the displayed bounds. Public pages show 90 days by default; change incident and maintenance history in the page’s Appearance settings.</CardDescription>
        </CardHeader>
        <CardContent>
          {canManage ? (
            <PlatformActionForm action={updatePlatformRetention} successMessage="Retention defaults updated" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(RETENTION_BOUNDS).map(([key, bounds]) => (
                <Field key={key} label={retentionLabel(key)} htmlFor={`retention-${key}`} hint={key === "resolvedIncidentsDays" ? `${bounds.min} to ${bounds.max} days. Expires closed service status intervals; incident records and timelines are retained.` : `${bounds.min} to ${bounds.max} days`}>
                  <Input id={`retention-${key}`} type="number" name={key} min={bounds.min} max={bounds.max} defaultValue={platformRetention[key as keyof typeof platformRetention]} />
                </Field>
              ))}
              <div className="flex justify-end sm:col-span-2 lg:col-span-4">
                <PlatformSubmitButton pendingLabel="Saving…">Save defaults</PlatformSubmitButton>
              </div>
            </PlatformActionForm>
          ) : (
            <pre className="overflow-auto rounded-control bg-sunken p-4 font-mono text-xs text-ink-soft">{JSON.stringify(platformRetention, null, 2)}</pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function retentionLabel(key: string) {
  const words = key.replace(/Days$/, "").replace(/([A-Z])/g, " $1").trim().toLowerCase();
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} (days)`;
}
