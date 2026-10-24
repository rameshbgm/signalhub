"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertComponentInPage, assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { INPUT_LIMITS } from "@/lib/input-limits";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { database, withDatabaseTransaction } from "@/lib/postgres/client";
import { isDatabaseId } from "@/lib/database-id";
import { BULK_METRIC_LIMIT, bulkMetricDeletePhrase, isBulkMetricIntent, matchesBulkMetricDeletePhrase, metricCountLabel } from "@/lib/metric-bulk";

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
  if (!name || name.length > INPUT_LIMITS.title) throw new Error(`Metric name is required and must be ${INPUT_LIMITS.title} characters or fewer`);
  const suffix = String(formData.get("suffix") ?? "").trim();
  if (suffix.length > INPUT_LIMITS.metricSuffix) throw new Error(`Unit suffix must be ${INPUT_LIMITS.metricSuffix} characters or fewer`);
  const description = String(formData.get("description") ?? "").trim();
  if (description.length > INPUT_LIMITS.description) throw new Error(`Description must be ${INPUT_LIMITS.description} characters or fewer`);
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
      suffix, description,
      visible: true, decimals,
    }).execute();
  });
  revalidatePath("/organization/metrics");
  redirect(`/organization/metrics?pageId=${pageId}`);
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
  revalidatePath("/organization/monitors");
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

/** Bulk show, hide or delete over metrics of one page, from the metrics list. */
export async function bulkMetricAction(pageId: string, formData: FormData) {
  const intent = formData.get("intent");
  if (!isBulkMetricIntent(intent)) throw new Error("Choose a bulk action");
  const metricIds = [...new Set(formData.getAll("metricId").map(String))];
  if (!metricIds.length) throw new Error("Select at least one metric");
  if (metricIds.length > BULK_METRIC_LIMIT) throw new Error(`Select ${BULK_METRIC_LIMIT} metrics or fewer`);
  if (!isDatabaseId(pageId) || !metricIds.every(isDatabaseId)) throw new Error("One or more selected metrics are invalid. Reload and try again.");
  const session = await requireCapability("monitor.manage", pageId);
  await assertPageInOrg(pageId, session.orgId);
  if (intent === "delete" && !matchesBulkMetricDeletePhrase(String(formData.get("confirmation") ?? ""), metricIds.length)) {
    throw new Error(`Type "${bulkMetricDeletePhrase(metricIds.length)}" to confirm`);
  }
  const message = await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const members = await transaction.selectFrom("metrics").select("id").where("id", "in", metricIds).where("pageId", "=", pageId).forUpdate().execute();
    if (members.length !== metricIds.length) throw new Error("Some selected metrics no longer exist. Reload and try again.");
    if (intent === "delete") {
      await transaction.deleteFrom("metrics").where("id", "in", metricIds).where("pageId", "=", pageId).execute();
      return `Deleted ${metricCountLabel(metricIds.length)}`;
    }
    // Showing needs a hidden metric and hiding a visible one, matching the single-row toggle.
    const changed = await transaction.updateTable("metrics").set({ visible: intent === "show" })
      .where("id", "in", metricIds).where("pageId", "=", pageId).where("visible", "=", intent !== "show").returning("id").execute();
    const skipped = metricIds.length - changed.length;
    return `${intent === "show" ? "Showed" : "Hid"} ${metricCountLabel(changed.length)}${skipped ? `, skipped ${skipped} already ${intent === "show" ? "visible" : "hidden"}` : ""}`;
  });
  revalidatePath("/organization/metrics");
  const page = await database.selectFrom("pages").select("slug").where("id", "=", pageId).executeTakeFirst();
  revalidatePath("/organization/monitors");
  if (page) revalidatePath(`/${page.slug}`);
  return message;
}
