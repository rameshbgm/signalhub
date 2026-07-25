import { describe, expect, it } from "vitest";
import { publicAppUrl } from "../lib/url";

describe("publicAppUrl", () => {
  it("normalizes a configured external URL", () => {
    expect(
      publicAppUrl({
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://status.example.com/",
      })
    ).toBe("https://status.example.com");
  });

  it("refuses to generate localhost invitations from missing production config", () => {
    expect(() =>
      publicAppUrl({
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: undefined,
      })
    ).toThrow(/NEXT_PUBLIC_APP_URL/);
  });

  it("keeps the local default available outside production", () => {
    expect(
      publicAppUrl({
        NODE_ENV: "development",
        NEXT_PUBLIC_APP_URL: undefined,
      })
    ).toBe("http://localhost:3301");
  });

  it("rejects query strings and fragments that would corrupt invitation paths", () => {
    expect(() =>
      publicAppUrl({
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://status.example.com/?tenant=one",
      })
    ).toThrow(/NEXT_PUBLIC_APP_URL/);
  });
});
