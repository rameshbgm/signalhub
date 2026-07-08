"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { requireOrgSession } from "@/lib/admin-guard";

export async function inviteMember(formData: FormData) {
  const session = await requireOrgSession();
  const email = String(formData.get("email") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "EDITOR");
  const password = String(formData.get("password") ?? "changeme123");

  if (!email || !name) throw new Error("Name and email are required");

  await prisma.teamMember.create({
    data: { orgId: session.orgId, email, name, role, passwordHash: await hashPassword(password) },
  });
  await prisma.auditLog.create({ data: { orgId: session.orgId, actor: session.email, action: "INVITE_MEMBER", target: email } });
  revalidatePath("/admin/team");
}

export async function removeMember(memberId: string) {
  const session = await requireOrgSession();
  const member = await prisma.teamMember.findUnique({ where: { id: memberId } });
  if (!member || member.orgId !== session.orgId) return;
  await prisma.teamMember.delete({ where: { id: memberId } });
  await prisma.auditLog.create({ data: { orgId: session.orgId, actor: session.email, action: "REMOVE_MEMBER", target: member.email } });
  revalidatePath("/admin/team");
}
