import { describe, expect, it } from "vitest";
import {
  AdminAuthError,
  isPlatformAuthenticationError,
} from "../lib/admin-auth-error";

describe("platform layout authentication errors", () => {
  it("redirects only typed authentication and authorization failures", () => {
    expect(
      isPlatformAuthenticationError(
        new AdminAuthError("Not authenticated", 401, "UNAUTHENTICATED")
      )
    ).toBe(true);
    expect(
      isPlatformAuthenticationError(
        new AdminAuthError("Not authorized", 403, "FORBIDDEN")
      )
    ).toBe(true);
    expect(isPlatformAuthenticationError(new Error("database unavailable"))).toBe(false);
    expect(
      isPlatformAuthenticationError(
        new AdminAuthError("Unexpected dependency state", 503, "DEPENDENCY_UNAVAILABLE")
      )
    ).toBe(false);
  });
});
