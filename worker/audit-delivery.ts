import { createHmac } from "node:crypto";
import { collections } from "@/lib/db";
import { decryptSecret } from "@/lib/encryption";

export async function drainAuditDeliveryJobs(workerId: string, limit = 25) {
  let processed = 0;
  while (processed < limit) {
    const now = new Date();
    const job = await collections.auditDeliveryJobs().findOneAndUpdate(
      {
        nextAttemptAt: { $lte: now },
        $or: [
          { status: "PENDING" },
          { status: "PROCESSING", leaseExpiresAt: { $lte: now } },
        ],
      },
      {
        $set: {
          status: "PROCESSING",
          leaseOwner: workerId,
          leaseExpiresAt: new Date(now.getTime() + 60_000),
          updatedAt: now,
        },
        $inc: { attempts: 1 },
      },
      { sort: { nextAttemptAt: 1 }, returnDocument: "after" }
    );
    if (!job) break;
    const sink = await collections.auditSinks().findOne({ _id: job.sinkId, enabled: true });
    if (!sink) {
      await collections.auditDeliveryJobs().updateOne(
        { _id: job._id, leaseOwner: workerId },
        {
          $set: {
            status: "DEAD_LETTER",
            leaseOwner: null,
            leaseExpiresAt: null,
            lastError: "Audit sink is disabled or missing",
            updatedAt: new Date(),
          },
        }
      );
      processed += 1;
      continue;
    }
    try {
      const url = new URL(sink.url);
      if (url.protocol !== "https:" && process.env.ALLOW_INSECURE_AUDIT_SINKS !== "true") {
        throw new Error("Audit sink must use HTTPS");
      }
      const body = JSON.stringify(job.payload);
      const signature = createHmac("sha256", decryptSecret(sink.secretCiphertext))
        .update(body)
        .digest("hex");
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "status-audit-sink/1.0",
          "x-status-event-id": job.deduplicationKey,
          "x-status-signature-sha256": `sha256=${signature}`,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Audit sink returned HTTP ${response.status}`);
      await collections.auditDeliveryJobs().updateOne(
        { _id: job._id, leaseOwner: workerId },
        {
          $set: {
            status: "SENT",
            leaseOwner: null,
            leaseExpiresAt: null,
            lastError: null,
            responseStatus: response.status,
            updatedAt: new Date(),
            sentAt: new Date(),
          },
        }
      );
    } catch (error) {
      const terminal = job.attempts >= job.maxAttempts;
      await collections.auditDeliveryJobs().updateOne(
        { _id: job._id, leaseOwner: workerId },
        {
          $set: {
            status: terminal ? "DEAD_LETTER" : "PENDING",
            leaseOwner: null,
            leaseExpiresAt: null,
            lastError: error instanceof Error ? error.message : "Audit delivery failed",
            nextAttemptAt: terminal
              ? new Date("9999-12-31T23:59:59.999Z")
              : new Date(Date.now() + Math.min(60 * 60_000, 5_000 * 2 ** job.attempts)),
            updatedAt: new Date(),
          },
        }
      );
    }
    processed += 1;
  }
  return processed;
}
