import { createHmac } from "node:crypto";
import { database, withDatabaseTransaction, type DatabaseExecutor } from "@/lib/postgres/client";
import type { NotificationJobRow } from "@/lib/postgres/schema";
import { decryptSecret } from "@/lib/encryption";
import { BlockedAddressError, guardedFetch } from "@/lib/guarded-fetch";
import { smtpTransport, verifySmtp } from "@/lib/smtp";
import { deliverDestination, deliverSms, ProviderHttpError } from "@/lib/notification-providers";
import { MANAGE_LINK_LABEL, UNSUBSCRIBE_LINK_LABEL } from "@/lib/notify";
import { startLeaseHeartbeat } from "@/worker/lease-heartbeat";

const NOTIFICATION_LEASE_MILLISECONDS = 30_000;
const NOTIFICATION_LEASE_RENEWAL_MILLISECONDS = 10_000;

class DeliveryError extends Error {
  constructor(
    message: string,
    public readonly transient: boolean,
    public readonly responseStatus: number | null = null,
    /** The recipient address itself was refused; stop mailing that subscriber. */
    public readonly recipientRejected = false
  ) {
    super(message);
  }
}

export { verifySmtp };

/**
 * SMTP 5xx replies are permanent, so retrying cannot succeed; 4xx replies and
 * connection errors are transient and retried with backoff. A permanent reply
 * about the recipient is a hard bounce.
 */
export function smtpDeliveryError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const responseCode = (error as { responseCode?: unknown } | null)?.responseCode;
  const permanent = typeof responseCode === "number" && responseCode >= 500;
  const recipientRejected = permanent && /\b(recipient|mailbox|address|user|domain)\b/i.test(message);
  return new DeliveryError(
    message ? `SMTP delivery failed: ${message}` : "SMTP delivery failed",
    !permanent,
    permanent ? responseCode : null,
    recipientRejected
  );
}

function isTransientStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

/** Retries only failures that can succeed later; a 4xx or blocked address is final. */
function providerDeliveryError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (error instanceof ProviderHttpError) {
    return new DeliveryError(message, isTransientStatus(error.status), error.status);
  }
  if (error instanceof BlockedAddressError) return new DeliveryError(message, false);
  return new DeliveryError(message, true);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character]!));
}

/**
 * Keeps the configured SMTP mailbox (deliverability, SPF/DKIM) and only
 * replaces the display name with the page's sender name when one is set.
 */
export function senderAddress(displayName: string | null, configured: string) {
  if (!displayName) return configured;
  const address = /<([^>]+)>/.exec(configured)?.[1] ?? configured.trim();
  return { name: displayName, address };
}

