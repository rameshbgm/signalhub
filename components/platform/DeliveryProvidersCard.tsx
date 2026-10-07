import { Mail, Save, Send, Smartphone, Trash2, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  removeMailProvider,
  removeSmsProvider,
  sendTestEmail,
  sendTestSms,
  updateMailProvider,
  updateSmsProvider,
} from "@/app/platform/(protected)/configuration/actions";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  twilioAccountSid: string | null;
  twilioFromNumber: string | null;
  twilioAuthTokenStored: boolean;
};

/** Secrets are write-only: the browser only learns whether one is stored. */
export function DeliveryProvidersCard({ settings, canManage }: { settings: DeliveryProviderSettings; canManage: boolean }) {
  const mailConfigured = Boolean(settings.smtpHost);
  const smsConfigured = Boolean(settings.twilioAccountSid);
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
                <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
                  <Field label="SMTP host" htmlFor="smtp-host" required>
                    <Input id="smtp-host" name="host" required maxLength={255} defaultValue={settings.smtpHost ?? ""} placeholder="smtp.example.com" autoComplete="off" />
                  </Field>
                  <Field label="Port" htmlFor="smtp-port" required>
                    <Input id="smtp-port" name="port" type="number" required min={1} max={65535} defaultValue={settings.smtpPort ?? 587} />
                  </Field>
                </div>
                <label className="flex items-center gap-2.5 text-sm text-ink">
                  <Checkbox name="secure" defaultChecked={settings.smtpSecure} />
                  Use implicit TLS (usually port 465; leave off for STARTTLS on 587)
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Username" htmlFor="smtp-username" hint="Leave blank for servers without authentication.">
                    <Input id="smtp-username" name="username" maxLength={255} defaultValue={settings.smtpUsername ?? ""} autoComplete="off" />
                  </Field>
                  <Field label="Password" htmlFor="smtp-password" hint={settings.smtpPasswordStored ? "Saved. Leave blank to keep it." : undefined}>
                    <Input id="smtp-password" name="password" type="password" maxLength={1000} placeholder={settings.smtpPasswordStored ? "••••••••" : ""} autoComplete="new-password" />
                  </Field>
                </div>
                <Field label="From address" htmlFor="smtp-from" required hint="Status pages can replace the display name; the mailbox stays the same.">
                  <Input id="smtp-from" name="from" required maxLength={320} defaultValue={settings.smtpFrom ?? ""} placeholder="Status <status@example.com>" />
                </Field>
                <ReasonField id="smtp-reason" />
                <div className="flex justify-end">
                  <Button type="submit"><Save aria-hidden size={16} />Verify and save</Button>
                </div>
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

        <ProviderSection icon={Smartphone} title="SMS (Twilio)" configured={smsConfigured}>
          {canManage ? (
            <>
              <PlatformActionForm action={updateSmsProvider} successMessage="SMS provider verified and saved" className="space-y-4">
                <Field label="Account SID" htmlFor="twilio-sid" required>
                  <Input id="twilio-sid" name="accountSid" required maxLength={64} defaultValue={settings.twilioAccountSid ?? ""} placeholder="AC…" autoComplete="off" />
                </Field>
                <Field label="Auth token" htmlFor="twilio-token" required={!settings.twilioAuthTokenStored} hint={settings.twilioAuthTokenStored ? "Saved. Leave blank to keep it." : undefined}>
                  <Input id="twilio-token" name="authToken" type="password" required={!settings.twilioAuthTokenStored} maxLength={256} placeholder={settings.twilioAuthTokenStored ? "••••••••" : ""} autoComplete="new-password" />
                </Field>
                <Field label="From number" htmlFor="twilio-from" required hint="E.164 format, for example +15551234567.">
                  <Input id="twilio-from" name="fromNumber" required maxLength={32} defaultValue={settings.twilioFromNumber ?? ""} placeholder="+15551234567" />
                </Field>
                <ReasonField id="twilio-reason" />
                <div className="flex justify-end">
                  <Button type="submit"><Save aria-hidden size={16} />Verify and save</Button>
                </div>
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
            <ReadOnly rows={[["Account SID", settings.twilioAccountSid], ["From number", settings.twilioFromNumber]]} />
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
