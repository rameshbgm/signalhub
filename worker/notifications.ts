import { createHmac } from "node:crypto";
import { database, withDatabaseTransaction, type DatabaseExecutor } from "@/lib/postgres/client";
import type { NotificationJobRow } from "@/lib/postgres/schema";
import { decryptSecret } from "@/lib/encryption";
import { smtpTransport, verifySmtp } from "@/lib/smtp";
import { deliverDestination, deliverSms } from "@/lib/notification-providers";
import { startLeaseHeartbeat } from "@/worker/lease-heartbeat";

const NOTIFICATION_LEASE_MILLISECONDS = 30_000;
const NOTIFICATION_LEASE_RENEWAL_MILLISECONDS = 10_000;

class DeliveryError extends Error {
  constructor(
    message: string,
    public readonly transient: boolean,
    public readonly responseStatus: number | null = null
  ) {
    super(message);
  }
}

export { verifySmtp };

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character]!));
}

function notificationHtml(input: {
  pageName: string;
  logoUrl: string | null;
  brandColor: string;
  subject: string;
  body: string;
}) {
  const paragraphs = input.body
    .split(/\n{2,}/)
    .map((part) => `<p style="margin:0 0 16px;color:#344054;line-height:1.6">${escapeHtml(part).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#f3f6f9;font-family:Arial,sans-serif;color:#101828">
<div style="max-width:600px;margin:32px auto;background:#fff;border:1px solid #dfe5ec">
<div style="padding:20px 24px;border-top:4px solid ${escapeHtml(input.brandColor)}">
${input.logoUrl ? `<img src="${escapeHtml(input.logoUrl)}" alt="${escapeHtml(input.pageName)}" style="display:block;max-width:180px;max-height:48px;margin-bottom:16px">` : ""}
<div style="font-size:13px;color:#667085;margin-bottom:8px">${escapeHtml(input.pageName)}</div>
<h1 style="font-size:22px;line-height:1.35;margin:0 0 18px">${escapeHtml(input.subject)}</h1>${paragraphs}
</div></div></body></html>`;
}

async function postJson(url: string, body: string, headers: Record<string, string> = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
    signal: AbortSignal.timeout(Number(process.env.WEBHOOK_TIMEOUT_MS ?? 10_000)),
    redirect: "error",
  }).catch((error) => {
    throw new DeliveryError(
      error instanceof Error ? `Webhook network error: ${error.message}` : "Webhook network error",
      true
    );
  });
  if (!response.ok) {
    const transient = response.status === 408 || response.status === 429 || response.status >= 500;
    throw new DeliveryError(`Webhook returned HTTP ${response.status}`, transient, response.status);
  }
  return response.status;
}

