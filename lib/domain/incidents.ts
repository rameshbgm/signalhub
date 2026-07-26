import { ObjectId, type ClientSession } from "mongodb";
import { z } from "zod";
import { collections, mongoClient } from "@/lib/db";
import { dispatchNotifications } from "@/lib/notify";
import { oid, toId } from "@/lib/mongo-utils";
import {
  COMPONENT_STATUSES,
  IMPACTS,
  INCIDENT_STATUSES,
} from "@/lib/status";
import { reconcileComponents } from "@/lib/component-status";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { incidentUpdateInputSchema } from "@/lib/incident-update-validation";
export {
  incidentUpdateEditInputSchema,
  incidentUpdateInputSchema,
} from "@/lib/incident-update-validation";

const objectIdString = z.string().refine(ObjectId.isValid, "Malformed identifier");

const incidentComponentInputSchema = z.object({
  componentId: objectIdString,
  status: z.enum(COMPONENT_STATUSES),
});

export const createIncidentInputSchema = z
  .object({
    pageId: objectIdString,
    name: z.string().trim().min(1).max(200),
    status: z.enum(INCIDENT_STATUSES),
    impact: z.enum(IMPACTS),
    body: z.string().trim().min(1).max(20_000),
    notify: z.boolean().default(true),
    pageWide: z.boolean().default(false),
    components: z.array(incidentComponentInputSchema).default([]),
    createdAt: z.date().optional(),
    backfilled: z.boolean().default(false),
  })
  .superRefine((value, context) => {
    if (!value.pageWide && value.components.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["components"],
        message: "Select at least one component or explicitly mark the incident page-wide",
      });
    }
    if (new Set(value.components.map((item) => item.componentId)).size !== value.components.length) {
      context.addIssue({ code: "custom", path: ["components"], message: "Components must be unique" });
    }
  });

export type CreateIncidentInput = z.input<typeof createIncidentInputSchema>;

async function validatePageAndComponents(input: {
  pageId: string;
  orgId: string;
  componentIds: string[];
}, session?: ClientSession) {
  const pageId = oid(input.pageId);
  const page = await collections.pages().findOne(
    { _id: pageId, orgId: oid(input.orgId) },
    { session }
  );
  if (!page) throw new Error("Page not found in your organization");
  if (input.componentIds.length) {
    const components = await collections
      .components()
      .find(
        { _id: { $in: input.componentIds.map(oid) }, pageId },
        { session }
      )
      .toArray();
    if (components.length !== input.componentIds.length) {
      throw new Error("One or more components do not belong to this page");
    }
  }
  return page;
}

export async function createIncident(orgId: string, rawInput: CreateIncidentInput) {
  const input = createIncidentInputSchema.parse(rawInput);
  const incidentId = new ObjectId();
  const createdAt = input.createdAt ?? new Date();
  const linkDocs = input.components.map((component) => ({
    _id: new ObjectId(),
    incidentId,
    componentId: oid(component.componentId),
    newStatus: component.status,
  }));
  const session = mongoClient.startSession();
  try {
    await session.withTransaction(async () => {
      await fenceActiveOrganizationMutation(orgId, session);
      await validatePageAndComponents(
        {
          pageId: input.pageId,
          orgId,
          componentIds: input.components.map((item) => item.componentId),
        },
        session
      );
      await collections.incidents().insertOne(
        {
          _id: incidentId,
          pageId: oid(input.pageId),
          name: input.name,
          status: input.status,
          impact: input.impact,
          pageWide: input.pageWide,
          isMaintenance: false,
          maintenanceStatus: null,
          scheduledStart: null,
          scheduledEnd: null,
          autoTransition: false,
          notifySubscribers: input.notify,
          postmortemBody: null,
          postmortemPublishedAt: null,
          createdAt,
          resolvedAt: input.status === "RESOLVED" ? createdAt : null,
          backfilled: input.backfilled,
        },
        { session }
      );
      if (linkDocs.length) await collections.incidentComponents().insertMany(linkDocs, { session });
      const updateId = new ObjectId();
      await collections.incidentUpdates().insertOne(
        {
          _id: updateId,
          incidentId,
          status: input.status,
          body: input.body,
          createdAt,
          notified: input.notify && !input.backfilled,
        },
        { session }
      );

      // A resolved/backfilled incident is history only and must not create an
      // outage interval for any linked component.
      if (input.status !== "RESOLVED") {
        await reconcileComponents(linkDocs.map((link) => link.componentId), session);
      }
      if (input.notify && !input.backfilled) {
        await dispatchNotifications(
          {
            pageId: input.pageId,
            subject: `[Incident] ${input.name}`,
            body: input.body,
            eventType: "incident.created",
            eventId: updateId.toHexString(),
            componentIds: input.components.map((component) => component.componentId),
          },
          session
        );
      }
    });
  } finally {
    await session.endSession();
  }

  const incident = await collections.incidents().findOne({ _id: incidentId });
  return { ...toId(incident!), components: linkDocs.map(toId) };
}

export async function addIncidentUpdate(
  orgId: string,
  incidentId: string,
  rawInput: z.input<typeof incidentUpdateInputSchema>
) {
  const input = incidentUpdateInputSchema.parse(rawInput);
  const incident = await collections.incidents().findOne({ _id: oid(incidentId), isMaintenance: false });
  if (!incident) throw new Error("Incident not found");
  const page = await collections.pages().findOne({ _id: incident.pageId, orgId: oid(orgId) });
  if (!page) throw new Error("Incident not found");
  const links = await collections.incidentComponents().find({ incidentId: incident._id }).toArray();
  const updateId = new ObjectId();
  const now = new Date();
  const session = mongoClient.startSession();
  try {
    await session.withTransaction(async () => {
      await fenceActiveOrganizationMutation(orgId, session);
      const result = await collections.incidents().updateOne(
        { _id: incident._id, isMaintenance: false },
        {
          $set: {
            status: input.status,
            resolvedAt: input.status === "RESOLVED" ? now : null,
          },
        },
        { session }
      );
      if (!result.matchedCount) throw new Error("Incident not found");
      await collections.incidentUpdates().insertOne(
        {
          _id: updateId,
          incidentId: incident._id,
          status: input.status,
          body: input.body,
          createdAt: now,
          notified: input.notify,
        },
        { session }
      );
      await reconcileComponents(links.map((link) => link.componentId), session);
      if (input.notify) {
        await dispatchNotifications(
          {
            pageId: incident.pageId.toHexString(),
            subject: `[${input.status}] ${incident.name}`,
            body: input.body,
            eventType: input.status === "RESOLVED" ? "incident.resolved" : "incident.updated",
            eventId: updateId.toHexString(),
            componentIds: links.map((link) => link.componentId.toHexString()),
          },
          session
        );
      }
    });
  } finally {
    await session.endSession();
  }
  return { id: updateId.toHexString(), ...input, createdAt: now };
}

export async function deleteIncident(orgId: string, incidentId: string) {
  const incident = await collections.incidents().findOne({ _id: oid(incidentId), isMaintenance: false });
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
