import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { incidentUpdateEditInputSchema } from "../lib/incident-update-validation";

describe("incident timeline update editing", () => {
  it("validates and trims editable timeline content", () => {
    expect(
      incidentUpdateEditInputSchema.parse({
        status: "MONITORING",
        body: "  Recovery is holding.  ",
      })
    ).toEqual({ status: "MONITORING", body: "Recovery is holding." });

    expect(
      incidentUpdateEditInputSchema.safeParse({
        status: "UNKNOWN",
        body: "Message",
      }).success
    ).toBe(false);
    expect(
      incidentUpdateEditInputSchema.safeParse({
        status: "INVESTIGATING",
        body: "   ",
      }).success
    ).toBe(false);
  });

  it("keeps edits fenced, reconciles the newest status, and revalidates public routes", () => {
    const source = readFileSync(
      "app/admin/(protected)/incidents/actions.ts",
      "utf8"
    );
    const start = source.indexOf("export async function editIncidentUpdate");
    const end = source.indexOf("\nexport async function ", start + 1);
    const action = source.slice(start, end < 0 ? undefined : end);

    expect(action).toContain("withTransaction(");
    expect(action).toContain("fenceActiveOrganizationMutation(");
    expect(action).toContain("newest?._id.equals(update._id)");
    expect(action).toContain("reconcileComponents(");
    expect(action).toContain('revalidatePath(`/${result.slug}`, "layout")');
  });
});
