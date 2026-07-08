"use server";

import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { requireOrgSession, assertPageInOrg } from "@/lib/admin-guard";
import { deleteMetricCascade } from "@/lib/cascade";

export async function createMetric(pageId: string, formData: FormData) {
  const session = await requireOrgSession();
  await assertPageInOrg(pageId, session.orgId);
  const componentId = String(formData.get("componentId") ?? "");
  await collections.metrics().insertOne({
    _id: new ObjectId(),
    pageId: oid(pageId),
    componentId: componentId ? oid(componentId) : null,
    name: String(formData.get("name") ?? "New Metric"),
    suffix: String(formData.get("suffix") ?? ""),
    description: String(formData.get("description") ?? ""),
    visible: true,
    decimals: 0,
  });
  revalidatePath("/admin/metrics");
}

export async function pushMetricPoint(metricId: string, formData: FormData) {
  const session = await requireOrgSession();
  const metricDoc = await collections.metrics().findOne({ _id: oid(metricId) });
  if (!metricDoc) return;
  const metric = toId(metricDoc);
  await assertPageInOrg(metric.pageId, session.orgId);
  const value = Number(formData.get("value") ?? 0);
  await collections.metricPoints().insertOne({ _id: new ObjectId(), metricId: oid(metricId), timestamp: new Date(), value });
  revalidatePath("/admin/metrics");
}

export async function toggleMetricVisible(metricId: string) {
  const session = await requireOrgSession();
  const metricDoc = await collections.metrics().findOne({ _id: oid(metricId) });
  if (!metricDoc) return;
  const metric = toId(metricDoc);
  await assertPageInOrg(metric.pageId, session.orgId);
  await collections.metrics().updateOne({ _id: oid(metricId) }, { $set: { visible: !metricDoc.visible } });
  revalidatePath("/admin/metrics");
}

export async function deleteMetric(metricId: string) {
  const session = await requireOrgSession();
  const metricDoc = await collections.metrics().findOne({ _id: oid(metricId) });
  if (!metricDoc) return;
  const metric = toId(metricDoc);
  await assertPageInOrg(metric.pageId, session.orgId);
  await deleteMetricCascade(metricId);
  revalidatePath("/admin/metrics");
}
