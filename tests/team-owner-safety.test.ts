import { describe, expect, it } from "vitest";
import {
  isActiveOwner,
  transitionRemovesActiveOwner,
} from "../lib/team-owner-safety";

describe("tenant team Owner invariant", () => {
  it("counts active and legacy Owners, but not pending or revoked memberships", () => {
    expect(isActiveOwner({ role: "OWNER" })).toBe(true);
    expect(isActiveOwner({ role: "OWNER", status: "ACTIVE" })).toBe(true);
    expect(isActiveOwner({ role: "OWNER", status: "INVITED" })).toBe(false);
    expect(isActiveOwner({ role: "OWNER", status: "REVOKED" })).toBe(false);
    expect(isActiveOwner({ role: "ADMIN", status: "ACTIVE" })).toBe(false);
  });

  it("detects both demotion and revocation of an active Owner", () => {
    expect(
      transitionRemovesActiveOwner(
        { role: "OWNER", status: "ACTIVE" },
        { role: "ADMIN" }
      )
    ).toBe(true);
    expect(
      transitionRemovesActiveOwner(
        { role: "OWNER", status: "INVITED" },
        { status: "REVOKED" }
      )
    ).toBe(false);
    expect(
      transitionRemovesActiveOwner(
        { role: "OWNER", status: "REVOKED" },
        { role: "ADMIN" }
      )
    ).toBe(false);
    expect(
      transitionRemovesActiveOwner(
        { role: "ADMIN", status: "ACTIVE" },
        { role: "OWNER" }
      )
    ).toBe(false);
  });
});
