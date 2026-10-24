import { describe, expect, it } from "vitest";
import { classifyFailure, publicFailureMessage } from "../lib/failure-kind";

describe("publicFailureMessage", () => {
  const rawErrors = [
    "connect ECONNREFUSED 10.0.4.12:5432",
    "getaddrinfo ENOTFOUND db.internal.corp",
    "connect ETIMEDOUT 192.168.1.20:443",
    "The operation was aborted due to timeout",
    "unable to verify the first certificate for vault.internal.corp",
    "Expected 200-299, received 502",
    "Heartbeat is 412 seconds old",
  ];

  it("never repeats internal addresses, hostnames, or ports from the raw error", () => {
    for (const raw of rawErrors) {
      const message = publicFailureMessage(raw);
      expect(message, raw).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
      expect(message, raw).not.toMatch(/internal|corp|:\d{2,5}|ECONN|ENOTFOUND|ETIMEDOUT/i);
    }
  });

  it("describes each failure category in customer-safe words", () => {
    expect(publicFailureMessage("connect ECONNREFUSED 10.0.4.12:5432")).toBe("Automated checks cannot connect to the service.");
    expect(publicFailureMessage("getaddrinfo ENOTFOUND db.internal.corp")).toBe("Automated checks cannot resolve the service address.");
    expect(publicFailureMessage("The operation was aborted due to timeout")).toBe("Automated checks are timing out.");
    expect(publicFailureMessage("certificate has expired")).toBe("Automated checks cannot establish a secure (TLS) connection.");
  });

  it("falls back to a generic message for unknown or missing errors", () => {
    expect(publicFailureMessage("Expected 200-299, received 502")).toBe("Automated checks are failing.");
    expect(publicFailureMessage(null)).toBe("Automated checks are failing.");
  });

  it("agrees with classifyFailure about the category", () => {
    expect(classifyFailure("connect ECONNREFUSED 10.0.4.12:5432")).toBe("refused");
  });
});
