import { describe, expect, it } from "vitest";
import { isPublicPlatformRoute } from "../lib/proxy-route-policy";

describe("platform proxy route policy", () => {
  it("allows login and token-specific invitation acceptance without a session", () => {
    expect(isPublicPlatformRoute("/platform/login")).toBe(true);
    expect(isPublicPlatformRoute("/platform/login/")).toBe(true);
    expect(isPublicPlatformRoute("/platform/invite/a-valid.token_123")).toBe(true);
    expect(isPublicPlatformRoute("/platform/invite/a-valid.token_123/")).toBe(true);
  });

  it("keeps every other platform route protected", () => {
    expect(isPublicPlatformRoute("/platform")).toBe(false);
    expect(isPublicPlatformRoute("/platform/orgs")).toBe(false);
    expect(isPublicPlatformRoute("/platform/invite")).toBe(false);
    expect(isPublicPlatformRoute("/platform/invite/token/extra")).toBe(false);
    expect(isPublicPlatformRoute("/platform/login/reset")).toBe(false);
  });
});
