"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformCapability } from "@/lib/admin-guard";
import {
  clearDeliveryConfigCache,
  getDeliveryConfig,
  upsertPlatformConfiguration,
  type ProviderColumns,
} from "@/lib/delivery-config";
import { SMS_PROVIDER_IDS, SMS_PROVIDERS } from "@/lib/delivery-providers";
import { defaultable, DESTINATION_PROVIDERS, sanitizeDestinationDefaults, type DestinationDefaults } from "@/lib/destination-catalog";
import { validateDestinationConfig } from "@/lib/destination-validation";
import { parseDestinationConnections, type DestinationConnections } from "@/lib/platform-configuration";
import { validateHttpTarget } from "@/lib/target-validation";
import { decryptSecret, encryptSecret } from "@/lib/encryption";
import type { SmsProvider } from "@/lib/postgres/schema";
import {
  DESTINATION_CHANNELS,
  deliverConfig,
  deliverSms,
  verifySmsCredentials,
} from "@/lib/notification-providers";
import { writePlatformAudit } from "@/lib/platform-policy";
import { database, withDatabaseTransaction } from "@/lib/postgres/client";
import { createSmtpTransport, smtpTransport } from "@/lib/smtp";

function changeReason(formData: FormData) {
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 10) throw new Error("Enter a specific change reason");
  if (reason.length > 2_000) throw new Error("Reason must not exceed 2000 characters");
  return reason;
}

const text = (max: number) => z.string().trim().max(max);

const mailProviderSchema = z.object({
  host: text(255).min(1, "SMTP host is required"),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean(),
  username: text(255),
  password: z.string().max(1_000),
  from: text(320).min(3, "From address is required"),
});

const E164 = /^\+[1-9]\d{6,14}$/;

const smsProviderSchema = z.object({
  provider: z.enum(SMS_PROVIDER_IDS as [SmsProvider, ...SmsProvider[]]),
  accountId: text(128),
  secret: z.string().trim().max(512),
  fromNumber: text(32).min(1, "Sender is required"),
}).superRefine((input, context) => {
  if (input.provider === "TWILIO" && !/^AC[0-9a-fA-F]{32}$/.test(input.accountId)) {
    context.addIssue({ code: "custom", path: ["accountId"], message: "Twilio account SID starts with AC followed by 32 hex characters" });
  }
  if (input.provider !== "TELNYX" && !input.accountId) {
    context.addIssue({ code: "custom", path: ["accountId"], message: `${SMS_PROVIDERS[input.provider].accountLabel} is required` });
  }
  // Vonage also accepts an alphanumeric sender ID where the destination country allows it.
  const alphanumericSender = input.provider === "VONAGE" && /^[A-Za-z0-9 ]{1,11}$/.test(input.fromNumber);
  if (!E164.test(input.fromNumber) && !alphanumericSender) {
    context.addIssue({ code: "custom", path: ["fromNumber"], message: "Sender must be in E.164 format, for example +15551234567" });
  }
});

async function storedSecrets() {
  return database
    .selectFrom("platformConfiguration")
    .select(["smtpHost", "smtpPort", "smtpUsername", "smtpPasswordCiphertext", "smsProvider", "smsAccountId", "smsSecretCiphertext"])
    .where("id", "=", "global")
    .executeTakeFirst();
}

async function saveProviders(
  actor: Awaited<ReturnType<typeof requirePlatformCapability>>,
  reason: string,
  action: string,
  values: ProviderColumns,
  metadata: Record<string, unknown>
) {
  await withDatabaseTransaction(async (transaction) => {
    await upsertPlatformConfiguration(transaction, { ...values, updatedBy: actor.platformAdminId });
    await writePlatformAudit({
      actorId: actor.platformAdminId, actorEmail: actor.email, actorRole: actor.role,
      action, targetType: "platformConfiguration", targetId: "global", reason, metadata,
    }, { executor: transaction });
  });
  clearDeliveryConfigCache();
  revalidatePath("/organization/platform/configuration");
  revalidatePath("/organization/notifications");
}

/** The form's "Test connection" button checks the entered values without saving. */
const testOnly = (formData: FormData) => formData.get("intent") === "test";