function notificationHtml(input: {
  pageName: string;
  logoUrl: string | null;
  brandColor: string;
  subject: string;
  body: string;
  links?: { manage: string | null; unsubscribe: string | null };
}) {
  const paragraphs = input.body
    .split(/\n{2,}/)
    .map((part) => `<p style="margin:0 0 16px;color:#344054;line-height:1.6">${escapeHtml(part).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const linkStyle = `color:${escapeHtml(input.brandColor)};text-decoration:underline`;
  const footerLinks = [
    input.links?.manage ? `<a href="${escapeHtml(input.links.manage)}" style="${linkStyle}">Manage preferences</a>` : null,
    input.links?.unsubscribe ? `<a href="${escapeHtml(input.links.unsubscribe)}" style="${linkStyle}">Unsubscribe</a>` : null,
  ].filter(Boolean).join(" &nbsp;·&nbsp; ");
  const footer = footerLinks
    ? `<div style="padding:14px 24px;border-top:1px solid #eaecf0;font-size:12px;line-height:1.6;color:#667085">You receive these updates because you subscribed to ${escapeHtml(input.pageName)}.<br>${footerLinks}</div>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f3f6f9;font-family:Arial,sans-serif;color:#101828">
<div style="max-width:600px;margin:32px auto;background:#fff;border:1px solid #dfe5ec">
<div style="padding:20px 24px;border-top:4px solid ${escapeHtml(input.brandColor)}">
${input.logoUrl ? `<img src="${escapeHtml(input.logoUrl)}" alt="${escapeHtml(input.pageName)}" style="display:block;max-width:180px;max-height:48px;margin-bottom:16px">` : ""}
<div style="font-size:13px;color:#667085;margin-bottom:8px">${escapeHtml(input.pageName)}</div>
<h1 style="font-size:22px;line-height:1.35;margin:0 0 18px">${escapeHtml(input.subject)}</h1>${paragraphs}
</div>${footer}</div></body></html>`;
}

/**
 * Splits the subscription footer that lib/notify.ts appends from the message
 * body, so the HTML can render it as links and the headers can carry the
 * one-click unsubscribe URL.
 */
export function subscriptionFooter(body: string) {
  const manage = new RegExp(`^${MANAGE_LINK_LABEL} (\\S+)$`, "m").exec(body)?.[1] ?? null;
  const unsubscribe = new RegExp(`^${UNSUBSCRIBE_LINK_LABEL} (\\S+)$`, "m").exec(body)?.[1] ?? null;
  const content = body
    .split("\n")
    .filter((line) => !line.startsWith(`${MANAGE_LINK_LABEL} `) && !line.startsWith(`${UNSUBSCRIBE_LINK_LABEL} `))
    .join("\n")
    .trimEnd();
  return { content, manage, unsubscribe };
}

async function postJson(url: string, body: string, headers: Record<string, string> = {}) {
  const response = await guardedFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
    signal: AbortSignal.timeout(Number(process.env.WEBHOOK_TIMEOUT_MS ?? 10_000)),
  }).catch((error) => {
    if (error instanceof BlockedAddressError) throw new DeliveryError(error.message, false);
    throw new DeliveryError(
      error instanceof Error ? `Webhook network error: ${error.message}` : "Webhook network error",
      true
    );
  });
  if (!response.ok) {
    throw new DeliveryError(`Webhook returned HTTP ${response.status}`, isTransientStatus(response.status), response.status);
  }
  return response.status;
}

async function deliver(job: NotificationJobRow) {
  if (job.channel === "EMAIL") {
    let result;
    try {
      const page = await database
        .selectFrom("pages")
        .select(["name", "logoUrl", "brandColor", "emailFromName", "emailReplyTo", "emailFooter"])
        .where("id", "=", job.pageId)
        .executeTakeFirst();
      const footer = subscriptionFooter(job.body);
      const withPageFooter = (text: string) => (page?.emailFooter ? `${text}\n\n${page.emailFooter}` : text);
      const smtp = await smtpTransport();
      result = await smtp.transporter.sendMail({
        from: senderAddress(page?.emailFromName ?? null, smtp.from),
        ...(page?.emailReplyTo ? { replyTo: page.emailReplyTo } : {}),
        to: job.contact,
        subject: job.subject,
        // Plain text keeps the links verbatim; HTML renders them as a footer.
        text: withPageFooter(job.body),
        html: notificationHtml({
          pageName: page?.name ?? "SignalHub",
          logoUrl: page?.logoUrl ?? null,
          brandColor: page?.brandColor ?? "#0f9fab",
          subject: job.subject,
          body: withPageFooter(footer.content),
          links: { manage: footer.manage, unsubscribe: footer.unsubscribe },
        }),
        // RFC 2369 + RFC 8058: mail clients show their own one-click
        // Unsubscribe button, which POSTs to the unsubscribe URL.
        ...(footer.unsubscribe ? {
          list: { unsubscribe: footer.unsubscribe },
          headers: { "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        } : {}),
      });
    } catch (error) {
      throw smtpDeliveryError(error);
    }
    if (!result.accepted?.length) throw new DeliveryError("SMTP server did not accept the recipient", false, null, true);
    return null;
  }
  if (job.channel === "SMS") {
    try {
      return await deliverSms(job.contact, job.body);
    } catch (error) {
      throw providerDeliveryError(error, "SMS delivery failed");
    }
  }
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
      throw providerDeliveryError(error, "Destination delivery failed");
    }
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
      recipientRejected: boolean;
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
    // Hard bounce: quarantine the subscriber so later events skip the address.
    // Operators can review and release it from the subscribers screen.
    if (outcome.status === "FAILED" && outcome.recipientRejected && job.subscriberId) {
      await transaction.updateTable("subscribers").set({ quarantined: true })
        .where("id", "=", job.subscriberId).where("pageId", "=", job.pageId).execute();
    }
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
      recipientRejected: deliveryError.recipientRejected,
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
