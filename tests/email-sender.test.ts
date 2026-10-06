import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgresql://signalhub:signalhub@127.0.0.1:5432/status_unit_tests";

const { senderAddress } = await import("../worker/notifications");

describe("email sender address", () => {
  it("keeps the configured sender when the page sets no display name", () => {
    expect(senderAddress(null, "SignalHub <status@example.com>")).toBe("SignalHub <status@example.com>");
  });

  it("swaps only the display name, keeping the authenticated mailbox", () => {
    expect(senderAddress("Acme Status", "SignalHub <status@example.com>")).toEqual({ name: "Acme Status", address: "status@example.com" });
    expect(senderAddress("Acme Status", "status@example.com")).toEqual({ name: "Acme Status", address: "status@example.com" });
  });
});
