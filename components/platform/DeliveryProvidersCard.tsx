"use client";

import { useRef, useState, type ReactNode } from "react";
import { Mail, Pencil, PlugZap, Plus, Save, Send, Smartphone, Trash2, type LucideIcon } from "lucide-react";
import {
  removeMailProvider,
  removeSmsProvider,
  sendTestEmail,
  sendTestSms,
  testMailProvider,
  testSmsProvider,
  updateMailProvider,
  updateSmsProvider,
} from "@/app/platform/(protected)/configuration/actions";
import { SmsConnectionFields, SmtpConnectionFields } from "@/components/platform/DeliveryProviderFields";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { PlatformSubmitButton } from "@/components/platform/PlatformSubmitButton";
import { smtpPresetFor, SMS_PROVIDERS } from "@/lib/delivery-providers";
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
  const port = settings.smtpPort ?? 587;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Subscriber email and SMS</CardTitle>
        <CardDescription className="max-w-2xl">
          Installation-wide providers for subscriber notifications on every status page. Settings are tested before they are saved, secrets are encrypted and never shown again, and the delivery worker picks up changes within 15 seconds.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        <ProviderSection
          icon={Mail}
          title="Email"
          noun="email provider"
          configured={mailConfigured}
          canManage={canManage}
          summary={[
            ["Service", smtpPresetFor(settings.smtpHost).label],
            ["Server", `${settings.smtpHost}:${port}${settings.smtpSecure ? " (TLS)" : ""}`],
            ["Username", settings.smtpUsername],
            ["From", settings.smtpFrom],
          ]}
          testAction={testMailProvider}
          removeAction={removeMailProvider}
          removeWarning="Remove the email provider? Subscribers stop receiving email updates until a new provider is added."
          sendTest={
            <PlatformActionForm action={sendTestEmail} successMessage="Test email sent to your address">
              <Button type="submit" variant="secondary" size="sm"><Send aria-hidden size={14} />Send test email to me</Button>
            </PlatformActionForm>
          }
          form={(done) => (
            <ProviderForm action={updateMailProvider} successMessage="Email provider verified and saved" onSaved={done}>
              <SmtpConnectionFields host={settings.smtpHost ?? ""} port={port} secure={settings.smtpSecure} username={settings.smtpUsername ?? ""} passwordStored={settings.smtpPasswordStored} />
              <Field label="From address" htmlFor="smtp-from" required hint="Status pages can replace the display name; the mailbox stays the same.">
                <Input id="smtp-from" name="from" required maxLength={320} defaultValue={settings.smtpFrom ?? ""} placeholder="Status <status@example.com>" />
              </Field>
            </ProviderForm>
          )}
        />

        <ProviderSection
          icon={Smartphone}
          title="SMS"
          noun="SMS provider"
          configured={smsConfigured}
          canManage={canManage}
          summary={[
            ["Provider", SMS_PROVIDERS[settings.smsProvider].label],
            ...(SMS_PROVIDERS[settings.smsProvider].accountLabel ? [[SMS_PROVIDERS[settings.smsProvider].accountLabel!, settings.smsAccountId] as [string, string | null]] : []),
            ["Sender", settings.smsFrom],
          ]}
          testAction={testSmsProvider}
          removeAction={removeSmsProvider}
          removeWarning="Remove the SMS provider? Subscribers stop receiving SMS updates until a new provider is added."
          sendTest={
            <PlatformActionForm action={sendTestSms} successMessage="Test SMS sent" className="flex items-end gap-2">
              <Field label="Send test SMS to" htmlFor="sms-test-to" className="min-w-0 flex-1">
                <Input id="sms-test-to" name="to" required maxLength={32} placeholder="+15551234567" />
              </Field>
              <Button type="submit" variant="secondary"><Send aria-hidden size={16} />Send</Button>
            </PlatformActionForm>
          }
          form={(done) => (
            <ProviderForm action={updateSmsProvider} successMessage="SMS provider verified and saved" onSaved={done}>
              <SmsConnectionFields provider={settings.smsProvider} accountId={settings.smsAccountId ?? ""} fromNumber={settings.smsFrom ?? ""} secretStored={settings.smsSecretStored} />
            </ProviderForm>
          )}
        />
      </CardContent>
    </Card>
  );
}