async function deliver(job: NotificationJobRow) {
  if (job.channel === "EMAIL") {
    let result;
    try {
      const page = await database
        .selectFrom("pages")
        .select(["name", "logoUrl", "brandColor"])
        .where("id", "=", job.pageId)
        .executeTakeFirst();
      result = await smtpTransport().sendMail({
        from: process.env.SMTP_FROM ?? "SignalHub <signalhub@localhost>",
        to: job.contact,
        subject: job.subject,
        text: job.body,
        html: notificationHtml({
          pageName: page?.name ?? "SignalHub",
          logoUrl: page?.logoUrl ?? null,
          brandColor: page?.brandColor ?? "#0f9fab",
          subject: job.subject,
          body: job.body,
        }),
      });
    } catch (error) {
      throw new DeliveryError(
        error instanceof Error ? `SMTP delivery failed: ${error.message}` : "SMTP delivery failed",
        true
      );
    }
    if (!result.accepted?.length) throw new DeliveryError("SMTP server did not accept the recipient", true);
    return null;
  }
  if (job.channel === "SMS") return deliverSms(job.contact, job.body);
  if (job.destinationId) {
    const destination = await database
      .selectFrom("notificationDestinations")
      .selectAll()
      .where("id", "=", job.destinationId)
      .where("active", "=", true)
      .where("verifiedAt", "is not", null)
      .executeTakeFirst();
    if (!destination) throw new DeliveryError("Notification destination is no longer active", false);
    try {
      return await deliverDestination(destination, {
        subject: job.subject,
        body: job.body,
        eventType: job.eventType,
      });
    } catch (error) {
      throw new DeliveryError(error instanceof Error ? error.message : "Destination delivery failed", true);
    }
  }
  if (job.channel === "SLACK") {
    return postJson(job.contact, JSON.stringify({ text: `*${job.subject}*\n${job.body}` }));
  }
  if (job.channel === "MICROSOFT_TEAMS") {
    return postJson(job.contact, JSON.stringify({
      type: "message",
      attachments: [{
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            { type: "TextBlock", weight: "Bolder", text: job.subject },
            { type: "TextBlock", wrap: true, text: job.body },
          ],
        },
      }],
    }));
  }
  if (job.channel === "WEBHOOK" && job.endpointId) {
    const endpoint = await database
      .selectFrom("webhookEndpoints")
      .selectAll()
      .where("id", "=", job.endpointId)
      .where("active", "=", true)
      .where("verifiedAt", "is not", null)
      .executeTakeFirst();
    if (!endpoint) throw new DeliveryError("Webhook endpoint is no longer active", false);
    const payload = job.payload && typeof job.payload === "object" ? job.payload : {};
    const body = JSON.stringify({ id: job.id, ...payload });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac("sha256", decryptSecret(endpoint.secretCiphertext))
      .update(`${timestamp}.${body}`)
      .digest("hex");
    return postJson(endpoint.url, body, {
      "x-status-event": job.eventType,
      "x-status-timestamp": timestamp,
      "x-status-signature": `sha256=${signature}`,
      "x-status-delivery": job.id,
    });
  }
  throw new DeliveryError(`Unsupported notification channel ${job.channel}`, false);
}

async function leaseNotificationJob(workerId: string) {
  return withDatabaseTransaction(async (transaction) => {
    const now = new Date();
    const candidate = await transaction
      .selectFrom("notificationJobs")
      .select("id")
      .where("status", "in", ["PENDING", "PROCESSING"])
      .whereRef("attempts", "<", "maxAttempts")
      .where("nextAttemptAt", "<=", now)
      .where((expression) => expression.or([
        expression("leaseExpiresAt", "is", null),
        expression("leaseExpiresAt", "<=", now),
      ]))
      .orderBy("nextAttemptAt", "asc")
      .orderBy("createdAt", "asc")
      .forUpdate()
      .skipLocked()
      .executeTakeFirst();
    if (!candidate) return null;
    return transaction
      .updateTable("notificationJobs")
      .set({
        status: "PROCESSING",
        leaseOwner: workerId,
        leaseExpiresAt: new Date(now.getTime() + NOTIFICATION_LEASE_MILLISECONDS),
        updatedAt: now,
      })
      .where("id", "=", candidate.id)
      .returningAll()
      .executeTakeFirst();
  });
}

async function renewNotificationLease(job: NotificationJobRow, workerId: string) {
  const renewed = await database
    .updateTable("notificationJobs")
    .set({
      leaseExpiresAt: new Date(Date.now() + NOTIFICATION_LEASE_MILLISECONDS),
      updatedAt: new Date(),
    })
    .where("id", "=", job.id)
    .where("status", "=", "PROCESSING")
    .where("leaseOwner", "=", workerId)
    .returning("id")
    .executeTakeFirst();
  if (!renewed) throw new Error("Notification lease is no longer owned by this worker");
}

async function activeOrganizationForNotification(
  job: NotificationJobRow,
  executor: DatabaseExecutor = database
) {
  return executor
    .selectFrom("pages as page")
    .innerJoin("organizations as organization", "organization.id", "page.orgId")
    .select("organization.id")
    .where("page.id", "=", job.pageId)
    .where("page.deletedAt", "is", null)
    .where("organization.status", "=", "ACTIVE")
    .where("organization.suspended", "=", false)
    .executeTakeFirst();
}

async function blockInactiveNotification(job: NotificationJobRow, workerId: string) {
  await database
    .updateTable("notificationJobs")
    .set({
      status: "BLOCKED",
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: "Delivery paused because the organization became inactive",
      updatedAt: new Date(),
    })
    .where("id", "=", job.id)
    .where("leaseOwner", "=", workerId)
    .execute();
}

