"use server";

import { revalidatePath } from "next/cache";
import { assertComponentInPage, assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { database, withDatabaseTransaction } from "@/lib/postgres/client";

function validatedDecimals(formData: FormData) {
  const decimals = Number(formData.get("decimals") ?? 0);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 10) throw new Error("Metric decimals must be an integer from 0 to 10");
  return decimals;
}

export async function createMetric(pageId: string, formData: FormData) {
  const session = await requireCapability("monitor.manage", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const componentId = String(formData.get("componentId") ?? "");
  if (componentId) await assertComponentInPage(componentId, pageId);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Metric name is required");
  const decimals = validatedDecimals(formData);
  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const page = await transaction.selectFrom("pages").select("id").where("id", "=", pageId)
      .where("orgId", "=", session.orgId).where("deletedAt", "is", null).forShare().executeTakeFirst();
    if (!page) throw new Error("Page not found in your organization");
    if (componentId) {
      const component = await transaction.selectFrom("components").select("id")
        .where("id", "=", componentId).where("pageId", "=", page.id).executeTakeFirst();
      if (!component) throw new Error("Component not found on this page");
    }
    await transaction.insertInto("metrics").values({
      pageId, componentId: componentId || null, name,
      suffix: String(formData.get("suffix") ?? ""), description: String(formData.get("description") ?? ""),
      visible: true, decimals,
    }).execute();
  });
  revalidatePath("/organization/metrics");
}

async function metricForManagement(metricId: string) {
  const metric = await database.selectFrom("metrics").selectAll().where("id", "=", metricId).executeTakeFirst();
  if (!metric) throw new Error("Metric not found");
  const session = await requireCapability("monitor.manage", metric.pageId);
  await assertPageInOrg(metric.pageId, session.orgId);
  return { metric, session };
}

export async function pushMetricPoint(metricId: string, formData: FormData) {
  const { metric, session } = await metricForManagement(metricId);
  const value = Number(formData.get("value") ?? 0);
  if (!Number.isFinite(value)) throw new Error("Metric value must be a finite number");
  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const current = await transaction.selectFrom("metrics").select("id")
      .where("id", "=", metric.id).where("pageId", "=", metric.pageId).forShare().executeTakeFirst();
    if (!current) throw new Error("Metric not found");
    await transaction.insertInto("metricPoints").values({ metricId: current.id, timestamp: new Date(), value }).execute();
  });
  revalidatePath("/organization/metrics");
}

export async function toggleMetricVisible(metricId: string) {
  const { metric, session } = await metricForManagement(metricId);
  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const changed = await transaction.updateTable("metrics").set({ visible: !metric.visible })
      .where("id", "=", metric.id).where("pageId", "=", metric.pageId)
      .where("visible", "=", metric.visible).returning("id").executeTakeFirst();
    if (!changed) throw new Error("Metric state changed; reload and retry");
  });
  revalidatePath("/organization/metrics");
}

export async function deleteMetric(metricId: string) {
  const { metric, session } = await metricForManagement(metricId);
  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const deleted = await transaction.deleteFrom("metrics").where("id", "=", metric.id)
      .where("pageId", "=", metric.pageId).returning("id").executeTakeFirst();
    if (!deleted) throw new Error("Metric not found");
  });
  revalidatePath("/organization/metrics");
}

export async function updateMetricDecimals(metricId: string, formData: FormData) {
  const { metric, session } = await metricForManagement(metricId);
  const decimals = validatedDecimals(formData);
  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const changed = await transaction.updateTable("metrics").set({ decimals })
      .where("id", "=", metric.id).where("pageId", "=", metric.pageId).returning("id").executeTakeFirst();
    if (!changed) throw new Error("Metric state changed; reload and retry");
  });
  revalidatePath("/organization/metrics");
  const page = await database.selectFrom("pages").select("slug").where("id", "=", metric.pageId).executeTakeFirst();
  if (page) revalidatePath(`/${page.slug}`);
}