type Action = (formData: FormData) => void | string | Promise<void | string>;

/** A saved provider shows as a summary with Test, Edit and Remove; without one, an Add button opens the form. */
function ProviderSection({ icon, title, noun, configured, canManage, summary, testAction, removeAction, removeWarning, sendTest, form }: {
  icon: LucideIcon;
  title: string;
  noun: string;
  configured: boolean;
  canManage: boolean;
  summary: Array<[string, string | null]>;
  testAction: Action;
  removeAction: Action;
  removeWarning: string;
  sendTest: ReactNode;
  form: (done: () => void) => ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <section aria-label={title} className="space-y-4 rounded-control border border-line p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconTile icon={icon} hue="teal" size="sm" />
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
        </div>
        <StatusBadge tone={configured ? "ok" : "neutral"}>{configured ? "Configured" : "Not configured"}</StatusBadge>
      </div>

      {editing ? (
        form(() => setEditing(false))
      ) : configured ? (
        <>
          <dl className="space-y-2 text-sm">
            {summary.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3">
                <dt className="text-ink-soft">{label}</dt>
                <dd className="truncate font-medium text-ink">{value || "—"}</dd>
              </div>
            ))}
          </dl>
          {canManage && (
            <>
              <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                {/* `contents` lets each result message drop below the whole button row instead of splitting it. */}
                <PlatformActionForm action={testAction} successMessage="Connection works" className="contents" messageClassName="order-last">
                  <PlatformSubmitButton variant="secondary" size="sm" pendingLabel="Testing…"><PlugZap aria-hidden size={14} />Test connection</PlatformSubmitButton>
                </PlatformActionForm>
                <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(true)}><Pencil aria-hidden size={14} />Edit</Button>
                <PlatformActionForm action={removeAction} successMessage={`${title} provider removed`} className="contents" messageClassName="order-last">
                  <PlatformSubmitButton variant="ghost" size="sm" pendingLabel="Removing…" confirmMessage={removeWarning}><Trash2 aria-hidden size={14} />Remove</PlatformSubmitButton>
                </PlatformActionForm>
              </div>
              {sendTest}
            </>
          )}
        </>
      ) : canManage ? (
        <div className="rounded-control border border-dashed border-line-strong px-4 py-6 text-center">
          <p className="text-sm text-ink-soft">No {noun} yet. Subscribers cannot get {title === "SMS" ? "text messages" : "email"} until one is added.</p>
          <Button type="button" className="mt-3" onClick={() => setEditing(true)}><Plus aria-hidden size={16} />Add {noun}</Button>
        </div>
      ) : (
        <p className="text-sm text-ink-dim">Not configured.</p>
      )}
    </section>
  );
}

/** Test connection keeps the form open; a successful save hands back to the summary. */
function ProviderForm({ action, successMessage, onSaved, children }: { action: Action; successMessage: string; onSaved: () => void; children: ReactNode }) {
  // onSaved also closes the form on Cancel: both return to the summary or the Add button.
  const intent = useRef<"test" | "save">("save");
  return (
    <PlatformActionForm action={action} successMessage={successMessage} onSuccess={() => { if (intent.current === "save") onSaved(); }} className="space-y-4">
      {children}
      <div className="flex flex-wrap justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onSaved}>Cancel</Button>
        <Button type="submit" name="intent" value="test" variant="secondary" onClick={() => { intent.current = "test"; }}><PlugZap aria-hidden size={16} />Test connection</Button>
        <Button type="submit" name="intent" value="save" onClick={() => { intent.current = "save"; }}><Save aria-hidden size={16} />Verify and save</Button>
      </div>
    </PlatformActionForm>
  );
}
