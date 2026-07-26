import { createHmac } from "node:crypto";
import { ObjectId, type ClientSession, type WithId } from "mongodb";
import {
  collections,
  mongoClient,
  type NotificationJobDoc,
} from "@/lib/db";
import { decryptSecret } from "@/lib/encryption";
import { smtpTransport, verifySmtp } from "@/lib/smtp";
import { deliverDestination, deliverSms } from "@/lib/notification-providers";
import { organizationIsActive } from "@/lib/organization-state";
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

async function postJson(
  url: string,
  body: string,
  headers: Record<string, string> = {}
) {
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

async function deliver(job: WithId<NotificationJobDoc>) {
  if (job.channel === "EMAIL") {
    let result;
    try {
      const page = await collections.pages().findOne({ _id: job.pageId });
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
  if (job.channel === "SMS") {
    return deliverSms(job.contact, job.body);
  }
  if (job.destinationId) {
    const destination = await collections.notificationDestinations().findOne({
      _id: job.destinationId,
      active: true,
      verifiedAt: { $ne: null },
    });
    if (!destination) throw new DeliveryError("Notification destination is no longer active", false);
    try {
      return await deliverDestination(destination, {
        subject: job.subject,
        body: job.body,
        eventType: job.eventType,
      });
    } catch (error) {
      throw new DeliveryError(
        error instanceof Error ? error.message : "Destination delivery failed",
        true
      );
    }
  }

  if (job.channel === "SLACK") {
    return postJson(
      job.contact,
      JSON.stringify({ text: `*${job.subject}*\n${job.body}` })
    );
  }
  if (job.channel === "MICROSOFT_TEAMS") {
    return postJson(
      job.contact,
      JSON.stringify({
        type: "message",
        attachments: [
          {
            contentType: "application/vnd.microsoft.card.adaptive",
            content: {
              type: "AdaptiveCard",
              version: "1.4",
              body: [
                { type: "TextBlock", weight: "Bolder", text: job.subject },
                { type: "TextBlock", wrap: true, text: job.body },
              ],
            },
          },
        ],
      })
    );
  }
  if (job.channel === "WEBHOOK" && job.endpointId) {
    const endpoint = await collections.webhookEndpoints().findOne({
      _id: job.endpointId,
      active: true,
      verifiedAt: { $ne: null },
    });
    if (!endpoint) throw new DeliveryError("Webhook endpoint is no longer active", false);
    const body = JSON.stringify({ id: job._id.toHexString(), ...job.payload });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac("sha256", decryptSecret(endpoint.secretCiphertext))
      .update(`${timestamp}.${body}`)
      .digest("hex");
    return postJson(endpoint.url, body, {
      "x-status-event": job.eventType,
      "x-status-timestamp": timestamp,
      "x-status-signature": `sha256=${signature}`,
      "x-status-delivery": job._id.toHexString(),
    });
  }
  throw new DeliveryError(`Unsupported notification channel ${job.channel}`, false);
}

async function leaseNotificationJob(workerId: string) {
  const now = new Date();
  return collections.notificationJobs().findOneAndUpdate(
    {
      status: { $in: ["PENDING", "PROCESSING"] },
      $expr: { $lt: ["$attempts", "$maxAttempts"] },
      nextAttemptAt: { $lte: now },
      $or: [{ leaseExpiresAt: null }, { leaseExpiresAt: { $lte: now } }],
    },
    {
      $set: {
        status: "PROCESSING",
        leaseOwner: workerId,
        leaseExpiresAt: new Date(
          now.getTime() + NOTIFICATION_LEASE_MILLISECONDS
        ),
        updatedAt: now,
      },
    },
    { sort: { nextAttemptAt: 1, createdAt: 1 }, returnDocument: "after" }
  );
}

async function renewNotificationLease(
  job: WithId<NotificationJobDoc>,
  workerId: string
) {
  const renewed = await collections.notificationJobs().updateOne(
    { _id: job._id, status: "PROCESSING", leaseOwner: workerId },
    {
      $set: {
        leaseExpiresAt: new Date(
          Date.now() + NOTIFICATION_LEASE_MILLISECONDS
        ),
        updatedAt: new Date(),
      },
    }
  );
  if (renewed.matchedCount !== 1) {
    throw new Error("Notification lease is no longer owned by this worker");
  }
}

async function activeOrganizationForNotification(
  job: WithId<NotificationJobDoc>,
  session?: ClientSession
) {
  const options = session ? { session } : undefined;
  const page = await collections.pages().findOne(
    { _id: job.pageId },
    options
  );
  const organization = page
    ? await collections.organizations().findOne({ _id: page.orgId }, options)
    : null;
  return page && organization && organizationIsActive(organization)
    ? organization
    : null;
}

async function blockInactiveNotification(
  job: WithId<NotificationJobDoc>,
  workerId: string
) {
  await collections.notificationJobs().updateOne(
    { _id: job._id, leaseOwner: workerId },
    {
      $set: {
        status: "BLOCKED",
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError:
          "Delivery paused because the organization became inactive",
        updatedAt: new Date(),
      },
    }
  );
}

type NotificationOutcome =
  | {
      status: "SENT";
      attempt: number;
      responseStatus: number | null;
      error: null;
      now: Date;
    }
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
  job: WithId<NotificationJobDoc>,
  workerId: string,
  outcome: NotificationOutcome
) {
  const session = mongoClient.startSession();
  try {
    let committed = false;
    const logId = new ObjectId();
    await session.withTransaction(async () => {
      if (!(await activeOrganizationForNotification(job, session))) return;
      const update =
        outcome.status === "SENT"
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
              status: outcome.terminal ? ("DEAD_LETTER" as const) : ("PENDING" as const),
              attempts: outcome.terminal ? job.maxAttempts : outcome.attempt,
              responseStatus: outcome.responseStatus,
              lastError: outcome.error,
              nextAttemptAt: outcome.nextAttemptAt,
              leaseOwner: null,
              leaseExpiresAt: null,
              updatedAt: outcome.now,
            };
      const updated = await collections.notificationJobs().updateOne(
        { _id: job._id, status: "PROCESSING", leaseOwner: workerId },
        { $set: update },
        { session }
      );
      if (updated.matchedCount !== 1) return;
      await collections.notificationLogs().insertOne(
        {
          _id: logId,
          pageId: job.pageId.toHexString(),
          channel: job.channel,
          contact: job.contact,
          subject: job.subject,
          body: job.body,
          status: outcome.status,
          responseStatus: outcome.responseStatus,
          error: outcome.error,
          attempt: outcome.attempt,
          createdAt: outcome.now,
        },
        { session }
      );
      committed = true;
    });
    return committed;
  } finally {
    await session.endSession();
  }
}

export async function processNotificationJob(
  job: WithId<NotificationJobDoc>,
  workerId: string
) {
  if (!(await activeOrganizationForNotification(job))) {
    await collections.notificationJobs().updateOne(
      { _id: job._id, leaseOwner: workerId },
      {
        $set: {
          status: "BLOCKED",
          leaseOwner: null,
          leaseExpiresAt: null,
          lastError:
            "Delivery blocked because the page or organization is inactive",
          updatedAt: new Date(),
        },
      }
    );
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
    const now = new Date();
    outcome = {
      status: "SENT",
      responseStatus,
      error: null,
      attempt,
      now,
    };
  } catch (error) {
    const deliveryError =
      error instanceof DeliveryError
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

  // External SMTP/webhook/SMS work can outlive a lifecycle transition. Do not
  // persist its outcome unless the tenant is still ACTIVE after the network
  // call and this worker can extend the same lease through the final write.
  let activeAfterDelivery = false;
  try {
    activeAfterDelivery = Boolean(
      await activeOrganizationForNotification(job)
    );
    if (activeAfterDelivery) {
      await renewNotificationLease(job, workerId);
    }
  } finally {
    await heartbeat.stop();
  }
  if (!activeAfterDelivery) {
    await blockInactiveNotification(job, workerId);
    return;
  }
  const committed = await commitNotificationOutcome(job, workerId, outcome);
  if (!committed) await blockInactiveNotification(job, workerId);
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
