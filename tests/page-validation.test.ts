import { describe, expect, it } from "vitest";
import { validatedExternalUrl, validatedLayout } from "../lib/page-validation";

describe("page settings validation", () => {
  it("accepts each curated page layout and normalizes legacy layouts", () => {
    expect(validatedLayout("BANNER_SPOTLIGHT")).toBe("BANNER_SPOTLIGHT");
    expect(validatedLayout("COVER")).toBe("ILLUSTRATED_HERO");
    expect(validatedLayout("unknown")).toBe("CENTERED_SUMMARY");
  });

  it("accepts absolute HTTP(S) and mailto support URLs", () => {
    expect(validatedExternalUrl("https://support.example.com", { allowMailto: true })).toBe("https://support.example.com/");
    expect(validatedExternalUrl("mailto:help@example.com", { allowMailto: true })).toBe("mailto:help@example.com");
  });

  it("rejects relative, executable, and credential-bearing URLs", () => {
    for (const value of ["support.example.com", "/support", "javascript:alert(1)", "https://user:secret@example.com"]) {
      expect(() => validatedExternalUrl(value, { allowMailto: true, label: "Support URL" })).toThrow(
        "Support URL must be an absolute HTTP(S) or mailto URL"
      );
    }
  });
});
