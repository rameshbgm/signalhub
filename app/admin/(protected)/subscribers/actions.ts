"use server";

import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { requireOrgSession, assertPageInOrg } from "@/lib/admin-guard";

export async function addSubscriber(pageId: string, formData: FormData) {
  const session = await requireOrgSession();
  await assertPageInOrg(pageId, session.orgId);
  const channel = String(formData.get("channel") ?? "EMAIL");
  const contact = String(formData.get("contact") ?? "").trim();
  if (!contact) throw new Error("Contact is required");

  await collections.subscribers().updateOne(
    { pageId: oid(pageId), channel, contact },
    {
      $set: { verified: true, quarantined: false },
      $setOnInsert: {
        _id: new ObjectId(),
        pageId: oid(pageId),
        channel,
        contact,
        componentIds: "[]",
        unsubscribeToken: new ObjectId().toHexString(),
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );
  revalidatePath("/admin/subscribers");
}

export async function importSubscribersCsv(pageId: string, formData: FormData) {
  const session = await requireOrgSession();
  await assertPageInOrg(pageId, session.orgId);
  const csv = String(formData.get("csv") ?? "");
  const channel = String(formData.get("channel") ?? "EMAIL");

  const contacts = csv
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const contact of contacts) {
    await collections
      .subscribers()
      .updateOne(
        { pageId: oid(pageId), channel, contact },
        {
          $set: { verified: true },
          $setOnInsert: {
            _id: new ObjectId(),
            pageId: oid(pageId),
            channel,
            contact,
            componentIds: "[]",
            quarantined: false,
            unsubscribeToken: new ObjectId().toHexString(),
            createdAt: new Date(),
          },
        },
        { upsert: true }
      )
      .catch(() => null);
  }
  revalidatePath("/admin/subscribers");
}

export async function toggleQuarantine(subscriberId: string) {
  const session = await requireOrgSession();
  const subDoc = await collections.subscribers().findOne({ _id: oid(subscriberId) });
  if (!subDoc) return;
  const sub = toId(subDoc);
  await assertPageInOrg(sub.pageId, session.orgId);
  await collections.subscribers().updateOne({ _id: oid(subscriberId) }, { $set: { quarantined: !subDoc.quarantined } });
  revalidatePath("/admin/subscribers");
}

export async function removeSubscriber(subscriberId: string) {
  const session = await requireOrgSession();
  const subDoc = await collections.subscribers().findOne({ _id: oid(subscriberId) });
  if (!subDoc) return;
  const sub = toId(subDoc);
  await assertPageInOrg(sub.pageId, session.orgId);
  await collections.subscribers().deleteOne({ _id: oid(subscriberId) });
  revalidatePath("/admin/subscribers");
}
