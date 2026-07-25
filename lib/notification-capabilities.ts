import { collections } from "@/lib/db";
import { smtpConfigured } from "@/lib/smtp";

export async function subscriptionCapabilities() {
  const worker = await collections.workerHeartbeats().findOne({
    status: "READY",
    lastSeenAt: { $gt: new Date(Date.now() - 30_000) },
  });
  const workerReady = Boolean(worker);
  const smsConfigured = Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
  );
  return {
    workerReady,
    email: {
      enabled: workerReady && smtpConfigured(),
      reason: !smtpConfigured()
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
