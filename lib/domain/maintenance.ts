import { ObjectId, type Collection } from "mongodb";
import { z } from "zod";
import { collections, mongoClient, type IncidentDoc } from "@/lib/db";
import { reconcileComponents } from "@/lib/component-status";
import { dispatchNotifications } from "@/lib/notify";
import { oid, toId } from "@/lib/mongo-utils";
import { MAINTENANCE_STATUSES } from "@/lib/status";
import { organizationIsActive } from "@/lib/organization-state";
import {
  fenceActiveOrganizationMutation,
  OrganizationMutationBlockedError,
} from "@/lib/organization-mutation";

const objectIdString = z.string().refine(ObjectId.isValid, "Malformed identifier");
const MIN_REMINDER_MINUTES = 5;
const MAX_REMINDER_MINUTES = 7 * 24 * 60;

type MaintenanceIncidentDoc = IncidentDoc & {
  reminderMinutesBefore?: number | null;
  reminderSentAt?: Date | null;
};

function maintenanceIncidents() {
  return collections.incidents() as unknown as Collection<MaintenanceIncidentDoc>;
}

export const createMaintenanceInputSchema = z
  .object({
    pageId: objectIdString,
    name: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(20_000),
    scheduledStart: z.date(),
    scheduledEnd: z.date(),
    autoTransition: z.boolean().default(true),
    notify: z.boolean().default(true),
    reminderMinutesBefore: z
      .number()
      .int()
      .min(MIN_REMINDER_MINUTES)
      .max(MAX_REMINDER_MINUTES)
      .nullable()
      .default(60),
    pageWide: z.boolean().default(false),
    componentIds: z.array(objectIdString).default([]),
  })
  .superRefine((value, context) => {
    if (value.scheduledStart >= value.scheduledEnd) {
      context.addIssue({
        code: "custom",
        path: ["scheduledEnd"],
        message: "Maintenance end must be after its start",
      });
    }
    if (!value.pageWide && value.componentIds.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["componentIds"],
        message: "Select a component or explicitly mark maintenance page-wide",
      });
    }
    if (new Set(value.componentIds).size !== value.componentIds.length) {
      context.addIssue({ code: "custom", path: ["componentIds"], message: "Components must be unique" });
    }
  });

export async function createMaintenance(
  orgId: string,
  rawInput: z.input<typeof createMaintenanceInputSchema>
) {
  const input = createMaintenanceInputSchema.parse(rawInput);
  const pageId = oid(input.pageId);
  const page = await collections.pages().findOne({ _id: pageId, orgId: oid(orgId) });
  if (!page) throw new Error("Page not found in your organization");
  if (input.componentIds.length) {
    const count = await collections.components().countDocuments({
      _id: { $in: input.componentIds.map(oid) },
      pageId,
    });
    if (count !== input.componentIds.length) {
      throw new Error("One or more components do not belong to this page");
    }
  }

  const incidentId = new ObjectId();
  const updateId = new ObjectId();
  const now = new Date();
  const links = input.componentIds.map((id) => ({
    _id: new ObjectId(),
    incidentId,
    componentId: oid(id),
    newStatus: "UNDER_MAINTENANCE",
  }));
  const session = mongoClient.startSession();
  try {
    await session.withTransaction(async () => {
      await fenceActiveOrganizationMutation(orgId, session);
      const currentPage = await collections.pages().findOne(
        { _id: pageId, orgId: oid(orgId) },
        { session }
      );
      if (!currentPage) throw new Error("Page not found in your organization");
      if (input.componentIds.length) {
        const currentComponentCount = await collections.components().countDocuments(
          {
            _id: { $in: input.componentIds.map(oid) },
            pageId,
          },
          { session }
        );
        if (currentComponentCount !== input.componentIds.length) {
          throw new Error("One or more components do not belong to this page");
        }
      }
      await maintenanceIncidents().insertOne(
        {
          _id: incidentId,
          pageId,
          name: input.name,
          status: "INVESTIGATING",
          impact: "NONE",
          pageWide: input.pageWide,
          isMaintenance: true,
          maintenanceStatus: "SCHEDULED",
          scheduledStart: input.scheduledStart,
          scheduledEnd: input.scheduledEnd,
          autoTransition: input.autoTransition,
          notifySubscribers: input.notify,
          reminderMinutesBefore: input.reminderMinutesBefore,
          reminderSentAt: null,
          postmortemBody: null,
          postmortemPublishedAt: null,
          createdAt: now,
          resolvedAt: null,
          backfilled: false,
        },
        { session }
      );
      if (links.length) await collections.incidentComponents().insertMany(links, { session });
      await collections.incidentUpdates().insertOne(
        {
          _id: updateId,
          incidentId,
          status: "INVESTIGATING",
          body: input.body,
          createdAt: now,
          notified: input.notify,
        },
        { session }
      );
      if (input.notify) {
        await dispatchNotifications(
          {
            pageId: input.pageId,
            subject: `[Scheduled Maintenance] ${input.name}`,
            body: input.body,
            eventType: "maintenance.scheduled",
            eventId: updateId.toHexString(),
            componentIds: input.componentIds,
          },
          session
        );
      }
    });
  } finally {
    await session.endSession();
  }
  const incident = await collections.incidents().findOne({ _id: incidentId });
  return toId(incident!);
}

