import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseComponentDetailEdits } from "@/lib/component-detail-edits";

describe("unified page and component settings", () => {
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

  it("uses the top settings form and removes per-component detail save buttons", () => {
    const pageSource = readFileSync("app/admin/(protected)/pages/[pageId]/page.tsx", "utf8");
    const actionSource = readFileSync("app/admin/(protected)/pages/actions.ts", "utf8");
    expect(pageSource).not.toContain("Save Details");
    expect(pageSource).toContain('form="page-settings-form" name="componentId"');
    expect(pageSource).toContain("component.${c.id}.groupId");
    expect(actionSource).toContain("parseComponentDetailEdits(formData)");
    expect(actionSource).toContain("groupId: component.groupId ? oid(component.groupId) : null");
  });
});
