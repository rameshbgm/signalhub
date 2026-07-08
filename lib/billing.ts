import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";

/**
 * Billing is simulated (like email/SMS delivery elsewhere in this build):
 * plan changes succeed instantly and write an Invoice record instead of
 * charging a card. Swap `changePlan` for a real Stripe Checkout/Subscription
 * flow in production — plan limits and gating below stay unchanged.
 */

export type PlanId = "free" | "pro" | "enterprise";

export interface PlanDef {
  id: PlanId;
  name: string;
  priceUsd: number; // per month
  limits: {
    pages: number;
    teamMembers: number;
    subscribersPerPage: number;
  };
  customDomain: boolean;
  removeBranding: boolean;
}

export const PLANS: Record<PlanId, PlanDef> = {
  free: {
    id: "free",
    name: "Free",
    priceUsd: 0,
    limits: { pages: 1, teamMembers: 3, subscribersPerPage: 100 },
    customDomain: false,
    removeBranding: false,
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceUsd: 29,
    limits: { pages: 5, teamMembers: 10, subscribersPerPage: 1000 },
    customDomain: true,
    removeBranding: true,
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    priceUsd: 99,
    limits: { pages: Number.POSITIVE_INFINITY, teamMembers: Number.POSITIVE_INFINITY, subscribersPerPage: Number.POSITIVE_INFINITY },
    customDomain: true,
    removeBranding: true,
  },
};

export function getPlan(planId: string): PlanDef {
  return PLANS[planId as PlanId] ?? PLANS.free;
}

export async function getOrgPlan(orgId: string): Promise<PlanDef> {
  const org = await collections.organizations().findOne({ _id: oid(orgId) });
  return getPlan(org?.plan ?? "free");
}

export async function getUsage(orgId: string) {
  const id = oid(orgId);
  const pageDocs = await collections.pages().find({ orgId: id }, { projection: { _id: 1 } }).toArray();
  const pageIds = pageDocs.map((p) => p._id);
  const [teamMembers, subscribers] = await Promise.all([
    collections.teamMembers().countDocuments({ orgId: id }),
    pageIds.length ? collections.subscribers().countDocuments({ pageId: { $in: pageIds } }) : Promise.resolve(0),
  ]);
  return { pages: pageDocs.length, teamMembers, subscribers };
}

export class PlanLimitError extends Error {}

export async function assertWithinLimit(orgId: string, resource: "pages" | "teamMembers") {
  const [plan, usage] = await Promise.all([getOrgPlan(orgId), getUsage(orgId)]);
  if (usage[resource] >= plan.limits[resource]) {
    throw new PlanLimitError(
      `Your ${plan.name} plan allows up to ${plan.limits[resource]} ${resource === "pages" ? "status pages" : "team members"}. Upgrade in Billing to add more.`
    );
  }
}

export async function changePlan(orgId: string, planId: PlanId) {
  const plan = PLANS[planId];
  if (!plan) throw new Error("Unknown plan");
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  await collections.organizations().updateOne(
    { _id: oid(orgId) },
    { $set: { plan: plan.id, planRenewsAt: plan.priceUsd > 0 ? periodEnd : null } }
  );
  if (plan.priceUsd > 0) {
    await collections.invoices().insertOne({
      _id: new ObjectId(),
      orgId: oid(orgId),
      plan: plan.id,
      amountUsd: plan.priceUsd,
      status: "PAID",
      periodStart: now,
      periodEnd,
      createdAt: now,
    });
  }
  return plan;
}
