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
import { decryptSecret, encryptSecret } from "@/lib/encryption";
import {
  DESTINATION_CHANNELS,
  deliverSms,
  verifyTwilioCredentials,
  type DestinationChannel,
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

export async function updatePlatformConfiguration(formData: FormData) {
  const actor = await requirePlatformCapability("configuration.manage");
  const reason = changeReason(formData);
  const submitted = new Set(formData.getAll("enabledDestinationChannels").map(String));
  const enabledDestinationChannels = DESTINATION_CHANNELS.filter((channel) => submitted.has(channel)) satisfies DestinationChannel[];
  const now = new Date();
  await withDatabaseTransaction(async (transaction) => {
    await transaction.insertInto("platformConfiguration").values({
      id: "global", enabledDestinationChannels, updatedBy: actor.platformAdminId, updatedAt: now,
    }).onConflict((conflict) => conflict.column("id").doUpdateSet({
      enabledDestinationChannels, updatedBy: actor.platformAdminId, updatedAt: now,
    })).execute();
    await writePlatformAudit({
      actorId: actor.platformAdminId, actorEmail: actor.email, actorRole: actor.role,
      action: "PLATFORM_CONFIGURATION_UPDATED", targetType: "platformConfiguration",
      targetId: "global", reason, metadata: { enabledDestinationChannels },
    }, { executor: transaction });
  });
  revalidatePath("/organization/platform/configuration");
  revalidatePath("/organization/notifications");
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

const smsProviderSchema = z.object({
  accountSid: text(64).regex(/^AC[0-9a-fA-F]{32}$/, "Twilio account SID starts with AC followed by 32 hex characters"),
  authToken: z.string().trim().max(256),
  fromNumber: text(32).regex(/^\+[1-9]\d{6,14}$/, "From number must be in E.164 format, for example +15551234567"),
});

async function storedSecrets() {
  return database
    .selectFrom("platformConfiguration")
    .select(["smtpHost", "smtpPort", "smtpUsername", "smtpPasswordCiphertext", "twilioAuthTokenCiphertext"])
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

/** Saves SMTP settings only after the server accepts a connection with them. */
export async function updateMailProvider(formData: FormData) {
  const actor = await requirePlatformCapability("configuration.manage");
  const reason = changeReason(formData);
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
  await saveProviders(actor, reason, "MAIL_PROVIDER_UPDATED", {
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

/** Saves Twilio settings only after Twilio accepts the credentials. */
export async function updateSmsProvider(formData: FormData) {
  const actor = await requirePlatformCapability("configuration.manage");
  const reason = changeReason(formData);
  const input = smsProviderSchema.parse({
    accountSid: formData.get("accountSid"),
    authToken: formData.get("authToken") ?? "",
    fromNumber: formData.get("fromNumber"),
  });
  const stored = (await storedSecrets())?.twilioAuthTokenCiphertext ?? null;
  const authToken = input.authToken || (stored ? decryptSecret(stored) : "");
  if (!authToken) throw new Error("Twilio auth token is required");
  await verifyTwilioCredentials(input.accountSid, authToken);
  await saveProviders(actor, reason, "SMS_PROVIDER_UPDATED", {
    twilioAccountSid: input.accountSid,
    twilioAuthTokenCiphertext: encryptSecret(authToken),
    twilioFromNumber: input.fromNumber,
  }, { accountSid: input.accountSid, fromNumber: input.fromNumber, authTokenChanged: Boolean(input.authToken) });
}

export async function removeSmsProvider(formData: FormData) {
  const actor = await requirePlatformCapability("configuration.manage");
  await saveProviders(actor, changeReason(formData), "SMS_PROVIDER_REMOVED", {
    twilioAccountSid: null, twilioAuthTokenCiphertext: null, twilioFromNumber: null,
  }, {});
}

export async function sendTestSms(formData: FormData) {
  await requirePlatformCapability("configuration.manage");
  const to = z.string().trim().regex(/^\+[1-9]\d{6,14}$/, "Enter the test number in E.164 format").parse(formData.get("to"));
  clearDeliveryConfigCache();
  const { sms } = await getDeliveryConfig();
  if (!sms) throw new Error("Save the SMS provider first");
  await deliverSms(to, "SignalHub test SMS: SMS delivery is configured.", sms);
}
