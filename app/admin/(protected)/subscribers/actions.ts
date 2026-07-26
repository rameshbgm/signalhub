"use server";

import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { requireCapability, assertPageInOrg } from "@/lib/admin-guard";
import { canonicalizeEmail } from "@/lib/identity";
import { withTransaction } from "@/lib/cascade";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";

const ADMIN_CHANNELS = ["EMAIL", "SMS"] as const;

async function validatedContact(channel: string, raw: string) {
  if (!ADMIN_CHANNELS.includes(channel as (typeof ADMIN_CHANNELS)[number])) {
    throw new Error("Unsupported subscriber channel");
  }
  if (channel === "EMAIL") {
    const email = canonicalizeEmail(raw);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Invalid email address");
    return email;
  }
  const phone = raw.replace(/[()\s.-]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    throw new Error("Use an international phone number such as +12025550123");
  }
  return phone;
}

export async function addSubscriber(pageId: string, formData: FormData) {
  const session = await requireCapability("subscriber.manage", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const channel = String(formData.get("channel") ?? "EMAIL");
  const contact = await validatedContact(channel, String(formData.get("contact") ?? "").trim());
  if (!contact) throw new Error("Contact is required");

  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
    const page = await collections.pages().findOne(
      { _id: oid(pageId), orgId: oid(session.orgId) },
      { session: databaseSession }
    );
    if (!page) throw new Error("Page not found in your organization");
    await collections.subscribers().updateOne(
      { pageId: page._id, channel, contact },
      {
        $set: { verified: true, quarantined: false },
        $setOnInsert: {
          _id: new ObjectId(),
          pageId: page._id,
          channel,
          contact,
          componentIds: "[]",
          unsubscribeToken: new ObjectId().toHexString(),
          createdAt: new Date(),
        },
      },
      { upsert: true, session: databaseSession }
    );
  });
  revalidatePath("/organization/subscribers");
}

export async function importSubscribersCsv(pageId: string, formData: FormData) {
  const session = await requireCapability("subscriber.manage", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const csv = String(formData.get("csv") ?? "");
  const channel = String(formData.get("channel") ?? "EMAIL");
  if (channel !== "EMAIL") throw new Error("CSV import currently supports email subscribers only");

  const contacts = csv
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const validatedContacts: string[] = [];
  for (const rawContact of contacts) {
    validatedContacts.push(await validatedContact("EMAIL", rawContact));
  }
  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
    const page = await collections.pages().findOne(
      { _id: oid(pageId), orgId: oid(session.orgId) },
      { session: databaseSession }
    );
    if (!page) throw new Error("Page not found in your organization");
    for (const contact of validatedContacts) {
      await collections
        .subscribers()
        .updateOne(
          { pageId: page._id, channel, contact },
          {
            $set: { verified: true },
            $setOnInsert: {
              _id: new ObjectId(),
              pageId: page._id,
              channel,
              contact,
              componentIds: "[]",
              quarantined: false,
              unsubscribeToken: new ObjectId().toHexString(),
              createdAt: new Date(),
            },
          },
          { upsert: true, session: databaseSession }
        );
    }
  });
  revalidatePath("/organization/subscribers");
}

export async function toggleQuarantine(subscriberId: string) {
  const session = await requireCapability("subscriber.manage");
  const subDoc = await collections.subscribers().findOne({ _id: oid(subscriberId) });
  if (!subDoc) throw new Error("Subscriber not found");
  const sub = toId(subDoc);
  await assertPageInOrg(sub.pageId, session.orgId);
  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
    const page = await collections.pages().findOne(
      { _id: subDoc.pageId, orgId: oid(session.orgId) },
      { session: databaseSession }
    );
    if (!page) throw new Error("Page not found in your organization");
    const currentSubscriber = await collections.subscribers().findOne(
      { _id: oid(subscriberId), pageId: page._id },
      { session: databaseSession }
    );
    if (!currentSubscriber) throw new Error("Subscriber not found");
    const changed = await collections.subscribers().updateOne(
      { _id: currentSubscriber._id, pageId: page._id },
      { $set: { quarantined: !currentSubscriber.quarantined } },
      { session: databaseSession }
    );
    if (!changed.matchedCount) throw new Error("Subscriber state changed; reload and retry");
  });
  revalidatePath("/organization/subscribers");
}

export async function removeSubscriber(subscriberId: string) {
  const session = await requireCapability("subscriber.manage");
  const subDoc = await collections.subscribers().findOne({ _id: oid(subscriberId) });
  if (!subDoc) throw new Error("Subscriber not found");
  const sub = toId(subDoc);
  await assertPageInOrg(sub.pageId, session.orgId);
  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
    const page = await collections.pages().findOne(
      { _id: subDoc.pageId, orgId: oid(session.orgId) },
      { session: databaseSession }
    );
    if (!page) throw new Error("Page not found in your organization");
    const removed = await collections.subscribers().deleteOne(
      { _id: oid(subscriberId), pageId: page._id },
      { session: databaseSession }
    );
    if (!removed.deletedCount) throw new Error("Subscriber not found");
  });
  revalidatePath("/organization/subscribers");
}

export async function retryNotificationJob(jobId: string) {
  const session = await requireCapability("subscriber.manage");
  const job = await collections.notificationJobs().findOne({ _id: oid(jobId) });
  if (!job) throw new Error("Delivery job not found");
  await assertPageInOrg(job.pageId.toHexString(), session.orgId);
  if (job.status !== "DEAD_LETTER") {
    throw new Error("Only terminal delivery failures can be retried");
  }
  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
    const page = await collections.pages().findOne(
      { _id: job.pageId, orgId: oid(session.orgId) },
      { session: databaseSession }
    );
    if (!page) throw new Error("Page not found in your organization");
    const currentJob = await collections.notificationJobs().findOne(
      { _id: job._id, pageId: page._id },
      { session: databaseSession }
    );
    if (!currentJob) throw new Error("Delivery job not found");
    if (currentJob.status !== "DEAD_LETTER") {
      throw new Error("Only terminal delivery failures can be retried");
    }
    const changed = await collections.notificationJobs().updateOne(
      { _id: currentJob._id, pageId: page._id, status: "DEAD_LETTER" },
      {
        $set: {
          status: "PENDING",
          attempts: 0,
          nextAttemptAt: new Date(),
          leaseOwner: null,
          leaseExpiresAt: null,
          lastError: null,
          updatedAt: new Date(),
        },
      },
      { session: databaseSession }
    );
    if (!changed.matchedCount) throw new Error("Delivery job state changed; reload and retry");
  });
  revalidatePath("/organization/subscribers");
}
