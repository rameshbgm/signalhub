import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  const org = await prisma.organization.findUnique({ where: { id: session.orgId } });
  if (!org) redirect("/admin/login");
  return { session, org };
}
