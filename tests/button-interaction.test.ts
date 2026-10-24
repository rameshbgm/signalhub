import { describe, expect, it } from "vitest";
import {
  BUTTON_ACTION_TIMEOUT_MS,
  BUTTON_INTERACTION_LOCK_MS,
  getButtonBusyMode,
} from "@/components/ButtonInteractionGuard";

describe("button interaction behavior", () => {
  it("uses a short lock for ordinary UI controls", () => {
    expect(getButtonBusyMode({ isSubmit: false, text: "Close" })).toBe("interaction");
    expect(BUTTON_INTERACTION_LOCK_MS).toBeLessThan(BUTTON_ACTION_TIMEOUT_MS);
  });

  it("shows saving feedback for mutation labels", () => {
    for (const text of ["Save settings", "Create page", "Delete monitor", "Retry delivery"]) {
      expect(getButtonBusyMode({ isSubmit: false, text })).toBe("saving");
    }
  });

  it("shows loading feedback for navigation and test labels", () => {
    for (const text of ["Continue", "Sign in", "Test connection", "Export results"]) {
      expect(getButtonBusyMode({ isSubmit: false, text })).toBe("loading");
    }
  });

  it("treats every submit button as a long-running action", () => {
    expect(getButtonBusyMode({ isSubmit: true, text: "Search" })).toBe("loading");
  });

  it("honors an explicit mode for exceptional controls", () => {
    expect(
      getButtonBusyMode({ explicitMode: "saving", isSubmit: false, text: "Deploy" })
    ).toBe("saving");
  });
});
