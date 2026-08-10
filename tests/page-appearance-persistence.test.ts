import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("page appearance persistence", () => {
  it("re-applies controlled preset and visitor-mode selections after a successful server action", () => {
    const appearance = readFileSync("components/admin/PageAppearanceForm.tsx", "utf8");
    const actionForm = readFileSync("components/platform/PlatformActionForm.tsx", "utf8");

    expect(actionForm).toContain("onSuccess?: () => void");
    expect(actionForm).toContain('if (state.status === "success") onSuccess?.()');
    expect(appearance).toContain("restoreControlledSelections");
    expect(appearance).toContain("setSavedRevision((revision) => revision + 1)");
    expect(appearance).toContain("onSuccess={restoreControlledSelections}");
  });
});
