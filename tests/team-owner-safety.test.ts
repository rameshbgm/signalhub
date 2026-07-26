import { describe, expect, it } from "vitest";
import {
  isActiveAdmin,
  transitionRemovesActiveAdmin,
} from "@/lib/team-owner-safety";

describe("organization Admin safety", () => {
  it("recognizes active Admin memberships", () => {
    expect(isActiveAdmin({ role: "ADMIN" })).toBe(true);
    expect(isActiveAdmin({ role: "ADMIN", status: "ACTIVE" })).toBe(true);
    expect(isActiveAdmin({ role: "ADMIN", status: "INVITED" })).toBe(false);
    expect(isActiveAdmin({ role: "RESPONDER", status: "ACTIVE" })).toBe(false);
  });

  it("detects transitions that remove an active Admin", () => {
    expect(transitionRemovesActiveAdmin({ role: "ADMIN", status: "ACTIVE" }, { role: "VIEWER" })).toBe(true);
    expect(transitionRemovesActiveAdmin({ role: "ADMIN", status: "ACTIVE" }, { status: "REVOKED" })).toBe(true);
    expect(transitionRemovesActiveAdmin({ role: "VIEWER", status: "ACTIVE" }, { status: "REVOKED" })).toBe(false);
  });
});
