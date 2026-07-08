"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireOrgSession, assertPageInOrg } from "@/lib/admin-guard";

export async function addSubscriber(pageId: string, formData: FormData) {
  const session = await requireOrgSession();
  await assertPageInOrg(pageId, session.orgId);
  const channel = String(formData.get("channel") ?? "EMAIL");
  const contact = String(formData.get("contact") ?? "").trim();
  if (!contact) throw new Error("Contact is required");

  await prisma.subscriber.upsert({
    where: { pageId_channel_contact: { pageId, channel, contact } },
    update: { verified: true, quarantined: false },
    create: { pageId, channel, contact, verified: true },
  });
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
    await prisma.subscriber
      .upsert({
        where: { pageId_channel_contact: { pageId, channel, contact } },
        update: { verified: true },
        create: { pageId, channel, contact, verified: true },
      })
      .catch(() => null);
  }
  revalidatePath("/admin/subscribers");
}

export async function toggleQuarantine(subscriberId: string) {
  const session = await requireOrgSession();
  const sub = await prisma.subscriber.findUnique({ where: { id: subscriberId } });
  if (!sub) return;
  await assertPageInOrg(sub.pageId, session.orgId);
  await prisma.subscriber.update({ where: { id: subscriberId }, data: { quarantined: !sub.quarantined } });
  revalidatePath("/admin/subscribers");
}

export async function removeSubscriber(subscriberId: string) {
  const session = await requireOrgSession();
  const sub = await prisma.subscriber.findUnique({ where: { id: subscriberId } });
  if (!sub) return;
  await assertPageInOrg(sub.pageId, session.orgId);
  await prisma.subscriber.delete({ where: { id: subscriberId } });
  revalidatePath("/admin/subscribers");
}
