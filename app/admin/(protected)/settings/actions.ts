"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";
import { requireOrgAdmin } from "@/lib/admin-guard";
import { deleteOrgCascade } from "@/lib/cascade";
import { destroySession } from "@/lib/auth";

export async function updateOrgSettings(formData: FormData) {
  const session = await requireOrgAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const billingEmail = String(formData.get("billingEmail") ?? "").trim();
  if (!name) throw new Error("Organization name is required");

  await collections.organizations().updateOne(
    { _id: oid(session.orgId) },
    { $set: { name, billingEmail: billingEmail || null } }
  );
  await collections.auditLogs().insertOne({
    _id: new ObjectId(),
    orgId: oid(session.orgId),
    actor: session.email,
    action: "UPDATE_ORG_SETTINGS",
    target: name,
    createdAt: new Date(),
  });
  revalidatePath("/admin/settings");
}

export async function deleteOrganization(formData: FormData) {
  const session = await requireOrgAdmin();
  const confirm = String(formData.get("confirm") ?? "");
  const org = await collections.organizations().findOne({ _id: oid(session.orgId) });
  if (!org) throw new Error("Organization not found");
  if (confirm !== org.slug) throw new Error(`Type "${org.slug}" to confirm deletion`);

  await deleteOrgCascade(session.orgId);
  await destroySession();
  redirect("/");
}
