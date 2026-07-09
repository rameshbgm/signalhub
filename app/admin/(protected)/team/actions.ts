"use server";

import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { hashPassword } from "@/lib/auth";
import { requireOrgAdmin } from "@/lib/admin-guard";
import { assertWithinLimit } from "@/lib/billing";

const INVITABLE_ROLES = ["TENANT_ADMIN", "TENANT_USER"];

export async function inviteMember(formData: FormData) {
  const session = await requireOrgAdmin();
  const email = String(formData.get("email") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "TENANT_USER");
  const password = String(formData.get("password") ?? "changeme123");

  if (!email || !name) throw new Error("Name and email are required");
  if (!INVITABLE_ROLES.includes(role)) throw new Error("Invalid role");
  await assertWithinLimit(session.orgId, "teamMembers");
  if (await collections.teamMembers().findOne({ email })) {
    throw new Error("An account with this email already exists");
  }

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
  const session = await requireOrgAdmin();
  if (memberId === session.teamMemberId) throw new Error("You can't remove yourself");
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
