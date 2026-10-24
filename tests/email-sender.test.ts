import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgresql://signalhub:signalhub@127.0.0.1:5432/status_unit_tests";

const { senderAddress, smtpDeliveryError } = await import("../worker/notifications");

describe("SMTP failure classification", () => {
  const smtpError = (message: string, responseCode?: number) => Object.assign(new Error(message), { responseCode });

  it("treats a refused recipient as a permanent hard bounce", () => {
    const failure = smtpDeliveryError(smtpError("Message failed: 554 5.7.1 Recipient domain is reserved", 554));
    expect(failure.transient).toBe(false);
    expect(failure.recipientRejected).toBe(true);
    expect(failure.responseStatus).toBe(554);
  });

  it("does not quarantine on permanent failures unrelated to the recipient", () => {
    const failure = smtpDeliveryError(smtpError("535 Authentication credentials invalid", 535));
    expect(failure.transient).toBe(false);
    expect(failure.recipientRejected).toBe(false);
  });

  it("retries temporary failures and connection errors", () => {
    expect(smtpDeliveryError(smtpError("451 4.3.0 Try again later", 451)).transient).toBe(true);
    expect(smtpDeliveryError(smtpError("connect ECONNREFUSED 127.0.0.1:587")).transient).toBe(true);
  });
});

describe("email sender address", () => {
  it("keeps the configured sender when the page sets no display name", () => {
    expect(senderAddress(null, "SignalHub <status@example.com>")).toBe("SignalHub <status@example.com>");
  });

  it("swaps only the display name, keeping the authenticated mailbox", () => {
    expect(senderAddress("Acme Status", "SignalHub <status@example.com>")).toEqual({ name: "Acme Status", address: "status@example.com" });
    expect(senderAddress("Acme Status", "status@example.com")).toEqual({ name: "Acme Status", address: "status@example.com" });
  });
});