export async function transitionMaintenance(input: {
  incidentId: string;
  expectedStatus?: string;
  status: (typeof MAINTENANCE_STATUSES)[number];
  body: string;
  notify?: boolean;
}) {
  if (!MAINTENANCE_STATUSES.includes(input.status)) throw new Error("Invalid maintenance status");
  const incident = await collections.incidents().findOne({
    _id: oid(input.incidentId),
    isMaintenance: true,
  });
  if (!incident) return false;
  const page = await collections.pages().findOne({ _id: incident.pageId });
  const organization = page
    ? await collections.organizations().findOne({ _id: page.orgId })
    : null;
  if (!page || !organization || !organizationIsActive(organization)) return false;
  const currentStatus = incident.maintenanceStatus;
  const allowedTransitions: Record<string, string[]> = {
    SCHEDULED: ["SCHEDULED", "IN_PROGRESS", "COMPLETED"],
    IN_PROGRESS: ["IN_PROGRESS", "VERIFYING", "COMPLETED"],
    VERIFYING: ["VERIFYING", "IN_PROGRESS", "COMPLETED"],
    COMPLETED: ["COMPLETED"],
  };
  if (!currentStatus || !allowedTransitions[currentStatus]?.includes(input.status)) {
    throw new Error(`Cannot transition maintenance from ${currentStatus ?? "unknown"} to ${input.status}`);
  }
  const links = await collections.incidentComponents().find({ incidentId: incident._id }).toArray();
  const now = new Date();
  const updateId = new ObjectId();
  let transitioned = false;
  const session = mongoClient.startSession();
  try {
    await session.withTransaction(async () => {
      await fenceActiveOrganizationMutation(page.orgId, session);
      const result = await collections.incidents().updateOne(
        {
          _id: incident._id,
          isMaintenance: true,
          maintenanceStatus: input.expectedStatus ?? currentStatus,
        },
        {
          $set: {
            maintenanceStatus: input.status,
            status: input.status === "COMPLETED" ? "RESOLVED" : "INVESTIGATING",
            resolvedAt: input.status === "COMPLETED" ? now : null,
          },
        },
        { session }
      );
      if (!result.matchedCount) return;
      transitioned = true;
      await collections.incidentUpdates().insertOne(
        {
          _id: updateId,
          incidentId: incident._id,
          status: input.status === "COMPLETED" ? "RESOLVED" : "INVESTIGATING",
          body: input.body,
          createdAt: now,
          notified: Boolean(input.notify),
        },
        { session }
      );
      await reconcileComponents(links.map((link) => link.componentId), session);
      if (input.notify) {
        await dispatchNotifications(
          {
            pageId: incident.pageId.toHexString(),
            subject: `[Maintenance ${input.status}] ${incident.name}`,
            body: input.body,
            eventType: `maintenance.${input.status.toLowerCase()}`,
            eventId: updateId.toHexString(),
            componentIds: links.map((link) => link.componentId.toHexString()),
          },
          session
        );
      }
    });
  } catch (error) {
    if (error instanceof OrganizationMutationBlockedError) return false;
    throw error;
  } finally {
    await session.endSession();
  }
  return transitioned;
}

export async function deleteMaintenance(orgId: string, incidentId: string) {
  const incident = await collections.incidents().findOne({
    _id: oid(incidentId),
    isMaintenance: true,
  });
  if (!incident) return false;
  const page = await collections.pages().findOne({ _id: incident.pageId, orgId: oid(orgId) });
  if (!page) return false;
  const links = await collections.incidentComponents().find({ incidentId: incident._id }).toArray();
  const session = mongoClient.startSession();
  try {
    await session.withTransaction(async () => {
      await fenceActiveOrganizationMutation(orgId, session);
      await collections.incidentUpdates().deleteMany(
        { incidentId: incident._id },
        { session }
      );
      await collections.incidentComponents().deleteMany(
        { incidentId: incident._id },
        { session }
      );
      await collections.monitors().updateMany(
        { currentIncidentId: incident._id },
        { $set: { currentIncidentId: null } },
        { session }
      );
      await collections.incidents().deleteOne(
        { _id: incident._id },
        { session }
      );
      await reconcileComponents(links.map((link) => link.componentId), session);
    });
  } finally {
    await session.endSession();
  }
  return true;
}

