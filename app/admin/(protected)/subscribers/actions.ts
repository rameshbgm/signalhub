"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { enqueueJobSweep, JOB_TASKS } from "@/lib/jobs";
import { requireCapability, assertPageInOrg } from "@/lib/admin-guard";
import { canonicalizeEmail } from "@/lib/identity";
import { database, withDatabaseTransaction } from "@/lib/postgres/client";
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

function unsubscribeToken() {
  return randomBytes(32).toString("hex");
}

export async function addSubscriber(pageId: string, formData: FormData) {
  const session = await requireCapability("subscriber.manage", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const channel = String(formData.get("channel") ?? "EMAIL");
  const contact = await validatedContact(channel, String(formData.get("contact") ?? "").trim());
  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    await transaction.insertInto("subscribers").values({
      pageId,
      channel,
      contact,
      componentIds: [],
      eventTypes: [],
      verified: true,
      quarantined: false,
      unsubscribeToken: unsubscribeToken(),
    }).onConflict((conflict) => conflict.columns(["pageId", "channel", "contact"]).doUpdateSet({
      verified: true,
      quarantined: false,
    })).execute();
  });
  revalidatePath("/organization/subscribers");
}

export async function importSubscribersCsv(pageId: string, formData: FormData) {
  const session = await requireCapability("subscriber.manage", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const csv = String(formData.get("csv") ?? "");
  const channel = String(formData.get("channel") ?? "EMAIL");
  if (channel !== "EMAIL") throw new Error("CSV import currently supports email subscribers only");
  const rawContacts = [...new Set(csv.split(/[\n,]/).map((value) => value.trim()).filter(Boolean))];
  const contacts = await Promise.all(rawContacts.map((contact) => validatedContact("EMAIL", contact)));
  if (!contacts.length) return;

  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    await transaction.insertInto("subscribers").values(contacts.map((contact) => ({
      pageId,
      channel,
      contact,
      componentIds: [],
      eventTypes: [],
      verified: true,
      quarantined: false,
      unsubscribeToken: unsubscribeToken(),
    }))).onConflict((conflict) => conflict.columns(["pageId", "channel", "contact"]).doUpdateSet({
      verified: true,
      quarantined: false,
    })).execute();
  });
  revalidatePath("/organization/subscribers");
}

export async function toggleQuarantine(subscriberId: string) {
  const session = await requireCapability("subscriber.manage");
  const subscriber = await database.selectFrom("subscribers").select(["id", "pageId"])
    .where("id", "=", subscriberId).executeTakeFirst();
  if (!subscriber) throw new Error("Subscriber not found");
  await assertPageInOrg(subscriber.pageId, session.orgId);
  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const current = await transaction.selectFrom("subscribers").select(["id", "quarantined"])
      .where("id", "=", subscriberId).where("pageId", "=", subscriber.pageId)
      .forUpdate().executeTakeFirst();
    if (!current) throw new Error("Subscriber not found");
    await transaction.updateTable("subscribers").set({ quarantined: !current.quarantined })
      .where("id", "=", current.id).execute();
  });
  revalidatePath("/organization/subscribers");
}

export async function removeSubscriber(subscriberId: string) {
  const session = await requireCapability("subscriber.manage");
  const subscriber = await database.selectFrom("subscribers").select(["id", "pageId"])
    .where("id", "=", subscriberId).executeTakeFirst();
  if (!subscriber) throw new Error("Subscriber not found");
  await assertPageInOrg(subscriber.pageId, session.orgId);
  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const removed = await transaction.deleteFrom("subscribers")
      .where("id", "=", subscriberId).where("pageId", "=", subscriber.pageId)
      .returning("id").executeTakeFirst();
    if (!removed) throw new Error("Subscriber not found");
  });
  revalidatePath("/organization/subscribers");
}

export async function retryNotificationJob(jobId: string) {
  const session = await requireCapability("subscriber.manage");
  const job = await database.selectFrom("notificationJobs").select(["id", "pageId", "status"])
    .where("id", "=", jobId).executeTakeFirst();
  if (!job) throw new Error("Delivery job not found");
  await assertPageInOrg(job.pageId, session.orgId);
  if (job.status !== "DEAD_LETTER") throw new Error("Only terminal delivery failures can be retried");
  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const now = new Date();
    const changed = await transaction.updateTable("notificationJobs").set({
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: now,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: null,
      updatedAt: now,
    }).where("id", "=", job.id).where("pageId", "=", job.pageId)
      .where("status", "=", "DEAD_LETTER").returning("id").executeTakeFirst();
    if (!changed) throw new Error("Delivery job state changed; reload and retry");
    await enqueueJobSweep(transaction, JOB_TASKS.notifications);
  });
  revalidatePath("/organization/subscribers");
}
