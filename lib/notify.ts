import { createHash, randomInt } from "node:crypto";
import { ObjectId, type ClientSession } from "mongodb";
import { collections, type PageDoc } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";
import { canNotifyHubSubscribersFromChild } from "@/lib/public-surface-policy";

export type NotifyEvent = {
  pageId: string;
  subject: string;
  body: string;
  eventType: string;
  componentIds?: string[];
  eventId?: string;
};

function deduplicationKey(event: NotifyEvent, target: string) {
  return createHash("sha256")
    .update(
      [
        event.eventId ?? event.eventType,
        event.pageId,
        target,
        event.subject,
        event.body,
      ].join("\0")
    )
    .digest("hex");
}

function subscriberComponentIds(value: string) {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

type SourcePageLabel = Pick<PageDoc, "_id" | "name" | "slug">;

function notificationPayload(event: NotifyEvent, sourcePage?: SourcePageLabel) {
  return {
    type: event.eventType,
    subject: event.subject,
    body: event.body,
    componentIds: event.componentIds ?? [],
    ...(sourcePage
      ? {
          sourcePage: {
            id: sourcePage._id.toHexString(),
            name: sourcePage.name,
            slug: sourcePage.slug,
          },
        }
      : {}),
  };
}

async function buildNotificationJobs(
  event: NotifyEvent,
  session?: ClientSession,
  sourcePage?: SourcePageLabel
) {
  const pageId = oid(event.pageId);
  const subscribers = await collections
    .subscribers()
    .find({ pageId, verified: true, quarantined: false }, { session })
    .toArray();
  const targeted = subscribers.filter((subscriber) => {
    if (subscriber.eventTypes?.length && !subscriber.eventTypes.includes(event.eventType)) {
      return false;
    }
    if (!event.componentIds?.length) return true;
    const ids = subscriberComponentIds(subscriber.componentIds);
    return ids.length === 0 || ids.some((id) => event.componentIds!.includes(id));
  });
  const endpoints = await collections
    .webhookEndpoints()
    .find({ pageId, active: true, verifiedAt: { $ne: null } }, { session })
    .toArray();
  const destinations = await collections
    .notificationDestinations()
    .find({ pageId, active: true, verifiedAt: { $ne: null } }, { session })
    .toArray();
  const now = new Date();

  const jobs = [
    ...targeted
      // End-user subscribers are email/SMS only. Webhooks and chat
      // integrations are represented by their canonical endpoint/destination
      // records below; including legacy subscriber rows would double-deliver.
      .filter((subscriber) => ["EMAIL", "SMS"].includes(subscriber.channel))
      .map((subscriber) => ({
        _id: new ObjectId(),
        pageId,
        subscriberId: subscriber._id,
        endpointId: null,
        destinationId: null,
        channel: subscriber.channel,
        contact: subscriber.contact,
        subject: event.subject,
        body: [
          event.body,
          process.env.NEXT_PUBLIC_APP_URL
            ? `Manage or unsubscribe: ${process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/api/v1/subscribe/unsubscribe/${subscriber.unsubscribeToken}`
            : null,
        ].filter(Boolean).join("\n\n"),
        eventType: event.eventType,
        payload: notificationPayload(event, sourcePage),
        deduplicationKey: deduplicationKey(event, `subscriber:${subscriber._id.toHexString()}`),
        status: "PENDING" as const,
        attempts: 0,
        maxAttempts: 8,
        nextAttemptAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
        responseStatus: null,
        lastError: null,
        createdAt: now,
        updatedAt: now,
        sentAt: null,
      })),
    ...endpoints.map((endpoint) => ({
      _id: new ObjectId(),
      pageId,
      subscriberId: null,
      endpointId: endpoint._id,
      destinationId: null,
      channel: "WEBHOOK",
      contact: endpoint.url,
      subject: event.subject,
      body: event.body,
      eventType: event.eventType,
      payload: notificationPayload(event, sourcePage),
      deduplicationKey: deduplicationKey(event, `endpoint:${endpoint._id.toHexString()}`),
      status: "PENDING" as const,
      attempts: 0,
      maxAttempts: 8,
      nextAttemptAt: now,
      leaseOwner: null,
      leaseExpiresAt: null,
      responseStatus: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
      sentAt: null,
    })),
    ...destinations
      .filter((destination) => {
        if (destination.eventTypes.length && !destination.eventTypes.includes(event.eventType)) return false;
        if (!event.componentIds?.length || !destination.componentIds?.length) return true;
        return destination.componentIds.some((id) => event.componentIds!.includes(id.toHexString()));
      })
      .map((destination) => ({
        _id: new ObjectId(),
        pageId,
        subscriberId: null,
        endpointId: null,
        destinationId: destination._id,
        channel: destination.channel,
        contact: destination.name,
        subject: event.subject,
        body: event.body,
        eventType: event.eventType,
        payload: notificationPayload(event, sourcePage),
        deduplicationKey: deduplicationKey(event, `destination:${destination._id.toHexString()}`),
        status: "PENDING" as const,
        attempts: 0,
        maxAttempts: 8,
        nextAttemptAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
        responseStatus: null,
        lastError: null,
        createdAt: now,
        updatedAt: now,
        sentAt: null,
      })),
  ];

  return jobs;
}

export async function dispatchNotifications(event: NotifyEvent, session?: ClientSession) {
  const sourcePageId = oid(event.pageId);
  const sourcePage = await collections.pages().findOne({ _id: sourcePageId }, { session });
  const targets: {
    event: NotifyEvent;
    sourcePage?: SourcePageLabel;
  }[] = [{ event }];

  if (
    sourcePage?.hubParentId &&
    canNotifyHubSubscribersFromChild(sourcePage)
  ) {
    const hub = await collections.pages().findOne(
      {
        _id: sourcePage.hubParentId,
        orgId: sourcePage.orgId,
        isHub: true,
      },
      { session }
    );
    if (hub) {
      targets.push({
        event: {
          ...event,
          pageId: hub._id.toHexString(),
          subject: `[${sourcePage.name}] ${event.subject}`,
          body: `Product: ${sourcePage.name}\n\n${event.body}`,
          componentIds: undefined,
        },
        sourcePage,
      });
    }
  }

  const jobs = [];
  // Domain callers may pass a transaction session. MongoDB does not support
  // parallel operations within one transaction, so build each target in order.
  for (const target of targets) {
    jobs.push(
      ...(await buildNotificationJobs(
        target.event,
        session,
        target.sourcePage
      ))
    );
  }
  if (jobs.length) {
    await collections
      .notificationJobs()
      .bulkWrite(
        jobs.map((job) => ({
          updateOne: {
            filter: { deduplicationKey: job.deduplicationKey },
            update: { $setOnInsert: job },
            upsert: true,
          },
        })),
        { ordered: false, session }
      );
  }
  return jobs.length;
}

export async function enqueueDirectNotification(
  input: {
    pageId: string;
    contact: string;
    subject: string;
    body: string;
    eventType: string;
    eventId: string;
    channel: "EMAIL" | "SMS";
  },
  session?: ClientSession
) {
  const event: NotifyEvent = {
    pageId: input.pageId,
    subject: input.subject,
    body: input.body,
    eventType: input.eventType,
    eventId: input.eventId,
  };
  const now = new Date();
  const key = deduplicationKey(event, `${input.channel.toLowerCase()}:${input.contact}`);
  await collections.notificationJobs().updateOne(
    { deduplicationKey: key },
    {
      $setOnInsert: {
        _id: new ObjectId(),
        pageId: oid(input.pageId),
        subscriberId: null,
        endpointId: null,
        destinationId: null,
        channel: input.channel,
        contact: input.contact,
        subject: input.subject,
        body: input.body,
        eventType: input.eventType,
        payload: { type: input.eventType, subject: input.subject, body: input.body },
        deduplicationKey: key,
        status: "PENDING",
        attempts: 0,
        maxAttempts: 8,
        nextAttemptAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
        responseStatus: null,
        lastError: null,
        createdAt: now,
        updatedAt: now,
        sentAt: null,
      },
    },
    { upsert: true, session }
  );
}

export function generateOtpCode() {
  return randomInt(100000, 1000000).toString();
}
