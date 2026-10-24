"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SMS_PROVIDER_IDS, SMS_PROVIDERS, SMTP_PRESETS } from "@/lib/delivery-providers";
import type { SmsProvider } from "@/lib/postgres/schema";
import { INPUT_LIMITS } from "@/lib/input-limits";

/** Host, port, TLS and username, with presets for common SMTP services. */
export function SmtpConnectionFields({ host, port, secure, username, passwordStored }: {
  host: string; port: number; secure: boolean; username: string; passwordStored: boolean;
}) {
  const [values, setValues] = useState({ host, port: String(port), secure, username });
  const [presetId, setPresetId] = useState(() => SMTP_PRESETS.find((preset) => preset.host && preset.host === host)?.id ?? "custom");
  const preset = SMTP_PRESETS.find((candidate) => candidate.id === presetId) ?? SMTP_PRESETS[0];

  function choose(id: string) {
    setPresetId(id as typeof presetId);
    const next = SMTP_PRESETS.find((candidate) => candidate.id === id);
    if (next && next.id !== "custom") setValues({ host: next.host, port: String(next.port), secure: next.secure, username: next.username || values.username });
  }

  return (
    <>
      <Field label="Service" htmlFor="smtp-preset" hint={preset.hint || undefined}>
        <Select id="smtp-preset" value={presetId} onChange={(event) => choose(event.target.value)} className="w-full">
          {SMTP_PRESETS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
        <Field label="SMTP host" htmlFor="smtp-host" required>
          <Input id="smtp-host" name="host" required maxLength={INPUT_LIMITS.smtpHost} value={values.host} onChange={(event) => setValues({ ...values, host: event.target.value })} placeholder="smtp.example.com" autoComplete="off" />
        </Field>
        <Field label="Port" htmlFor="smtp-port" required>
          <Input id="smtp-port" name="port" type="number" required min={1} max={65535} value={values.port} onChange={(event) => setValues({ ...values, port: event.target.value })} />
        </Field>
      </div>
      <label className="flex items-center gap-2.5 text-sm text-ink">
        <Checkbox name="secure" checked={values.secure} onChange={(event) => setValues({ ...values, secure: event.target.checked })} />
        Use implicit TLS (usually port 465; leave off for STARTTLS on 587)
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Username" htmlFor="smtp-username" hint="Leave blank for servers without authentication.">
          <Input id="smtp-username" name="username" maxLength={INPUT_LIMITS.smtpUsername} value={values.username} onChange={(event) => setValues({ ...values, username: event.target.value })} autoComplete="off" />
        </Field>
        <Field label="Password" htmlFor="smtp-password" hint={passwordStored ? "Saved. Leave blank to keep it." : undefined}>
          <Input id="smtp-password" name="password" type="password" maxLength={INPUT_LIMITS.smtpPassword} placeholder={passwordStored ? "••••••••" : ""} autoComplete="new-password" />
        </Field>
      </div>
    </>
  );
}

/** Provider choice with the account, secret and sender labels that provider uses. */
export function SmsConnectionFields({ provider: initialProvider, accountId, fromNumber, secretStored }: {
  provider: SmsProvider; accountId: string; fromNumber: string; secretStored: boolean;
}) {
  const [provider, setProvider] = useState<SmsProvider>(initialProvider);
  const meta = SMS_PROVIDERS[provider];
  // A stored secret only applies to the provider it was saved for.
  const keepsSecret = secretStored && provider === initialProvider;
  return (
    <>
      <Field label="Provider" htmlFor="sms-provider" hint={meta.hint}>
        <Select id="sms-provider" name="provider" value={provider} onChange={(event) => setProvider(event.target.value as SmsProvider)} className="w-full">
          {SMS_PROVIDER_IDS.map((id) => <option key={id} value={id}>{SMS_PROVIDERS[id].label}</option>)}
        </Select>
      </Field>
      {meta.accountLabel && (
        <Field label={meta.accountLabel} htmlFor="sms-account" required>
          <Input key={provider} id="sms-account" name="accountId" required maxLength={INPUT_LIMITS.smsAccountId} defaultValue={provider === initialProvider ? accountId : ""} placeholder={provider === "TWILIO" ? "AC…" : ""} autoComplete="off" />
        </Field>
      )}
      <Field label={meta.secretLabel} htmlFor="sms-secret" required={!keepsSecret} hint={keepsSecret ? "Saved. Leave blank to keep it." : undefined}>
        <Input key={provider} id="sms-secret" name="secret" type="password" required={!keepsSecret} maxLength={INPUT_LIMITS.smsSecret} placeholder={keepsSecret ? "••••••••" : ""} autoComplete="new-password" />
      </Field>
      <Field label="Sender" htmlFor="sms-from" required hint={provider === "VONAGE" ? "E.164 number, or an alphanumeric sender ID of up to 11 characters." : "E.164 format, for example +15551234567."}>
        <Input id="sms-from" name="fromNumber" required maxLength={INPUT_LIMITS.smsSender} defaultValue={fromNumber} placeholder="+15551234567" />
      </Field>
    </>
  );
}
