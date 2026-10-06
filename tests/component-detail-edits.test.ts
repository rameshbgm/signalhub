import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseComponentDetailEdits } from "@/lib/component-detail-edits";

describe("component detail settings", () => {
  it("parses group and visibility settings for every component", () => {
    const formData = new FormData();
    formData.append("componentId", "component-one");
    formData.set("component.component-one.name", "API");
    formData.set("component.component-one.description", "Public API");
    formData.set("component.component-one.groupId", "group-one");
    formData.set("component.component-one.visible", "on");
    formData.set("component.component-one.showUptime", "on");

    expect(parseComponentDetailEdits(formData)).toEqual([
      {
        id: "component-one",
        name: "API",
        description: "Public API",
        groupId: "group-one",
        visible: true,
        showUptime: true,
      },
    ]);
  });

  it("represents an explicit no-group selection as null", () => {
    const formData = new FormData();
    formData.append("componentId", "component-two");
    formData.set("component.component-two.name", "Website");
    formData.set("component.component-two.groupId", "");
    expect(parseComponentDetailEdits(formData)[0].groupId).toBeNull();
  });

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
    expect(contentSource).toContain('key={components.map((component) => component.id).join(":")}');
    expect(contentSource).toContain('trigger="icon"');
    expect(contentSource).toContain("This action cannot be undone.");
    // Status changes save on selection, after the new value has rendered.
    expect(statusSource).toContain("requestSubmit()");
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
