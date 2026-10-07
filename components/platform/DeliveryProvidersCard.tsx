import { Mail, PlugZap, Save, Send, Smartphone, Trash2, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  removeMailProvider,
  removeSmsProvider,
  sendTestEmail,
  sendTestSms,
  updateMailProvider,
  updateSmsProvider,
} from "@/app/platform/(protected)/configuration/actions";
import { SmsConnectionFields, SmtpConnectionFields } from "@/components/platform/DeliveryProviderFields";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { SMS_PROVIDERS } from "@/lib/delivery-providers";
import type { SmsProvider } from "@/lib/postgres/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { IconTile } from "@/components/ui/icon-tile";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";

export type DeliveryProviderSettings = {
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  smtpUsername: string | null;
  smtpFrom: string | null;
  smtpPasswordStored: boolean;
  smsProvider: SmsProvider;
  smsAccountId: string | null;
  smsFrom: string | null;
  smsSecretStored: boolean;
};

/** Secrets are write-only: the browser only learns whether one is stored. */
export function DeliveryProvidersCard({ settings, canManage }: { settings: DeliveryProviderSettings; canManage: boolean }) {
  const mailConfigured = Boolean(settings.smtpHost);
  const smsConfigured = Boolean(settings.smsFrom);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Subscriber email and SMS</CardTitle>
        <CardDescription className="max-w-2xl">
          Installation-wide providers for subscriber notifications on every status page. Settings are tested before they are saved, secrets are encrypted and never shown again, and the delivery worker picks up changes within 15 seconds.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        <ProviderSection icon={Mail} title="Email (SMTP)" configured={mailConfigured}>
          {canManage ? (
            <>
              <PlatformActionForm action={updateMailProvider} successMessage="Email provider verified and saved" className="space-y-4">
                <SmtpConnectionFields
                  host={settings.smtpHost ?? ""}
                  port={settings.smtpPort ?? 587}
                  secure={settings.smtpSecure}
                  username={settings.smtpUsername ?? ""}
                  passwordStored={settings.smtpPasswordStored}
                />
                <Field label="From address" htmlFor="smtp-from" required hint="Status pages can replace the display name; the mailbox stays the same.">
                  <Input id="smtp-from" name="from" required maxLength={320} defaultValue={settings.smtpFrom ?? ""} placeholder="Status <status@example.com>" />
                </Field>
                <ReasonField id="smtp-reason" />
                <SubmitRow />
              </PlatformActionForm>
              {mailConfigured && (
                <div className="flex flex-wrap gap-3 border-t border-line pt-4">
                  <PlatformActionForm action={sendTestEmail} successMessage="Test email sent to your address">
                    <Button type="submit" variant="secondary"><Send aria-hidden size={16} />Send test email to me</Button>
                  </PlatformActionForm>
                  <RemoveForm action={removeMailProvider} id="smtp-remove-reason" label="Remove email provider" />
                </div>
              )}
            </>
          ) : (
            <ReadOnly rows={[["Host", settings.smtpHost && `${settings.smtpHost}:${settings.smtpPort ?? 587}`], ["From", settings.smtpFrom]]} />
          )}
        </ProviderSection>

        <ProviderSection icon={Smartphone} title="SMS" configured={smsConfigured}>
          {canManage ? (
            <>
              <PlatformActionForm action={updateSmsProvider} successMessage="SMS provider verified and saved" className="space-y-4">
                <SmsConnectionFields
                  provider={settings.smsProvider}
                  accountId={settings.smsAccountId ?? ""}
                  fromNumber={settings.smsFrom ?? ""}
                  secretStored={settings.smsSecretStored}
                />
                <ReasonField id="twilio-reason" />
                <SubmitRow />
              </PlatformActionForm>
              {smsConfigured && (
                <div className="space-y-4 border-t border-line pt-4">
                  <PlatformActionForm action={sendTestSms} successMessage="Test SMS sent" className="flex items-end gap-3">
                    <Field label="Send test SMS to" htmlFor="twilio-test-to" className="min-w-0 flex-1">
                      <Input id="twilio-test-to" name="to" required maxLength={32} placeholder="+15551234567" />
                    </Field>
                    <Button type="submit" variant="secondary"><Send aria-hidden size={16} />Send</Button>
                  </PlatformActionForm>
                  <RemoveForm action={removeSmsProvider} id="twilio-remove-reason" label="Remove SMS provider" />
                </div>
              )}
            </>
          ) : (
            <ReadOnly rows={[["Provider", smsConfigured ? SMS_PROVIDERS[settings.smsProvider].label : null], ["Sender", settings.smsFrom]]} />
          )}
        </ProviderSection>
      </CardContent>
    </Card>
  );
}

function ProviderSection({ icon, title, configured, children }: { icon: LucideIcon; title: string; configured: boolean; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-4 rounded-control border border-line p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconTile icon={icon} hue="teal" size="sm" />
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
        </div>
        <StatusBadge tone={configured ? "ok" : "neutral"}>{configured ? "Configured" : "Not configured"}</StatusBadge>
      </div>
      {children}
    </section>
  );
}

/** "Test connection" skips the change reason, so it bypasses browser validation; the server still validates. */
function SubmitRow() {
  return (
    <div className="flex flex-wrap justify-end gap-3">
      <Button type="submit" name="intent" value="test" variant="secondary" formNoValidate><PlugZap aria-hidden size={16} />Test connection</Button>
      <Button type="submit" name="intent" value="save"><Save aria-hidden size={16} />Verify and save</Button>
    </div>
  );
}

function ReasonField({ id }: { id: string }) {
  return (
    <Field label="Change reason" htmlFor={id} required hint="Recorded in the platform audit log. Minimum 10 characters.">
      <Input id={id} name="reason" required minLength={10} maxLength={2000} />
    </Field>
  );
}

function RemoveForm({ action, id, label }: { action: (formData: FormData) => Promise<void>; id: string; label: string }) {
  return (
    <PlatformActionForm action={action} successMessage="Provider removed" className="flex items-end gap-3">
      <Field label="Reason for removal" htmlFor={id} className="min-w-0 flex-1">
        <Input id={id} name="reason" required minLength={10} maxLength={2000} />
      </Field>
      <Button type="submit" variant="destructive"><Trash2 aria-hidden size={16} />{label}</Button>
    </PlatformActionForm>
  );
}

function ReadOnly({ rows }: { rows: Array<[string, string | null]> }) {
  return (
    <dl className="space-y-2 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-3">
          <dt className="text-ink-soft">{label}</dt>
          <dd className="truncate font-medium text-ink">{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
