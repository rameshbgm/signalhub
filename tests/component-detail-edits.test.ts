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
    expect(contentSource).toContain("updateComponentDetails.bind(null, pageId, component.id)");
    expect(contentSource).toContain("Save service");
    expect(contentSource).not.toContain("page-settings-form");
    expect(actionSource).toContain("export async function updateComponentDetails");
    expect(actionSource).toContain("groupId: groupId ? oid(groupId) : null");
  });
});
