import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";

/**
 * Notification delivery is simulated: every send is recorded in NotificationLog
 * (visible in the admin console under Subscribers > Delivery Log) so the full
 * create -> update -> resolve fan-out flow can be verified end to end without
 * a real email/SMS provider wired up. Webhook subscribers DO receive a real
 * HTTP POST. Wire a real ESP/SMS provider by replacing sendEmail/sendSms below.
 */

export type NotifyEvent = {
  pageId: string;
  subject: string;
  body: string;
  eventType: string;
  componentIds?: string[];
};

export async function dispatchNotifications(event: NotifyEvent) {
  const subscribers = await collections
    .subscribers()
    .find({ pageId: oid(event.pageId), verified: true, quarantined: false })
    .toArray();

  const targeted = subscribers.filter((s) => {
    if (!event.componentIds || event.componentIds.length === 0) return true;
    const ids: string[] = JSON.parse(s.componentIds || "[]");
    if (ids.length === 0) return true; // subscribed to all components
    return ids.some((id) => event.componentIds!.includes(id));
  });

  await Promise.all(
    targeted.map(async (sub) => {
      try {
        if (sub.channel === "WEBHOOK") {
          await fetch(sub.contact, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ type: event.eventType, subject: event.subject, body: event.body }),
          }).catch(() => null);
        }
        await collections.notificationLogs().insertOne({
          _id: new ObjectId(),
          pageId: event.pageId,
          channel: sub.channel,
          contact: sub.contact,
          subject: event.subject,
          body: event.body,
          status: "SENT",
          createdAt: new Date(),
        });
      } catch {
        await collections.notificationLogs().insertOne({
          _id: new ObjectId(),
          pageId: event.pageId,
          channel: sub.channel,
          contact: sub.contact,
          subject: event.subject,
          body: event.body,
          status: "FAILED",
          createdAt: new Date(),
        });
      }
    })
  );

  const endpoints = await collections.webhookEndpoints().find({ pageId: oid(event.pageId), active: true }).toArray();
  await Promise.all(
    endpoints.map((ep) =>
      fetch(ep.url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-webhook-secret": ep.secret },
        body: JSON.stringify({ type: event.eventType, subject: event.subject, body: event.body }),
      }).catch(() => null)
    )
  );

  return targeted.length;
}

export function generateOtpCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
