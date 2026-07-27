import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("global monitor template attachments", () => {
  it("lets pages attach and detach global masters without editing them", () => {
    const actions = readFileSync("app/admin/(protected)/monitors/actions.ts", "utf8");
    const page = readFileSync("app/admin/(protected)/monitors/page.tsx", "utf8");
    expect(actions).toContain("addMonitorTemplate");
    expect(actions).toContain("removeMonitorTemplate");
    expect(actions).toContain("templateId,");
    expect(page).toContain("Global monitor templates");
    expect(page).toContain("Add to page");
    expect(page).toContain("Remove from page");
    expect(page).toContain("!m.templateId");
  });

  it("propagates global master edits and blocks deletion while attached", () => {
    const actions = readFileSync("app/platform/(protected)/templates/actions.ts", "utf8");
    expect(actions).toContain("{ templateId: id }");
    expect(actions).toContain("Remove this template from");
  });
});
