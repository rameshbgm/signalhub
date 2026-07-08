"use server";

import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";
import { requireOrgAdmin } from "@/lib/admin-guard";
import { changePlan, PLANS, type PlanId } from "@/lib/billing";

export async function switchPlan(planId: string) {
  const session = await requireOrgAdmin();
  if (!(planId in PLANS)) throw new Error("Unknown plan");
  const plan = await changePlan(session.orgId, planId as PlanId);
  await collections.auditLogs().insertOne({
    _id: new ObjectId(),
    orgId: oid(session.orgId),
    actor: session.email,
    action: "CHANGE_PLAN",
    target: plan.id,
    createdAt: new Date(),
  });
  revalidatePath("/admin/billing");
}