export function isMaintenanceReminderDue(
  maintenance: {
    maintenanceStatus: string | null;
    scheduledStart: Date | null;
    reminderMinutesBefore?: number | null;
    reminderSentAt?: Date | null;
  },
  now = new Date()
) {
  if (
    maintenance.maintenanceStatus !== "SCHEDULED" ||
    !maintenance.scheduledStart ||
    maintenance.scheduledStart <= now ||
    maintenance.reminderSentAt ||
    !Number.isInteger(maintenance.reminderMinutesBefore) ||
    maintenance.reminderMinutesBefore! < MIN_REMINDER_MINUTES ||
    maintenance.reminderMinutesBefore! > MAX_REMINDER_MINUTES
  ) {
    return false;
  }
  return (
    maintenance.scheduledStart.getTime() -
      maintenance.reminderMinutesBefore! * 60_000 <=
    now.getTime()
  );
}

async function sendMaintenanceReminder(
  maintenance: MaintenanceIncidentDoc,
  now: Date
) {
  if (!isMaintenanceReminderDue(maintenance, now)) return false;
  const page = await collections.pages().findOne({ _id: maintenance.pageId });
  const organization = page
    ? await collections.organizations().findOne({ _id: page.orgId })
    : null;
  if (!page || !organization || !organizationIsActive(organization)) return false;
  const session = mongoClient.startSession();
  let enqueued = false;
  try {
    await session.withTransaction(async () => {
      await fenceActiveOrganizationMutation(page.orgId, session);
      const claimed = await maintenanceIncidents().updateOne(
        {
          _id: maintenance._id,
          isMaintenance: true,
          maintenanceStatus: "SCHEDULED",
          scheduledStart: { $gt: now },
          reminderMinutesBefore: maintenance.reminderMinutesBefore,
          reminderSentAt: null,
        },
        { $set: { reminderSentAt: now } },
        { session }
      );
      if (!claimed.matchedCount) return;

      const links = await collections
        .incidentComponents()
        .find({ incidentId: maintenance._id }, { session })
        .toArray();
      const initialUpdate = await collections
        .incidentUpdates()
        .find({ incidentId: maintenance._id }, { session })
        .sort({ createdAt: 1 })
        .limit(1)
        .next();
      const startsAt = maintenance.scheduledStart!.toISOString();
      await dispatchNotifications(
        {
          pageId: maintenance.pageId.toHexString(),
          subject: `[Maintenance Reminder] ${maintenance.name}`,
          body: [
            `Reminder: this scheduled maintenance begins at ${startsAt}.`,
            initialUpdate?.body,
          ]
            .filter(Boolean)
            .join("\n\n"),
          eventType: "maintenance.reminder",
          eventId: `${maintenance._id.toHexString()}:reminder`,
          componentIds: links.map((link) => link.componentId.toHexString()),
        },
        session
      );
      enqueued = true;
    });
  } catch (error) {
    if (error instanceof OrganizationMutationBlockedError) return false;
    throw error;
  } finally {
    await session.endSession();
  }
  return enqueued;
}

export async function runMaintenanceTransitions(now = new Date()) {
  const reminderCandidates = await maintenanceIncidents()
    .find({
      isMaintenance: true,
      maintenanceStatus: "SCHEDULED",
      scheduledStart: {
        $gt: now,
        $lte: new Date(now.getTime() + MAX_REMINDER_MINUTES * 60_000),
      },
      reminderMinutesBefore: {
        $gte: MIN_REMINDER_MINUTES,
        $lte: MAX_REMINDER_MINUTES,
      },
      reminderSentAt: null,
    })
    .toArray();
  const toStart = await collections
    .incidents()
    .find({
      isMaintenance: true,
      autoTransition: true,
      maintenanceStatus: "SCHEDULED",
      scheduledStart: { $lte: now },
    })
    .toArray();
  const toComplete = await collections
    .incidents()
    .find({
      isMaintenance: true,
      autoTransition: true,
      maintenanceStatus: { $in: ["IN_PROGRESS", "VERIFYING"] },
      scheduledEnd: { $lte: now },
    })
    .toArray();

  let reminded = 0;
  for (const maintenance of reminderCandidates) {
    if (await sendMaintenanceReminder(maintenance, now)) reminded += 1;
  }
  let started = 0;
  for (const maintenance of toStart) {
    if (await transitionMaintenance({
      incidentId: maintenance._id.toHexString(),
      expectedStatus: "SCHEDULED",
      status: "IN_PROGRESS",
      body: "This scheduled maintenance window has started automatically.",
      notify: maintenance.notifySubscribers,
    })) started += 1;
  }
  let completed = 0;
  for (const maintenance of toComplete) {
    if (await transitionMaintenance({
      incidentId: maintenance._id.toHexString(),
      expectedStatus: maintenance.maintenanceStatus ?? undefined,
      status: "COMPLETED",
      body: "This scheduled maintenance window has completed automatically.",
      notify: maintenance.notifySubscribers,
    })) completed += 1;
  }
  return {
    reminded,
    started,
    completed,
  };
}
