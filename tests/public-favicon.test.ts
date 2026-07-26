import { describe, expect, it } from "vitest";
import { publicFaviconMetadata } from "@/lib/public-favicon";

describe("public favicon metadata", () => {
  it("publishes standard and shortcut icons for every public sub-route", () => {
    expect(publicFaviconMetadata("/api/assets/favicon-id")).toEqual({
      icons: {
        icon: [{ url: "/api/assets/favicon-id" }],
        shortcut: ["/api/assets/favicon-id"],
      },
    });
  });

  it("does not emit an icon before one is uploaded", () => {
    expect(publicFaviconMetadata(null)).toEqual({});
  });
});
