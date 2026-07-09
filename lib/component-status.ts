import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";

/**
 * Closes the open componentStatusEvents interval (if any) and opens a new
 * one, then updates the denormalized status field on the component. Used by
 * every status-writer (admin edit, automation webhook, maintenance sync,
 * monitor runner) so uptime history stays consistent across all of them.
 * Returns true if the status actually changed.
 */
export async function setComponentStatus(
  componentId: ObjectId,
  status: string,
  opts?: { isMaintenance?: boolean }
): Promise<boolean> {
  const componentDoc = await collections.components().findOne({ _id: componentId });
  if (!componentDoc) return false;
  if (componentDoc.status === status) return false;

  await collections.componentStatusEvents().updateMany(
    { componentId, endedAt: null },
    { $set: { endedAt: new Date() } }
  );
  await collections.componentStatusEvents().insertOne({
    _id: new ObjectId(),
    componentId,
    status,
    startedAt: new Date(),
    endedAt: null,
    isMaintenance: opts?.isMaintenance ?? status === "UNDER_MAINTENANCE",
  });

  await collections.components().updateOne({ _id: componentId }, { $set: { status } });
  return true;
}