type NotificationOutcome =
  | { status: "SENT"; attempt: number; responseStatus: number | null; error: null; now: Date }
  | {
      status: "FAILED";
      attempt: number;
      responseStatus: number | null;
      error: string;
      terminal: boolean;
      nextAttemptAt: Date;
      now: Date;
    };

async function commitNotificationOutcome(
  job: NotificationJobRow,
  workerId: string,
  outcome: NotificationOutcome
) {
  return withDatabaseTransaction(async (transaction) => {
    if (!(await activeOrganizationForNotification(job, transaction))) return false;
    const values = outcome.status === "SENT"
      ? {
          status: "SENT" as const,
          attempts: outcome.attempt,
          responseStatus: outcome.responseStatus,
          lastError: null,
          leaseOwner: null,
          leaseExpiresAt: null,
          sentAt: outcome.now,
          updatedAt: outcome.now,
        }
      : {
          status: outcome.terminal ? "DEAD_LETTER" as const : "PENDING" as const,
          attempts: outcome.terminal ? job.maxAttempts : outcome.attempt,
          responseStatus: outcome.responseStatus,
          lastError: outcome.error,
          nextAttemptAt: outcome.nextAttemptAt,
          leaseOwner: null,
          leaseExpiresAt: null,
          updatedAt: outcome.now,
        };
    const updated = await transaction
      .updateTable("notificationJobs")
      .set(values)
      .where("id", "=", job.id)
      .where("status", "=", "PROCESSING")
      .where("leaseOwner", "=", workerId)
      .returning("id")
      .executeTakeFirst();
    if (!updated) return false;
    await transaction.insertInto("notificationLogs").values({
      pageId: job.pageId,
      channel: job.channel,
      contact: job.contact,
      subject: job.subject,
      body: job.body,
      status: outcome.status,
      responseStatus: outcome.responseStatus,
      error: outcome.error,
      attempt: outcome.attempt,
      createdAt: outcome.now,
    }).execute();
    return true;
  });
}

export async function processNotificationJob(job: NotificationJobRow, workerId: string) {
  if (!(await activeOrganizationForNotification(job))) {
    await blockInactiveNotification(job, workerId);
    return;
  }
  const attempt = job.attempts + 1;
  const heartbeat = startLeaseHeartbeat(
    () => renewNotificationLease(job, workerId),
    NOTIFICATION_LEASE_RENEWAL_MILLISECONDS
  );
  let outcome: NotificationOutcome;
  try {
    const responseStatus = await deliver(job);
    outcome = { status: "SENT", responseStatus, error: null, attempt, now: new Date() };
  } catch (error) {
    const deliveryError = error instanceof DeliveryError
      ? error
      : new DeliveryError(error instanceof Error ? error.message : "Delivery failed", true);
    const terminal = !deliveryError.transient || attempt >= job.maxAttempts;
    const backoffMs = Math.min(60 * 60_000, 2 ** Math.min(attempt, 10) * 1_000);
    const jitterMs = Math.floor(Math.random() * Math.max(250, backoffMs * 0.2));
    const now = new Date();
    outcome = {
      status: "FAILED",
      responseStatus: deliveryError.responseStatus,
      error: deliveryError.message.slice(0, 1_000),
      attempt,
      terminal,
      nextAttemptAt: terminal
        ? new Date("9999-12-31T23:59:59.999Z")
        : new Date(now.getTime() + backoffMs + jitterMs),
      now,
    };
  }
  let activeAfterDelivery = false;
  try {
    activeAfterDelivery = Boolean(await activeOrganizationForNotification(job));
    if (activeAfterDelivery) await renewNotificationLease(job, workerId);
  } finally {
    await heartbeat.stop();
  }
  if (!activeAfterDelivery) {
    await blockInactiveNotification(job, workerId);
    return;
  }
  if (!(await commitNotificationOutcome(job, workerId, outcome))) {
    await blockInactiveNotification(job, workerId);
  }
}

export async function drainNotificationJobs(workerId: string, limit = 25) {
  let processed = 0;
  while (processed < limit) {
    const job = await leaseNotificationJob(workerId);
    if (!job) break;
    await processNotificationJob(job, workerId);
    processed += 1;
  }
  return processed;
}
