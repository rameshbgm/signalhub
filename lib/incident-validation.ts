import { z } from "zod";
import { isDatabaseId } from "@/lib/database-id-validation";
import { COMPONENT_STATUSES, IMPACTS, INCIDENT_STATUSES } from "@/lib/status";

const databaseIdString = z.string().refine(isDatabaseId, "Malformed identifier");
const incidentInputObjectSchema = z.object({
  pageId: databaseIdString,
  name: z.string().trim().min(1).max(200),
  status: z.enum(INCIDENT_STATUSES),
  impact: z.enum(IMPACTS),
  body: z.string().trim().min(1).max(20_000),
  notify: z.boolean().default(true),
  pageWide: z.boolean().default(false),
  components: z.array(z.object({ componentId: databaseIdString, status: z.enum(COMPONENT_STATUSES) })).default([]),
  createdAt: z.date().optional(),
  backfilled: z.boolean().default(false),
});

function stateSchema(creating: boolean) {
  return incidentInputObjectSchema.superRefine((value, context) => {
    // Deleted services can leave a resolved incident with no remaining links. Text corrections must still work.
    if (!value.pageWide && value.components.length === 0 && (creating || value.status !== "RESOLVED")) {
      context.addIssue({ code: "custom", path: ["components"], message: "Select at least one component or explicitly mark the incident page-wide" });
    }
    if (new Set(value.components.map((item) => item.componentId)).size !== value.components.length) {
      context.addIssue({ code: "custom", path: ["components"], message: "Components must be unique" });
    }
    if (creating && value.status === "RESOLVED" && !value.backfilled) {
      context.addIssue({ code: "custom", path: ["backfilled"], message: "Create a resolved incident as a backfill of a past incident" });
    }
    if (value.backfilled && value.status !== "RESOLVED") {
      context.addIssue({ code: "custom", path: ["status"], message: "A backfilled incident must be resolved" });
    }
    if (value.backfilled && value.notify) {
      context.addIssue({ code: "custom", path: ["notify"], message: "Backfilled incidents cannot notify subscribers" });
    }
    if (value.status !== "RESOLVED") {
      if (value.components.some((component) => component.status === "UNDER_MAINTENANCE")) {
        context.addIssue({ code: "custom", path: ["components"], message: "Use a maintenance window for services under maintenance" });
      }
      if (value.impact === "NONE" && value.components.some((component) => component.status !== "OPERATIONAL")) {
        context.addIssue({ code: "custom", path: ["impact"], message: "An incident with no impact cannot put services into an outage status" });
      }
      if (!value.pageWide && value.impact !== "NONE" && value.status !== "MONITORING" && value.components.length && value.components.every((component) => component.status === "OPERATIONAL")) {
        context.addIssue({ code: "custom", path: ["components"], message: "Select an affected service status, or use Monitoring once services have recovered" });
      }
    }
  });
}

export const createIncidentInputSchema = stateSchema(true);
export const editIncidentInputSchema = stateSchema(false);
export type CreateIncidentInput = z.input<typeof createIncidentInputSchema>;

type IncidentScope = { status: string; pageWide: boolean; impact: string; backfilled: boolean; components: { componentId: string; status: string }[] };

/** Resolved edits correct prose while preserving lifecycle and historical scope. */
export function assertIncidentEditAllowed(current: IncidentScope, next: IncidentScope & { notify?: boolean }) {
  if (current.status === "RESOLVED") {
    if (next.status !== "RESOLVED") throw new Error("Resolved incidents cannot be reopened by editing. Create a new incident for a recurrence.");
    if (next.impact !== current.impact) throw new Error("The historical impact of a resolved incident is locked");
    if (next.notify) throw new Error("Resolved incident corrections cannot send incident notifications. Use a postmortem for follow-up.");
  }
  if (next.backfilled !== current.backfilled) throw new Error("Backfill history is locked after an incident is created");
  if (current.status === "RESOLVED" || next.status === "RESOLVED") {
    const sameScope = current.pageWide === next.pageWide && current.components.length === next.components.length &&
      current.components.every((component) => next.components.some((candidate) => candidate.componentId === component.componentId && candidate.status === component.status));
    if (!sameScope) throw new Error("Affected services and their incident statuses are locked when resolving or editing a resolved incident");
  }
}

export function assertTimelineEditAllowed(currentIncidentStatus: string, savedUpdateStatus: string, nextUpdateStatus: string, newest: boolean) {
  if (currentIncidentStatus === "RESOLVED" && nextUpdateStatus !== savedUpdateStatus) {
    throw new Error("Timeline statuses are locked after resolution. You can correct the message only.");
  }
  // A historical entry cannot introduce/remove a resolution boundary; only the latest entry owns lifecycle transitions.
  if (!newest && (savedUpdateStatus === "RESOLVED") !== (nextUpdateStatus === "RESOLVED")) {
    throw new Error("A historical timeline edit cannot change when an incident was resolved");
  }
}
