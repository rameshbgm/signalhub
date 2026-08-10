import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("announcement management", () => {
  it("supports editing existing announcements from the content screen", () => {
    const editorSource = readFileSync("components/admin/DesignEditor.tsx", "utf8");
    const actionSource = readFileSync(
      "app/admin/(protected)/pages/[pageId]/design/actions.ts",
      "utf8"
    );

    expect(editorSource).toContain("startEdit(announcement)");
    expect(editorSource).toContain('"Edit announcement"');
    expect(editorSource).toContain("await updateAnnouncement(pageId, editingId, input)");
    expect(actionSource).toContain("export async function updateAnnouncement");
    expect(actionSource).toContain("Announcement not found");
  });

  it("warns before deleting an announcement", () => {
    const editorSource = readFileSync("components/admin/DesignEditor.tsx", "utf8");
    expect(editorSource).toContain("window.confirm");
    expect(editorSource).toContain("This action cannot be undone.");
  });
});
