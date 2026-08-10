import { z } from "zod";
import { database, withDatabaseTransaction } from "@/lib/postgres/client";
import type { IncidentRow } from "@/lib/postgres/schema";
import { reconcileComponents } from "@/lib/component-status";
import { dispatchNotifications } from "@/lib/notify";
import { isDatabaseId } from "@/lib/database-id";
import { MAINTENANCE_STATUSES } from "@/lib/status";
import {
  fenceActiveOrganizationMutation,
  OrganizationMutationBlockedError,
} from "@/lib/organization-mutation";

const databaseId = z.string().refine(isDatabaseId, "Malformed identifier");
const MIN_REMINDER_MINUTES = 5;
const MAX_REMINDER_MINUTES = 7 * 24 * 60;

export const createMaintenanceInputSchema = z
  .object({
    pageId: databaseId,
    name: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(20_000),
    scheduledStart: z.date(),
    scheduledEnd: z.date(),
    autoTransition: z.boolean().default(true),
    notify: z.boolean().default(true),
    reminderMinutesBefore: z.number().int().min(MIN_REMINDER_MINUTES).max(MAX_REMINDER_MINUTES).nullable().default(60),
    pageWide: z.boolean().default(false),
    componentIds: z.array(databaseId).default([]),
  })
  .superRefine((value, context) => {
    if (value.scheduledStart >= value.scheduledEnd) {
      context.addIssue({ code: "custom", path: ["scheduledEnd"], message: "Maintenance end must be after its start" });
    }
    if (!value.pageWide && value.componentIds.length === 0) {
      context.addIssue({ code: "custom", path: ["componentIds"], message: "Select a component or explicitly mark maintenance page-wide" });
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
  const now = new Date();
  const created = await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(orgId, transaction);
    const page = await transaction
      .selectFrom("pages")
      .select("id")
      .where("id", "=", input.pageId)
      .where("orgId", "=", orgId)
      .where("deletedAt", "is", null)
      .forShare()
      .executeTakeFirst();
    if (!page) throw new Error("Page not found in your organization");
    if (input.componentIds.length) {
      const components = await transaction
        .selectFrom("components")
        .select("id")
        .where("pageId", "=", page.id)
        .where("id", "in", input.componentIds)
        .execute();
      if (components.length !== input.componentIds.length) {
        throw new Error("One or more components do not belong to this page");
      }
    }

    const incident = await transaction.insertInto("incidents").values({
      pageId: page.id,
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
    }).returningAll().executeTakeFirstOrThrow();
    if (input.componentIds.length) {
      await transaction.insertInto("incidentComponents").values(
        input.componentIds.map((componentId) => ({
          incidentId: incident.id,
          componentId,
          newStatus: "UNDER_MAINTENANCE",
        }))
      ).execute();
    }
    const update = await transaction.insertInto("incidentUpdates").values({
      incidentId: incident.id,
      status: "INVESTIGATING",
      body: input.body,
      createdAt: now,
      notified: input.notify,
      editedAt: null,
      editedBy: null,
    }).returning("id").executeTakeFirstOrThrow();
    if (input.notify) {
      await dispatchNotifications({
        pageId: page.id,
        subject: `[Scheduled Maintenance] ${input.name}`,
        body: input.body,
        eventType: "maintenance.scheduled",
        eventId: update.id,
        componentIds: input.componentIds,
      }, transaction);
    }
    return incident;
  });
  return created;
}

export async function transitionMaintenance(input: {
  incidentId: string;
  expectedStatus?: string;
  status: (typeof MAINTENANCE_STATUSES)[number];
  body: string;
  notify?: boolean;
}) {
  if (!MAINTENANCE_STATUSES.includes(input.status)) throw new Error("Invalid maintenance status");
  try {
    return await withDatabaseTransaction(async (transaction) => {
      const incident = await transaction
        .selectFrom("incidents as incident")
        .innerJoin("pages as page", "page.id", "incident.pageId")
        .selectAll("incident")
        .select("page.orgId")
        .where("incident.id", "=", input.incidentId)
        .where("incident.isMaintenance", "=", true)
        .where("page.deletedAt", "is", null)
        .forUpdate("incident")
        .executeTakeFirst();
      if (!incident) return false;
      await fenceActiveOrganizationMutation(incident.orgId, transaction);
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
      if (input.expectedStatus && input.expectedStatus !== currentStatus) return false;
      const links = await transaction
        .selectFrom("incidentComponents")
        .select("componentId")
        .where("incidentId", "=", incident.id)
        .execute();
      const now = new Date();
      await transaction.updateTable("incidents").set({
        maintenanceStatus: input.status,
        status: input.status === "COMPLETED" ? "RESOLVED" : "INVESTIGATING",
        resolvedAt: input.status === "COMPLETED" ? now : null,
      }).where("id", "=", incident.id).execute();
      const update = await transaction.insertInto("incidentUpdates").values({
        incidentId: incident.id,
        status: input.status === "COMPLETED" ? "RESOLVED" : "INVESTIGATING",
        body: input.body,
        createdAt: now,
        notified: Boolean(input.notify),
        editedAt: null,
        editedBy: null,
      }).returning("id").executeTakeFirstOrThrow();
      await reconcileComponents(links.map((link) => link.componentId), transaction);
      if (input.notify) {
        await dispatchNotifications({
          pageId: incident.pageId,
          subject: `[Maintenance ${input.status}] ${incident.name}`,
          body: input.body,
          eventType: `maintenance.${input.status.toLowerCase()}`,
          eventId: update.id,
          componentIds: links.map((link) => link.componentId),
        }, transaction);
      }
      return true;
    });
  } catch (error) {
    if (error instanceof OrganizationMutationBlockedError) return false;
    throw error;
  }
}

