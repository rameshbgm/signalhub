import { z } from "zod";
import { INCIDENT_STATUSES } from "@/lib/status";

export const incidentUpdateInputSchema = z.object({
  status: z.enum(INCIDENT_STATUSES),
  body: z.string().trim().min(1).max(20_000),
  notify: z.boolean().default(true),
});

export const incidentUpdateEditInputSchema = incidentUpdateInputSchema.omit({
  notify: true,
});
