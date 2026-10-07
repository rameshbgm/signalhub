import { database } from "@/lib/postgres/client";
import { getDeliveryConfig } from "@/lib/delivery-config";

export async function subscriptionCapabilities() {
  const worker = await database
    .selectFrom("workerHeartbeats")
    .select("id")
    .where("status", "=", "READY")
    .where("lastSeenAt", ">", new Date(Date.now() - 30_000))
    .executeTakeFirst();
  const workerReady = Boolean(worker);
  const delivery = await getDeliveryConfig();
  const smtpConfigured = Boolean(delivery.smtp);
  const smsConfigured = Boolean(delivery.sms);
  return {
    workerReady,
    email: {
      enabled: workerReady && smtpConfigured,
      reason: !smtpConfigured
        ? "Email delivery is not configured"
        : !workerReady
          ? "The delivery worker is unavailable"
          : null,
    },
    sms: {
      enabled: workerReady && smsConfigured,
      reason: !smsConfigured
        ? "SMS delivery is not configured"
        : !workerReady
          ? "The delivery worker is unavailable"
          : null,
    },
  };
}
