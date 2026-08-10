import { z } from "zod";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/lib/postgres/client";
import { dispatchNotifications } from "@/lib/notify";
import { isDatabaseId } from "@/lib/database-id";
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

const databaseIdString = z.string().refine(isDatabaseId, "Malformed identifier");

const incidentComponentInputSchema = z.object({
  componentId: databaseIdString,
  status: z.enum(COMPONENT_STATUSES),
});

export const createIncidentInputSchema = z
  .object({
    pageId: databaseIdString,
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
}, executor: DatabaseExecutor) {
  const page = await executor
    .selectFrom("pages")
    .selectAll()
    .where("id", "=", input.pageId)
    .where("orgId", "=", input.orgId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!page) throw new Error("Page not found in your organization");
  if (input.componentIds.length) {
    const components = await executor
      .selectFrom("components")
      .select("id")
      .where("id", "in", input.componentIds)
      .where("pageId", "=", input.pageId)
      .execute();
    if (components.length !== input.componentIds.length) {
      throw new Error("One or more components do not belong to this page");
    }
  }
  return page;
}

export async function createIncident(orgId: string, rawInput: CreateIncidentInput) {
  const input = createIncidentInputSchema.parse(rawInput);
  const createdAt = input.createdAt ?? new Date();
  return withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(orgId, transaction);
    await validatePageAndComponents({
      pageId: input.pageId,
      orgId,
      componentIds: input.components.map((item) => item.componentId),
    }, transaction);
    const incident = await transaction
      .insertInto("incidents")
      .values({
        pageId: input.pageId,
        name: input.name,
        status: input.status,
        impact: input.impact,
        pageWide: input.pageWide,
        isMaintenance: false,
        maintenanceStatus: null,
        scheduledStart: null,
        scheduledEnd: null,
        autoTransition: false,
        reminderMinutesBefore: null,
        reminderSentAt: null,
        notifySubscribers: input.notify,
        postmortemBody: null,
        postmortemPublishedAt: null,
        createdAt,
        resolvedAt: input.status === "RESOLVED" ? createdAt : null,
        backfilled: input.backfilled,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    const links = input.components.length
      ? await transaction
          .insertInto("incidentComponents")
          .values(input.components.map((component) => ({
            incidentId: incident.id,
            componentId: component.componentId,
            newStatus: component.status,
          })))
          .returningAll()
          .execute()
      : [];
    const update = await transaction
      .insertInto("incidentUpdates")
      .values({
        incidentId: incident.id,
        status: input.status,
        body: input.body,
        createdAt,
        notified: input.notify && !input.backfilled,
        editedAt: null,
        editedBy: null,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    if (input.status !== "RESOLVED") {
      await reconcileComponents(links.map((link) => link.componentId), transaction);
    }
    if (input.notify && !input.backfilled) {
      await dispatchNotifications({
        pageId: input.pageId,
        subject: `[Incident] ${input.name}`,
        body: input.body,
        eventType: "incident.created",
        eventId: update.id,
        componentIds: input.components.map((component) => component.componentId),
      }, transaction);
    }
    return { ...incident, components: links };
  });
}

export async function addIncidentUpdate(
  orgId: string,
  incidentId: string,
  rawInput: z.input<typeof incidentUpdateInputSchema>
) {
  const input = incidentUpdateInputSchema.parse(rawInput);
  return withDatabaseTransaction(async (transaction) => {
    const incident = await transaction
      .selectFrom("incidents as incident")
      .innerJoin("pages as page", "page.id", "incident.pageId")
      .select([
        "incident.id",
        "incident.pageId",
        "incident.name",
        "page.orgId",
      ])
      .where("incident.id", "=", incidentId)
      .where("incident.isMaintenance", "=", false)
      .where("page.orgId", "=", orgId)
      .where("page.deletedAt", "is", null)
      .forUpdate("incident")
      .executeTakeFirst();
    if (!incident) throw new Error("Incident not found");
    await fenceActiveOrganizationMutation(orgId, transaction);
    const links = await transaction
      .selectFrom("incidentComponents")
      .selectAll()
      .where("incidentId", "=", incident.id)
      .execute();
    const now = new Date();
    await transaction
      .updateTable("incidents")
      .set({ status: input.status, resolvedAt: input.status === "RESOLVED" ? now : null })
      .where("id", "=", incident.id)
      .execute();
    const update = await transaction
      .insertInto("incidentUpdates")
      .values({
        incidentId: incident.id,
        status: input.status,
        body: input.body,
        createdAt: now,
        notified: input.notify,
        editedAt: null,
        editedBy: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await reconcileComponents(links.map((link) => link.componentId), transaction);
    if (input.notify) {
      await dispatchNotifications({
        pageId: incident.pageId,
        subject: `[${input.status}] ${incident.name}`,
        body: input.body,
        eventType: input.status === "RESOLVED" ? "incident.resolved" : "incident.updated",
        eventId: update.id,
        componentIds: links.map((link) => link.componentId),
      }, transaction);
    }
    return { id: update.id, ...input, createdAt: now };
  });
}

export async function deleteIncident(orgId: string, incidentId: string) {
  return withDatabaseTransaction(async (transaction) => {
    const incident = await transaction
      .selectFrom("incidents as incident")
      .innerJoin("pages as page", "page.id", "incident.pageId")
      .select(["incident.id", "page.orgId"])
      .where("incident.id", "=", incidentId)
      .where("incident.isMaintenance", "=", false)
      .where("page.orgId", "=", orgId)
      .where("page.deletedAt", "is", null)
      .forUpdate("incident")
      .executeTakeFirst();
    if (!incident) return false;
    await fenceActiveOrganizationMutation(orgId, transaction);
    const links = await transaction
      .selectFrom("incidentComponents")
      .select("componentId")
      .where("incidentId", "=", incident.id)
      .execute();
    await transaction.deleteFrom("incidents").where("id", "=", incident.id).execute();
    await reconcileComponents(links.map((link) => link.componentId), transaction);
    return true;
  });
}
