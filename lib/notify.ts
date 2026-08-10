import { createHash, randomInt } from "node:crypto";
import type { Insertable } from "kysely";
import { database, type DatabaseExecutor } from "@/lib/postgres/client";
import type { NotificationJobTable, PageRow } from "@/lib/postgres/schema";
import { canNotifyHubSubscribersFromChild } from "@/lib/public-surface-policy";
import { enqueueJobSweep, JOB_TASKS } from "@/lib/jobs";

function postgresExecutor(candidate?: DatabaseExecutor | object): DatabaseExecutor {
  return candidate && "selectFrom" in candidate
    ? candidate as DatabaseExecutor
    : database;
}

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
    .update([
      event.eventId ?? event.eventType,
      event.pageId,
      target,
      event.subject,
      event.body,
    ].join("\0"))
    .digest("hex");
}

type SourcePageLabel = Pick<PageRow, "id" | "name" | "slug">;

function notificationPayload(event: NotifyEvent, sourcePage?: SourcePageLabel) {
  return {
    type: event.eventType,
    subject: event.subject,
    body: event.body,
    componentIds: event.componentIds ?? [],
    ...(sourcePage
      ? { sourcePage: { id: sourcePage.id, name: sourcePage.name, slug: sourcePage.slug } }
      : {}),
  };
}

async function buildNotificationJobs(
  event: NotifyEvent,
  executor: DatabaseExecutor,
  sourcePage?: SourcePageLabel
): Promise<Array<Insertable<NotificationJobTable>>> {
  const subscribers = await executor
    .selectFrom("subscribers")
    .selectAll()
    .where("pageId", "=", event.pageId)
    .where("verified", "=", true)
    .where("quarantined", "=", false)
    .execute();
  const targeted = subscribers.filter((subscriber) => {
    if (subscriber.eventTypes.length && !subscriber.eventTypes.includes(event.eventType)) return false;
    if (!event.componentIds?.length) return true;
    return subscriber.componentIds.length === 0 || subscriber.componentIds.some(
      (id) => event.componentIds!.includes(id)
    );
  });
  const endpoints = await executor
    .selectFrom("webhookEndpoints")
    .selectAll()
    .where("pageId", "=", event.pageId)
    .where("active", "=", true)
    .where("verifiedAt", "is not", null)
    .execute();
  const destinations = await executor
    .selectFrom("notificationDestinations")
    .selectAll()
    .where("pageId", "=", event.pageId)
    .where("active", "=", true)
    .where("verifiedAt", "is not", null)
    .execute();
  const now = new Date();
  const common = {
    eventType: event.eventType,
    payload: notificationPayload(event, sourcePage),
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
  };

  return [
    ...targeted
      .filter((subscriber) => ["EMAIL", "SMS"].includes(subscriber.channel))
      .map((subscriber) => ({
        ...common,
        pageId: event.pageId,
        subscriberId: subscriber.id,
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
        deduplicationKey: deduplicationKey(event, `subscriber:${subscriber.id}`),
      })),
    ...endpoints.map((endpoint) => ({
      ...common,
      pageId: event.pageId,
      subscriberId: null,
      endpointId: endpoint.id,
      destinationId: null,
      channel: "WEBHOOK",
      contact: endpoint.url,
      subject: event.subject,
      body: event.body,
      deduplicationKey: deduplicationKey(event, `endpoint:${endpoint.id}`),
    })),
    ...destinations
      .filter((destination) => {
        if (destination.eventTypes.length && !destination.eventTypes.includes(event.eventType)) return false;
        if (!event.componentIds?.length || !destination.componentIds?.length) return true;
        return destination.componentIds.some((id) => event.componentIds!.includes(id));
      })
      .map((destination) => ({
        ...common,
        pageId: event.pageId,
        subscriberId: null,
        endpointId: null,
        destinationId: destination.id,
        channel: destination.channel,
        contact: destination.name,
        subject: event.subject,
        body: event.body,
        deduplicationKey: deduplicationKey(event, `destination:${destination.id}`),
      })),
  ];
}

export async function dispatchNotifications(
  event: NotifyEvent,
  candidateExecutor?: DatabaseExecutor | object
) {
  const executor = postgresExecutor(candidateExecutor);
  const sourcePage = await executor
    .selectFrom("pages")
    .selectAll()
    .where("id", "=", event.pageId)
    .executeTakeFirst();
  const targets: Array<{ event: NotifyEvent; sourcePage?: SourcePageLabel }> = [{ event }];

  if (sourcePage?.hubParentId && canNotifyHubSubscribersFromChild(sourcePage)) {
    const hub = await executor
      .selectFrom("pages")
      .select("id")
      .where("id", "=", sourcePage.hubParentId)
      .where("orgId", "=", sourcePage.orgId)
      .where("isHub", "=", true)
      .executeTakeFirst();
    if (hub) {
      targets.push({
        event: {
          ...event,
          pageId: hub.id,
          subject: `[${sourcePage.name}] ${event.subject}`,
          body: `Product: ${sourcePage.name}\n\n${event.body}`,
          componentIds: undefined,
        },
        sourcePage,
      });
    }
  }

  const jobs: Array<Insertable<NotificationJobTable>> = [];
  for (const target of targets) {
    jobs.push(...await buildNotificationJobs(target.event, executor, target.sourcePage));
  }
  if (jobs.length) {
    await executor
      .insertInto("notificationJobs")
      .values(jobs)
      .onConflict((conflict) => conflict.column("deduplicationKey").doNothing())
      .execute();
    await enqueueJobSweep(executor, JOB_TASKS.notifications);
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
  candidateExecutor?: DatabaseExecutor | object
) {
  const executor = postgresExecutor(candidateExecutor);
  const event: NotifyEvent = {
    pageId: input.pageId,
    subject: input.subject,
    body: input.body,
    eventType: input.eventType,
    eventId: input.eventId,
  };
  const now = new Date();
  const key = deduplicationKey(event, `${input.channel.toLowerCase()}:${input.contact}`);
  await executor
    .insertInto("notificationJobs")
    .values({
      pageId: input.pageId,
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
    })
    .onConflict((conflict) => conflict.column("deduplicationKey").doNothing())
    .execute();
  await enqueueJobSweep(executor, JOB_TASKS.notifications);
}

export function generateOtpCode() {
  return randomInt(100000, 1000000).toString();
}
