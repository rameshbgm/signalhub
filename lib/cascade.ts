import type { ClientSession } from "mongodb";
import { collections, mongoClient } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";

export async function withTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = mongoClient.startSession();
  try {
    let result: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result!;
  } finally {
    await session.endSession();
  }
}

export async function deletePageCascade(pageId: string) {
  const id = oid(pageId);
  await withTransaction(async (session) => {
    const componentIds = (
      await collections.components().find({ pageId: id }, { session, projection: { _id: 1 } }).toArray()
    ).map((d) => d._id);
    const incidentIds = (
      await collections.incidents().find({ pageId: id }, { session, projection: { _id: 1 } }).toArray()
    ).map((d) => d._id);
    const metricIds = (
      await collections.metrics().find({ pageId: id }, { session, projection: { _id: 1 } }).toArray()
    ).map((d) => d._id);

    await Promise.all([
      collections.componentStatusEvents().deleteMany({ componentId: { $in: componentIds } }, { session }),
      collections.incidentComponents().deleteMany({ incidentId: { $in: incidentIds } }, { session }),
      collections.incidentUpdates().deleteMany({ incidentId: { $in: incidentIds } }, { session }),
      collections.metricPoints().deleteMany({ metricId: { $in: metricIds } }, { session }),
      collections.components().deleteMany({ pageId: id }, { session }),
      collections.incidents().deleteMany({ pageId: id }, { session }),
      collections.metrics().deleteMany({ pageId: id }, { session }),
      collections.componentGroups().deleteMany({ pageId: id }, { session }),
      collections.incidentTemplates().deleteMany({ pageId: id }, { session }),
      collections.templateGroups().deleteMany({ pageId: id }, { session }),
      collections.webhookEndpoints().deleteMany({ pageId: id }, { session }),
      collections.subscribers().deleteMany({ pageId: id }, { session }),
      collections.pageAccessUsers().deleteMany({ pageId: id }, { session }),
      collections.pageAccessGroups().deleteMany({ pageId: id }, { session }),
    ]);

    await collections.pages().deleteOne({ _id: id }, { session });
  });
}

export async function deleteIncidentCascade(incidentId: string) {
  const id = oid(incidentId);
  await withTransaction(async (session) => {
    await Promise.all([
      collections.incidentUpdates().deleteMany({ incidentId: id }, { session }),
      collections.incidentComponents().deleteMany({ incidentId: id }, { session }),
    ]);
    await collections.incidents().deleteOne({ _id: id }, { session });
  });
}

export async function deleteComponentCascade(componentId: string) {
  const id = oid(componentId);
  await withTransaction(async (session) => {
    await Promise.all([
      collections.incidentComponents().deleteMany({ componentId: id }, { session }),
      collections.componentStatusEvents().deleteMany({ componentId: id }, { session }),
    ]);
    await collections.components().deleteOne({ _id: id }, { session });
  });
}

export async function deleteMetricCascade(metricId: string) {
  const id = oid(metricId);
  await withTransaction(async (session) => {
    await collections.metricPoints().deleteMany({ metricId: id }, { session });
    await collections.metrics().deleteOne({ _id: id }, { session });
  });
}
