import { describe, expect, it } from "vitest";
import { hasPlatformCapability, normalizedPlatformRole } from "@/lib/platform-roles";

describe("Admin platform capabilities", () => {
  it("grants every platform management capability to Admin", () => {
    expect(hasPlatformCapability("ADMIN", "audit.read")).toBe(true);
    expect(hasPlatformCapability("ADMIN", "organizations.purge")).toBe(true);
    expect(hasPlatformCapability("ADMIN", "users.disable")).toBe(true);
    expect(hasPlatformCapability("ADMIN", "configuration.manage")).toBe(true);
  });

  it("normalizes legacy missing roles to Admin during transition", () => {
    expect(normalizedPlatformRole({})).toBe("ADMIN");
  });
});
