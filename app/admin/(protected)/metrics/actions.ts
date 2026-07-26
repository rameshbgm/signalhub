"use server";

import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { requireCapability, assertPageInOrg, assertComponentInPage } from "@/lib/admin-guard";
import { deleteMetricCascade } from "@/lib/cascade";
import { withTransaction } from "@/lib/cascade";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";

function validatedDecimals(formData: FormData) {
  const decimals = Number(formData.get("decimals") ?? 0);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 10) {
    throw new Error("Metric decimals must be an integer from 0 to 10");
  }
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
  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
    const page = await collections.pages().findOne(
      { _id: oid(pageId), orgId: oid(session.orgId) },
      { session: databaseSession }
    );
    if (!page) throw new Error("Page not found in your organization");
    if (componentId) {
      const component = await collections.components().findOne(
        { _id: oid(componentId), pageId: page._id },
        { session: databaseSession }
      );
      if (!component) throw new Error("Component not found on this page");
    }
    await collections.metrics().insertOne({
      _id: new ObjectId(),
      pageId: oid(pageId),
      componentId: componentId ? oid(componentId) : null,
      name,
      suffix: String(formData.get("suffix") ?? ""),
      description: String(formData.get("description") ?? ""),
      visible: true,
      decimals,
    }, { session: databaseSession });
  });
  revalidatePath("/organization/metrics");
}

export async function pushMetricPoint(metricId: string, formData: FormData) {
  const metricDoc = await collections.metrics().findOne({ _id: oid(metricId) });
  if (!metricDoc) throw new Error("Metric not found");
  const metric = toId(metricDoc);
  const session = await requireCapability("monitor.manage", metric.pageId);
  await assertPageInOrg(metric.pageId, session.orgId);
  const value = Number(formData.get("value") ?? 0);
  if (!Number.isFinite(value)) throw new Error("Metric value must be a finite number");
  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
    const currentMetric = await collections.metrics().findOne(
      { _id: oid(metricId), pageId: oid(metric.pageId) },
      { session: databaseSession }
    );
    if (!currentMetric) throw new Error("Metric not found");
    await collections.metricPoints().insertOne(
      { _id: new ObjectId(), metricId: currentMetric._id, timestamp: new Date(), value },
      { session: databaseSession }
    );
  });
  revalidatePath("/organization/metrics");
}

export async function toggleMetricVisible(metricId: string) {
  const metricDoc = await collections.metrics().findOne({ _id: oid(metricId) });
  if (!metricDoc) throw new Error("Metric not found");
  const metric = toId(metricDoc);
  const session = await requireCapability("monitor.manage", metric.pageId);
  await assertPageInOrg(metric.pageId, session.orgId);
  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
    const page = await collections.pages().findOne(
      { _id: metricDoc.pageId, orgId: oid(session.orgId) },
      { session: databaseSession }
    );
    if (!page) throw new Error("Page not found in your organization");
    const currentMetric = await collections.metrics().findOne(
      { _id: oid(metricId), pageId: page._id },
      { session: databaseSession }
    );
    if (!currentMetric) throw new Error("Metric not found");
    const changed = await collections.metrics().updateOne(
      { _id: currentMetric._id, pageId: page._id },
      { $set: { visible: !currentMetric.visible } },
      { session: databaseSession }
    );
    if (!changed.matchedCount) throw new Error("Metric state changed; reload and retry");
  });
  revalidatePath("/organization/metrics");
}

export async function deleteMetric(metricId: string) {
  const metricDoc = await collections.metrics().findOne({ _id: oid(metricId) });
  if (!metricDoc) throw new Error("Metric not found");
  const metric = toId(metricDoc);
  const session = await requireCapability("monitor.manage", metric.pageId);
  await assertPageInOrg(metric.pageId, session.orgId);
  await deleteMetricCascade(metricId, session.orgId, metric.pageId);
  revalidatePath("/organization/metrics");
}

export async function updateMetricDecimals(metricId: string, formData: FormData) {
  const metricDoc = await collections.metrics().findOne({ _id: oid(metricId) });
  if (!metricDoc) throw new Error("Metric not found");
  const metric = toId(metricDoc);
  const session = await requireCapability("monitor.manage", metric.pageId);
  await assertPageInOrg(metric.pageId, session.orgId);
  const decimals = validatedDecimals(formData);
  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
    const page = await collections.pages().findOne(
      { _id: metricDoc.pageId, orgId: oid(session.orgId) },
      { session: databaseSession }
    );
    if (!page) throw new Error("Page not found in your organization");
    const currentMetric = await collections.metrics().findOne(
      { _id: metricDoc._id, pageId: page._id },
      { session: databaseSession }
    );
    if (!currentMetric) throw new Error("Metric not found");
    const changed = await collections.metrics().updateOne(
      { _id: currentMetric._id, pageId: page._id },
      { $set: { decimals } },
      { session: databaseSession }
    );
    if (!changed.matchedCount) throw new Error("Metric state changed; reload and retry");
  });
  revalidatePath("/organization/metrics");
  const page = await collections.pages().findOne({ _id: metricDoc.pageId });
  if (page) revalidatePath(`/${page.slug}`);
}
