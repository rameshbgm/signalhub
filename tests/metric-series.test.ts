import { describe, expect, it } from "vitest";
import { classifyFailure } from "../lib/failure-kind";

describe("classifyFailure", () => {
  it.each([
    ["This operation was aborted due to timeout", "timeout"],
    ["TCP check timed out", "timeout"],
    ["getaddrinfo ENOTFOUND internal-db.corp.example", "dns"],
    ["No A records found", "dns"],
    ["unable to verify the first certificate", "tls"],
    ["connect ECONNREFUSED 10.0.0.5:5432", "refused"],
    ["Expected 200-299, received 404", "other"],
    [null, "other"],
  ])("%s -> %s", (error, kind) => {
    expect(classifyFailure(error)).toBe(kind);
  });

  it("returns only a category, never the message", () => {
    expect(classifyFailure("connect ECONNREFUSED 10.0.0.5:5432")).not.toContain("10.0.0.5");
  });
});
