import { database } from "@/lib/postgres/client";
import { getDeliveryConfig } from "@/lib/delivery-config";

export async function subscriptionCapabilities(pageId?: string) {
  const [worker, delivery, configuration, page] = await Promise.all([
    database
    .selectFrom("workerHeartbeats")
    .select("id")
    .where("status", "=", "READY")
    .where("lastSeenAt", ">", new Date(Date.now() - 30_000))
    .executeTakeFirst(),
    getDeliveryConfig(),
    database.selectFrom("platformConfiguration").select("publicSubscriptionsEnabled").where("id", "=", "global").executeTakeFirst(),
    pageId ? database.selectFrom("pages").select("publicSubscriptionsEnabled").where("id", "=", pageId).where("deletedAt", "is", null).executeTakeFirst() : Promise.resolve(null),
  ]);
  const workerReady = Boolean(worker);
  const globallyEnabled = configuration?.publicSubscriptionsEnabled !== false;
  const pageEnabled = pageId ? Boolean(page?.publicSubscriptionsEnabled) : true;
  const allowed = globallyEnabled && pageEnabled;
  const disabledReason = !globallyEnabled ? "Public subscriptions are disabled globally" : !pageEnabled ? "Public subscriptions are disabled for this page" : null;
  const smtpConfigured = Boolean(delivery.smtp);
  const smsConfigured = Boolean(delivery.sms);
  return {
    workerReady,
    globallyEnabled,
    pageEnabled,
    available: allowed && (smtpConfigured || smsConfigured),
    email: {
      configured: allowed && smtpConfigured,
      enabled: allowed && workerReady && smtpConfigured,
      reason: disabledReason ?? (!smtpConfigured
        ? "Email delivery is not configured"
        : !workerReady
          ? "The delivery worker is unavailable"
          : null),
    },
    sms: {
      configured: allowed && smsConfigured,
      enabled: allowed && workerReady && smsConfigured,
      reason: disabledReason ?? (!smsConfigured
        ? "SMS delivery is not configured"
        : !workerReady
          ? "The delivery worker is unavailable"
          : null),
    },
  };
}

export type SubscriptionCapabilities = Awaited<ReturnType<typeof subscriptionCapabilities>>;
