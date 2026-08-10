import { createHmac } from "node:crypto";
import { database, withDatabaseTransaction } from "@/lib/postgres/client";
import { decryptSecret } from "@/lib/encryption";
import { errorFields, logger } from "@/lib/logger";

async function leaseAuditDeliveryJob(workerId: string) {
  return withDatabaseTransaction(async (transaction) => {
    const now = new Date();
    const candidate = await transaction
      .selectFrom("auditDeliveryJobs")
      .select("id")
      .where("nextAttemptAt", "<=", now)
      .where((expression) => expression.or([
        expression("status", "=", "PENDING"),
        expression.and([
          expression("status", "=", "PROCESSING"),
          expression("leaseExpiresAt", "<=", now),
        ]),
      ]))
      .orderBy("nextAttemptAt", "asc")
      .forUpdate()
      .skipLocked()
      .executeTakeFirst();
    if (!candidate) return null;
    return transaction.updateTable("auditDeliveryJobs").set((expression) => ({
      status: "PROCESSING",
      leaseOwner: workerId,
      leaseExpiresAt: new Date(now.getTime() + 60_000),
      updatedAt: now,
      attempts: expression("attempts", "+", 1),
    })).where("id", "=", candidate.id).returningAll().executeTakeFirst();
  });
}

export async function drainAuditDeliveryJobs(workerId: string, limit = 25) {
  let processed = 0;
  while (processed < limit) {
    const job = await leaseAuditDeliveryJob(workerId);
    if (!job) break;
    const sink = await database.selectFrom("auditSinks").selectAll()
      .where("id", "=", job.sinkId).where("enabled", "=", true).executeTakeFirst();
    if (!sink) {
      await database.updateTable("auditDeliveryJobs").set({
        status: "DEAD_LETTER",
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: "Audit sink is disabled or missing",
        updatedAt: new Date(),
      }).where("id", "=", job.id).where("leaseOwner", "=", workerId).execute();
      processed += 1;
      continue;
    }
    try {
      const url = new URL(sink.url);
      if (url.protocol !== "https:" && process.env.ALLOW_INSECURE_AUDIT_SINKS !== "true") {
        throw new Error("Audit sink must use HTTPS");
      }
      const body = JSON.stringify(job.payload);
      const signature = createHmac("sha256", decryptSecret(sink.secretCiphertext)).update(body).digest("hex");
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "signalhub-audit-sink/1.0",
          "x-signalhub-event-id": job.deduplicationKey,
          "x-signalhub-signature-sha256": `sha256=${signature}`,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Audit sink returned HTTP ${response.status}`);
      const sentAt = new Date();
      await database.updateTable("auditDeliveryJobs").set({
        status: "SENT",
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: null,
        responseStatus: response.status,
        updatedAt: sentAt,
        sentAt,
      }).where("id", "=", job.id).where("leaseOwner", "=", workerId).execute();
    } catch (error) {
      const terminal = job.attempts >= job.maxAttempts;
      logger.warn({ ...errorFields(error), jobId: job.id, sinkId: sink.id, terminal }, "Audit delivery failed");
      await database.updateTable("auditDeliveryJobs").set({
        status: terminal ? "DEAD_LETTER" : "PENDING",
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: error instanceof Error ? error.message : "Audit delivery failed",
        nextAttemptAt: terminal
          ? new Date("9999-12-31T23:59:59.999Z")
          : new Date(Date.now() + Math.min(60 * 60_000, 5_000 * 2 ** job.attempts)),
        updatedAt: new Date(),
      }).where("id", "=", job.id).where("leaseOwner", "=", workerId).execute();
    }
    processed += 1;
  }
  return processed;
}