export async function deleteMaintenance(orgId: string, incidentId: string) {
  return withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(orgId, transaction);
    const incident = await transaction
      .selectFrom("incidents as incident")
      .innerJoin("pages as page", "page.id", "incident.pageId")
      .select("incident.id")
      .where("incident.id", "=", incidentId)
      .where("incident.isMaintenance", "=", true)
      .where("page.orgId", "=", orgId)
      .where("page.deletedAt", "is", null)
      .forUpdate("incident")
      .executeTakeFirst();
    if (!incident) return false;
    const links = await transaction.selectFrom("incidentComponents")
      .select("componentId").where("incidentId", "=", incident.id).execute();
    await transaction.updateTable("monitors").set({ currentIncidentId: null })
      .where("currentIncidentId", "=", incident.id).execute();
    await transaction.deleteFrom("incidents").where("id", "=", incident.id).execute();
    await reconcileComponents(links.map((link) => link.componentId), transaction);
    return true;
  });
}

export function isMaintenanceReminderDue(
  maintenance: Pick<IncidentRow, "maintenanceStatus" | "scheduledStart" | "reminderMinutesBefore" | "reminderSentAt">,
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
  ) return false;
  return maintenance.scheduledStart.getTime() - maintenance.reminderMinutesBefore! * 60_000 <= now.getTime();
}

async function sendMaintenanceReminder(maintenance: IncidentRow, now: Date) {
  if (!isMaintenanceReminderDue(maintenance, now)) return false;
  try {
    return await withDatabaseTransaction(async (transaction) => {
      const current = await transaction
        .selectFrom("incidents as incident")
        .innerJoin("pages as page", "page.id", "incident.pageId")
        .select(["incident.id", "incident.pageId", "incident.name", "incident.scheduledStart", "page.orgId"])
        .where("incident.id", "=", maintenance.id)
        .where("incident.isMaintenance", "=", true)
        .where("incident.maintenanceStatus", "=", "SCHEDULED")
        .where("incident.scheduledStart", ">", now)
        .where("incident.reminderMinutesBefore", "=", maintenance.reminderMinutesBefore)
        .where("incident.reminderSentAt", "is", null)
        .where("page.deletedAt", "is", null)
        .forUpdate("incident")
        .executeTakeFirst();
      if (!current || !current.scheduledStart) return false;
      await fenceActiveOrganizationMutation(current.orgId, transaction);
      await transaction.updateTable("incidents").set({ reminderSentAt: now })
        .where("id", "=", current.id).execute();
      const [links, initialUpdate] = await Promise.all([
        transaction.selectFrom("incidentComponents").select("componentId")
          .where("incidentId", "=", current.id).execute(),
        transaction.selectFrom("incidentUpdates").select("body")
          .where("incidentId", "=", current.id).orderBy("createdAt", "asc").limit(1).executeTakeFirst(),
      ]);
      await dispatchNotifications({
        pageId: current.pageId,
        subject: `[Maintenance Reminder] ${current.name}`,
        body: [
          `Reminder: this scheduled maintenance begins at ${current.scheduledStart.toISOString()}.`,
          initialUpdate?.body,
        ].filter(Boolean).join("\n\n"),
        eventType: "maintenance.reminder",
        eventId: `${current.id}:reminder`,
        componentIds: links.map((link) => link.componentId),
      }, transaction);
      return true;
    });
  } catch (error) {
    if (error instanceof OrganizationMutationBlockedError) return false;
    throw error;
  }
}

export async function runMaintenanceTransitions(now = new Date()) {
  const [reminderCandidates, toStart, toComplete] = await Promise.all([
    database.selectFrom("incidents").selectAll()
      .where("isMaintenance", "=", true)
      .where("maintenanceStatus", "=", "SCHEDULED")
      .where("scheduledStart", ">", now)
      .where("scheduledStart", "<=", new Date(now.getTime() + MAX_REMINDER_MINUTES * 60_000))
      .where("reminderMinutesBefore", ">=", MIN_REMINDER_MINUTES)
      .where("reminderMinutesBefore", "<=", MAX_REMINDER_MINUTES)
      .where("reminderSentAt", "is", null).execute(),
    database.selectFrom("incidents").selectAll()
      .where("isMaintenance", "=", true).where("autoTransition", "=", true)
      .where("maintenanceStatus", "=", "SCHEDULED").where("scheduledStart", "<=", now).execute(),
    database.selectFrom("incidents").selectAll()
      .where("isMaintenance", "=", true).where("autoTransition", "=", true)
      .where("maintenanceStatus", "in", ["IN_PROGRESS", "VERIFYING"])
      .where("scheduledEnd", "<=", now).execute(),
  ]);
  let reminded = 0;
  for (const maintenance of reminderCandidates) if (await sendMaintenanceReminder(maintenance, now)) reminded += 1;
  let started = 0;
  for (const maintenance of toStart) {
    if (await transitionMaintenance({
      incidentId: maintenance.id,
      expectedStatus: "SCHEDULED",
      status: "IN_PROGRESS",
      body: "This scheduled maintenance window has started automatically.",
      notify: maintenance.notifySubscribers,
    })) started += 1;
  }
  let completed = 0;
  for (const maintenance of toComplete) {
    if (await transitionMaintenance({
      incidentId: maintenance.id,
      expectedStatus: maintenance.maintenanceStatus ?? undefined,
      status: "COMPLETED",
      body: "This scheduled maintenance window has completed automatically.",
      notify: maintenance.notifySubscribers,
    })) completed += 1;
  }
  return { reminded, started, completed };
}
