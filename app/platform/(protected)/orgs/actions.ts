"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { requirePlatformSession } from "@/lib/admin-guard";
import { deleteOrgCascade } from "@/lib/cascade";
import { createSession } from "@/lib/auth";

export async function impersonateOrg(orgId: string) {
  const platformSession = await requirePlatformSession();
  const orgDoc = await collections.organizations().findOne({ _id: oid(orgId) });
  if (!orgDoc) throw new Error("Organization not found");

  const memberDoc =
    (await collections.teamMembers().findOne({ orgId: oid(orgId), role: "TENANT_ADMIN" })) ??
    (await collections.teamMembers().findOne({ orgId: oid(orgId) }));
  if (!memberDoc) throw new Error("This organization has no team members to impersonate");
  const member = toId(memberDoc);

  await collections.auditLogs().insertOne({
    _id: new ObjectId(),
    orgId: orgDoc._id,
    actor: platformSession.email,
    action: "PLATFORM_IMPERSONATE",
    target: orgDoc.slug,
    createdAt: new Date(),
  });

  await createSession({ teamMemberId: member.id, orgId: member.orgId, email: member.email, name: member.name, role: member.role });
  redirect("/admin");
}

export async function suspendOrg(orgId: string) {
  await requirePlatformSession();
  await collections.organizations().updateOne({ _id: oid(orgId) }, { $set: { suspended: true } });
  revalidatePath("/platform/orgs");
}

export async function unsuspendOrg(orgId: string) {
  await requirePlatformSession();
  await collections.organizations().updateOne({ _id: oid(orgId) }, { $set: { suspended: false } });
  revalidatePath("/platform/orgs");
}

export async function deleteOrgAsPlatform(orgId: string) {
  await requirePlatformSession();
  await deleteOrgCascade(orgId);
  revalidatePath("/platform/orgs");
}
