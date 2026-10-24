import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("component detail settings", () => {
  it("uses a focused save form for each service", () => {
    const contentSource = readFileSync("app/admin/(protected)/pages/[pageId]/content/page.tsx", "utf8");
    const actionSource = readFileSync("app/admin/(protected)/pages/[pageId]/components-actions.ts", "utf8");
    const dialogSource = readFileSync("components/admin/ServiceEditorDialog.tsx", "utf8");
    expect(contentSource).toContain("updateComponentDetails.bind(null, pageId, component.id)");
    expect(dialogSource).toContain("Save service");
    expect(contentSource).not.toContain("page-settings-form");
    expect(actionSource).toContain("export async function updateComponentDetails");
    expect(actionSource).toContain("if (groupId) await assertGroupInPage(groupId, pageId)");
    expect(actionSource).toContain("groupId,");
  });

  it("refreshes the service list and exposes explicit edit and confirmed delete actions", () => {
    const contentSource = readFileSync("app/admin/(protected)/pages/[pageId]/content/page.tsx", "utf8");
    const statusSource = readFileSync("components/admin/ServiceStatusSelect.tsx", "utf8");
    expect(contentSource).toContain('key={components.map((component) => `${component.id}:${component.status}:${component.visible}:${component.groupId}`).join(":")}');
    expect(contentSource).toContain('trigger="icon"');
    expect(contentSource).toContain("This action cannot be undone.");
    // A draft status only reaches the server when Save is clicked.
    expect(statusSource).toContain("disabled={!dirty || pending}");
    expect(statusSource).toContain("onClick={save}");
    expect(statusSource).not.toContain("requestSubmit()");
  });

  it("manages groups from the group field and refreshes the public page after changes", () => {
    const contentSource = readFileSync("app/admin/(protected)/pages/[pageId]/content/page.tsx", "utf8");
    const pickerSource = readFileSync("components/admin/ServiceGroupSelect.tsx", "utf8");
    const actionSource = readFileSync("app/admin/(protected)/pages/[pageId]/components-actions.ts", "utf8");
    const dialogSource = readFileSync("components/admin/ServiceEditorDialog.tsx", "utf8");
    expect(contentSource).not.toContain("Service groups</CardTitle>");
    expect(dialogSource).toContain("<ServiceGroupSelect");
    expect(dialogSource).toContain("createPortal(");
    expect(pickerSource).toContain('aria-label="Manage service groups"');
    expect(pickerSource).toContain("createPortal(");
    expect(pickerSource).toContain("router.refresh()");
    // Every service and group mutation refreshes the cached public page.
    for (const action of ["createGroup", "deleteGroup", "createComponent", "updateComponentStatus", "updateComponentDetails", "deleteComponent"]) {
      const body = actionSource.slice(actionSource.indexOf(`export async function ${action}`));
      expect(body.slice(0, body.indexOf("\n}\n"))).toContain("revalidatePageSurfaces(page)");
    }
  });
});