/** Saves SMTP settings only after the server accepts a connection with them. */
export async function updateMailProvider(formData: FormData) {
  const actor = await requirePlatformCapability("configuration.manage");
  const input = mailProviderSchema.parse({
    host: formData.get("host"),
    port: formData.get("port"),
    secure: formData.get("secure") === "on",
    username: formData.get("username") ?? "",
    password: formData.get("password") ?? "",
    from: formData.get("from"),
  });
  // A blank password keeps the stored one, but only for the same server and
  // account: otherwise pointing the host elsewhere would send it there.
  const row = await storedSecrets();
  const sameTarget = row?.smtpHost === input.host && row.smtpPort === input.port && row.smtpUsername === (input.username || null);
  if (input.username && !input.password && row?.smtpPasswordCiphertext && !sameTarget) {
    throw new Error("Re-enter the SMTP password when changing the host, port, or username");
  }
  const stored = sameTarget ? row?.smtpPasswordCiphertext ?? null : null;
  const password = !input.username ? null : input.password || (stored ? decryptSecret(stored) : null);
  try {
    await createSmtpTransport({ ...input, username: input.username || null, password }).verify();
  } catch (error) {
    throw new Error(`SMTP connection failed: ${error instanceof Error ? error.message.slice(0, 300) : "unknown error"}`);
  }
  if (testOnly(formData)) return `Connected to ${input.host}:${input.port}${input.username ? " and signed in" : ""}. Nothing was saved.`;
  await saveProviders(actor, changeReason(formData), "MAIL_PROVIDER_UPDATED", {
    smtpHost: input.host,
    smtpPort: input.port,
    smtpSecure: input.secure,
    smtpUsername: input.username || null,
    smtpPasswordCiphertext: password ? encryptSecret(password) : null,
    smtpFrom: input.from,
  }, { host: input.host, port: input.port, secure: input.secure, username: input.username || null, from: input.from, passwordChanged: Boolean(input.password) });
}

export async function removeMailProvider(formData: FormData) {
  const actor = await requirePlatformCapability("configuration.manage");
  await saveProviders(actor, changeReason(formData), "MAIL_PROVIDER_REMOVED", {
    smtpHost: null, smtpPort: null, smtpSecure: false, smtpUsername: null, smtpPasswordCiphertext: null, smtpFrom: null,
  }, {});
}

export async function sendTestEmail() {
  const actor = await requirePlatformCapability("configuration.manage");
  clearDeliveryConfigCache();
  const smtp = await smtpTransport();
  const result = await smtp.transporter.sendMail({
    from: smtp.from,
    to: actor.email,
    subject: "SignalHub test email",
    text: "Email delivery is configured. Subscriber notifications will be sent through this server.",
  });
  if (!result.accepted?.length) throw new Error("SMTP server did not accept the recipient");
}

/** Saves SMS settings only after the provider accepts the credentials. */
export async function updateSmsProvider(formData: FormData) {
  const actor = await requirePlatformCapability("configuration.manage");
  const input = smsProviderSchema.parse({
    provider: formData.get("provider") ?? "TWILIO",
    accountId: formData.get("accountId") ?? "",
    secret: formData.get("secret") ?? "",
    fromNumber: formData.get("fromNumber"),
  });
  const accountId = input.provider === "TELNYX" ? null : input.accountId;
  // As with SMTP, a blank secret keeps the stored one only for the same provider and account.
  const row = await storedSecrets();
  const sameAccount = row?.smsProvider === input.provider && row.smsAccountId === accountId;
  if (!input.secret && row?.smsSecretCiphertext && !sameAccount) {
    throw new Error(`Re-enter the ${SMS_PROVIDERS[input.provider].secretLabel.toLowerCase()} when changing the provider or account`);
  }
  const stored = sameAccount ? row?.smsSecretCiphertext ?? null : null;
  const secret = input.secret || (stored ? decryptSecret(stored) : "");
  if (!secret) throw new Error(`${SMS_PROVIDERS[input.provider].secretLabel} is required`);
  await verifySmsCredentials({ provider: input.provider, accountId, secret });
  if (testOnly(formData)) return `${SMS_PROVIDERS[input.provider].label} accepted these credentials. Nothing was saved.`;
  await saveProviders(actor, changeReason(formData), "SMS_PROVIDER_UPDATED", {
    smsProvider: input.provider,
    smsAccountId: accountId,
    smsSecretCiphertext: encryptSecret(secret),
    smsFrom: input.fromNumber,
  }, { provider: input.provider, accountId, fromNumber: input.fromNumber, secretChanged: Boolean(input.secret) });
}

export async function removeSmsProvider(formData: FormData) {
  const actor = await requirePlatformCapability("configuration.manage");
  await saveProviders(actor, changeReason(formData), "SMS_PROVIDER_REMOVED", {
    smsAccountId: null, smsSecretCiphertext: null, smsFrom: null,
  }, {});
}

export async function sendTestSms(formData: FormData) {
  await requirePlatformCapability("configuration.manage");
  const to = z.string().trim().regex(E164, "Enter the test number in E.164 format").parse(formData.get("to"));
  clearDeliveryConfigCache();
  const { sms } = await getDeliveryConfig();
  if (!sms) throw new Error("Save the SMS provider first");
  await deliverSms(to, "SignalHub test SMS: SMS delivery is configured.", sms);
}

/**
 * Saves installation-wide defaults for non-secret destination settings. Form
 * fields are named `default:<CHANNEL>:<field>`; values equal to the built-in
 * default are not stored.
 */
