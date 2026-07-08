"use server";

import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { hashPassword } from "@/lib/auth";
import { requireOrgSession } from "@/lib/admin-guard";

export async function inviteMember(formData: FormData) {
  const session = await requireOrgSession();
  const email = String(formData.get("email") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "EDITOR");
  const password = String(formData.get("password") ?? "changeme123");

  if (!email || !name) throw new Error("Name and email are required");

  await collections.teamMembers().insertOne({
    _id: new ObjectId(),
    orgId: oid(session.orgId),
    email,
    name,
    role,
    passwordHash: await hashPassword(password),
    twoFactorEnabled: false,
    createdAt: new Date(),
  });
  await collections.auditLogs().insertOne({
    _id: new ObjectId(),
    orgId: oid(session.orgId),
    actor: session.email,
    action: "INVITE_MEMBER",
    target: email,
    createdAt: new Date(),
  });
  revalidatePath("/admin/team");
}

export async function removeMember(memberId: string) {
  const session = await requireOrgSession();
  const memberDoc = await collections.teamMembers().findOne({ _id: oid(memberId) });
  if (!memberDoc || memberDoc.orgId.toHexString() !== session.orgId) return;
  await collections.teamMembers().deleteOne({ _id: oid(memberId) });
  await collections.auditLogs().insertOne({
    _id: new ObjectId(),
    orgId: oid(session.orgId),
    actor: session.email,
    action: "REMOVE_MEMBER",
    target: memberDoc.email,
    createdAt: new Date(),
  });
  revalidatePath("/admin/team");
}
