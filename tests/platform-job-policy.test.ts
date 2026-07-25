import { describe, expect, it } from "vitest";
import { organizationPurgeCanBeCancelled } from "../lib/platform-job-policy";

describe("organization purge cancellation policy", () => {
  it("allows only a never-started queued purge", () => {
    expect(
      organizationPurgeCanBeCancelled({
        type: "PURGE_ORGANIZATION",
        status: "QUEUED",
        attempts: 0,
        startedAt: null,
      })
    ).toBe(true);
  });

  it.each([
    ["PROCESSING", 1, new Date()],
    ["QUEUED", 1, new Date()],
    ["FAILED", 5, new Date()],
    ["CANCELLED", 0, null],
  ] as const)(
    "rejects %s jobs after any processing or terminal transition",
    (status, attempts, startedAt) => {
      expect(
        organizationPurgeCanBeCancelled({
          type: "PURGE_ORGANIZATION",
          status,
          attempts,
          startedAt,
        })
      ).toBe(false);
    }
  );
});
