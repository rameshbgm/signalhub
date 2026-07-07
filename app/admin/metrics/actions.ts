"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireOrgSession, assertPageInOrg } from "@/lib/admin-guard";

export async function createMetric(pageId: string, formData: FormData) {
  const session = await requireOrgSession();
  await assertPageInOrg(pageId, session.orgId);
  await prisma.metric.create({
    data: {
      pageId,
      name: String(formData.get("name") ?? "New Metric"),
      suffix: String(formData.get("suffix") ?? ""),
      description: String(formData.get("description") ?? ""),
      componentId: String(formData.get("componentId") ?? "") || null,
    },
  });
  revalidatePath("/admin/metrics");
}

export async function pushMetricPoint(metricId: string, formData: FormData) {
  const session = await requireOrgSession();
  const metric = await prisma.metric.findUnique({ where: { id: metricId } });
  if (!metric) return;
  await assertPageInOrg(metric.pageId, session.orgId);
  const value = Number(formData.get("value") ?? 0);
  await prisma.metricPoint.create({ data: { metricId, value } });
  revalidatePath("/admin/metrics");
}

export async function toggleMetricVisible(metricId: string) {
  const session = await requireOrgSession();
  const metric = await prisma.metric.findUnique({ where: { id: metricId } });
  if (!metric) return;
  await assertPageInOrg(metric.pageId, session.orgId);
  await prisma.metric.update({ where: { id: metricId }, data: { visible: !metric.visible } });
  revalidatePath("/admin/metrics");
}

export async function deleteMetric(metricId: string) {
  const session = await requireOrgSession();
  const metric = await prisma.metric.findUnique({ where: { id: metricId } });
  if (!metric) return;
  await assertPageInOrg(metric.pageId, session.orgId);
  await prisma.metric.delete({ where: { id: metricId } });
  revalidatePath("/admin/metrics");
}
