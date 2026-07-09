import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import { setComponentStatus } from "@/lib/component-status";

/**
 * Opportunistically advances scheduled-maintenance lifecycle state based on
 * wall-clock time. Called on read paths (no background worker in this build)
 * so admins/visitors always see an up-to-date status even without a cron job.
 */
export async function syncAutoMaintenance() {
  const now = new Date();

  const toStart = await collections
    .incidents()
    .find({ isMaintenance: true, autoTransition: true, maintenanceStatus: "SCHEDULED", scheduledStart: { $lte: now } })
    .toArray();
  for (const inc of toStart) {
    const components = await collections.incidentComponents().find({ incidentId: inc._id }).toArray();
    await collections.incidents().updateOne({ _id: inc._id }, { $set: { maintenanceStatus: "IN_PROGRESS" } });
    for (const ic of components) {
      await setComponentStatus(ic.componentId, ic.newStatus);
    }
    await collections.incidentUpdates().insertOne({
      _id: new ObjectId(),
      incidentId: inc._id,
      status: "INVESTIGATING",
      body: "This scheduled maintenance window has started automatically.",
      createdAt: new Date(),
      notified: false,
    });
  }

  const toComplete = await collections
    .incidents()
    .find({ isMaintenance: true, autoTransition: true, maintenanceStatus: "IN_PROGRESS", scheduledEnd: { $lte: now } })
    .toArray();
  for (const inc of toComplete) {
    const components = await collections.incidentComponents().find({ incidentId: inc._id }).toArray();
    await collections.incidents().updateOne({ _id: inc._id }, { $set: { maintenanceStatus: "COMPLETED", resolvedAt: now } });
    for (const ic of components) {
      await setComponentStatus(ic.componentId, "OPERATIONAL");
    }
    await collections.incidentUpdates().insertOne({
      _id: new ObjectId(),
      incidentId: inc._id,
      status: "RESOLVED",
      body: "This scheduled maintenance window has completed automatically.",
      createdAt: new Date(),
      notified: false,
    });
  }
}
