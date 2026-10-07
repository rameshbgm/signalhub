import { decryptSecret, encryptSecret } from "@/lib/encryption";
import { log } from "@/lib/logger";
import { writePlatformAudit } from "@/lib/platform-policy";
import { DESTINATION_CHANNELS } from "@/lib/notification-providers";
import type { Updateable } from "kysely";
import { database, type DatabaseExecutor } from "@/lib/postgres/client";
import type { PlatformConfigurationTable } from "@/lib/postgres/schema";

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  password: string | null;
  from: string;
};

export type SmsConfig = {
  accountSid: string;
  authToken: string;
  fromNumber: string;
};

export type DeliveryConfig = { smtp: SmtpConfig | null; sms: SmsConfig | null };

export type ProviderColumns = Omit<Updateable<PlatformConfigurationTable>, "id" | "updatedAt">;

export const DEFAULT_SMTP_FROM = "SignalHub <signalhub@localhost>";

// ponytail: 15s in-process TTL so the separate worker process picks up console
// changes without a restart; switch to LISTEN/NOTIFY if instant propagation matters.
const CACHE_TTL_MS = 15_000;
let cached: { value: DeliveryConfig; expiresAt: number } | null = null;

export function clearDeliveryConfigCache() {
  cached = null;
}

function decrypt(value: string | null, field: string) {
  if (!value) return null;
  try {
    return decryptSecret(value);
  } catch (error) {
    // A missing or rotated-out key makes the provider unusable, not the page.
    log("error", "Stored delivery provider secret could not be decrypted", {
      field,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

export async function getDeliveryConfig(): Promise<DeliveryConfig> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const row = await database
    .selectFrom("platformConfiguration")
    .selectAll()
    .where("id", "=", "global")
    .executeTakeFirst();
  const value: DeliveryConfig = { smtp: null, sms: null };
  if (row?.smtpHost) {
    const password = decrypt(row.smtpPasswordCiphertext, "smtp_password");
    if (password !== undefined) {
      value.smtp = {
        host: row.smtpHost,
        port: row.smtpPort ?? 587,
        secure: row.smtpSecure,
        username: row.smtpUsername,
        password,
        from: row.smtpFrom || DEFAULT_SMTP_FROM,
      };
    }
  }
  if (row?.twilioAccountSid && row.twilioFromNumber) {
    const authToken = decrypt(row.twilioAuthTokenCiphertext, "twilio_auth_token");
    if (authToken) {
      value.sms = { accountSid: row.twilioAccountSid, authToken, fromNumber: row.twilioFromNumber };
    }
  }
  cached = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}

/**
 * Upgrades from releases that read SMTP_* and TWILIO_* from the environment:
 * copies those values into platform configuration once, only when nothing is
 * stored yet, so email and SMS keep working after the upgrade.
 */
export async function importLegacyDeliveryEnvironment(executor: DatabaseExecutor = database) {
  const env = process.env;
  const row = await executor
    .selectFrom("platformConfiguration")
    .select(["smtpHost", "twilioAccountSid"])
    .where("id", "=", "global")
    .executeTakeFirst();
  const values: ProviderColumns = {};
  if (env.SMTP_HOST && !row?.smtpHost) {
    Object.assign(values, {
      smtpHost: env.SMTP_HOST,
      smtpPort: Number(env.SMTP_PORT ?? 587),
      smtpSecure: env.SMTP_SECURE === "true",
      smtpUsername: env.SMTP_USERNAME || null,
      smtpPasswordCiphertext: env.SMTP_PASSWORD ? encryptSecret(env.SMTP_PASSWORD) : null,
      smtpFrom: env.SMTP_FROM || DEFAULT_SMTP_FROM,
    });
  }
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER && !row?.twilioAccountSid) {
    Object.assign(values, {
      twilioAccountSid: env.TWILIO_ACCOUNT_SID,
      twilioAuthTokenCiphertext: encryptSecret(env.TWILIO_AUTH_TOKEN),
      twilioFromNumber: env.TWILIO_FROM_NUMBER,
    });
  }
  const imported = [values.smtpHost && "smtp", values.twilioAccountSid && "sms"].filter(Boolean) as string[];
  if (!imported.length) return imported;
  await upsertPlatformConfiguration(executor, { updatedBy: null, ...values });
  await writePlatformAudit({
    actorId: null, actorEmail: "system@signalhub", actorRole: "SYSTEM",
    action: "DELIVERY_PROVIDERS_IMPORTED", targetType: "platformConfiguration", targetId: "global",
    reason: "Imported from SMTP_* / TWILIO_* environment variables during upgrade",
    metadata: { imported, smtpHost: values.smtpHost ?? null, twilioAccountSid: values.twilioAccountSid ?? null },
  }, { executor });
  return imported;
}

/**
 * Writes the singleton row. A missing row means "every destination provider
 * enabled", so a first insert must keep that default instead of the column's '{}'.
 */
export async function upsertPlatformConfiguration(
  executor: DatabaseExecutor,
  values: ProviderColumns & { updatedBy: string | null }
) {
  const changes = { ...values, updatedAt: new Date() };
  await executor.insertInto("platformConfiguration")
    .values({ id: "global", enabledDestinationChannels: [...DESTINATION_CHANNELS], ...changes })
    .onConflict((conflict) => conflict.column("id").doUpdateSet(changes))
    .execute();
}