/**
 * Adds or updates one team destination provider. Defaults pre-fill organization forms; credentials, when
 * given, become a shared connection that is test-delivered before it is saved.
 */
export async function saveDestinationProvider(formData: FormData) {
  const actor = await requirePlatformCapability("configuration.manage");
  const channel = z.enum(DESTINATION_CHANNELS).parse(formData.get("channel"));
  const provider = DESTINATION_PROVIDERS[channel];
  const input: Record<string, string> = {};
  for (const [name, value] of formData.entries()) {
    if (name.startsWith("field:") && typeof value === "string" && value.trim()) input[name.slice("field:".length)] = value.trim();
  }
  const row = await database.selectFrom("platformConfiguration")
    .select(["enabledDestinationChannels", "destinationDefaults", "destinationConnectionsCiphertext"])
    .where("id", "=", "global").executeTakeFirst();
  const connections = parseDestinationConnections(row?.destinationConnectionsCiphertext);
  const stored = connections[channel];

  const channelDefaults: Record<string, string> = {};
  for (const field of provider.fields.filter(defaultable)) {
    const value = input[field.key];
    if (!value || value === field.defaultValue) continue;
    channelDefaults[field.key] = field.kind === "url"
      ? (await validateHttpTarget(value, { httpsOnly: true, allowPrivate: false })).toString()
      : value;
  }
  const defaults: DestinationDefaults = sanitizeDestinationDefaults({ ...row?.destinationDefaults, [channel]: channelDefaults });

  const credentials = provider.fields.filter((field) => !defaultable(field));
  let connection: Record<string, string> | undefined;
  if (credentials.some((field) => input[field.key]) || stored) {
    // Blank secrets keep the stored ones, but only while every other value is unchanged:
    // otherwise pointing a URL elsewhere would send the old token there.
    const merged = { ...stored, ...input };
    const reusedSecret = provider.fields.some((field) => field.kind === "secret" && !input[field.key] && stored?.[field.key]);
    const targetChanged = provider.fields.some((field) => field.kind !== "secret" && stored && (merged[field.key] ?? "") !== (stored[field.key] ?? ""));
    if (reusedSecret && targetChanged) throw new Error("Re-enter the secrets when changing the other connection settings");
    connection = await validateDestinationConfig(channel, merged);
    try {
      await deliverConfig(channel, connection, {
        subject: "SignalHub connection test",
        body: `${provider.label} is connected for every organization on this installation.`,
        eventType: "destination.test",
      });
    } catch (error) {
      throw new Error(`${provider.label} test failed: ${error instanceof Error ? error.message.slice(0, 300) : "unknown error"}`);
    }
  }
  if (testOnly(formData)) {
    if (!connection) throw new Error("Enter the connection credentials to test them");
    return `Test message delivered through ${provider.label}. Nothing was saved.`;
  }

  if (connection) connections[channel] = connection;
  const enabled = new Set([...(row?.enabledDestinationChannels ?? []), channel]);
  const added = !row?.enabledDestinationChannels.includes(channel);
  await saveProviders(actor, `${added ? "Added" : "Updated"} ${provider.label} in platform configuration`, added ? "DESTINATION_PROVIDER_ADDED" : "DESTINATION_PROVIDER_UPDATED", {
    enabledDestinationChannels: DESTINATION_CHANNELS.filter((candidate) => enabled.has(candidate)),
    destinationDefaults: defaults,
    destinationConnectionsCiphertext: encryptConnections(connections),
  }, { channel, defaults: defaults[channel] ?? {}, sharedConnection: Boolean(connection), secretsChanged: credentials.some((field) => field.kind === "secret" && input[field.key]) });
}

/** Organizations can no longer add it; their existing destinations keep their own credentials, platform-connected ones stop. */
export async function removeDestinationProvider(formData: FormData) {
  const actor = await requirePlatformCapability("configuration.manage");
  const channel = z.enum(DESTINATION_CHANNELS).parse(formData.get("channel"));
  const row = await database.selectFrom("platformConfiguration")
    .select(["enabledDestinationChannels", "destinationDefaults", "destinationConnectionsCiphertext"])
    .where("id", "=", "global").executeTakeFirst();
  const connections = parseDestinationConnections(row?.destinationConnectionsCiphertext);
  delete connections[channel];
  const defaults = sanitizeDestinationDefaults(row?.destinationDefaults);
  delete defaults[channel];
  await saveProviders(actor, `Removed ${DESTINATION_PROVIDERS[channel].label} from platform configuration`, "DESTINATION_PROVIDER_REMOVED", {
    enabledDestinationChannels: (row?.enabledDestinationChannels ?? []).filter((candidate) => candidate !== channel),
    destinationDefaults: defaults,
    destinationConnectionsCiphertext: encryptConnections(connections),
  }, { channel });
}

const encryptConnections = (connections: DestinationConnections) =>
  Object.keys(connections).length ? encryptSecret(JSON.stringify(connections)) : null;
