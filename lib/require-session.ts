import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  const orgDoc = await collections.organizations().findOne({ _id: oid(session.orgId) });
  if (!orgDoc) redirect("/admin/login");
  return { session, org: toId(orgDoc) };
}
