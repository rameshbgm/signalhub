import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgresql://signalhub:signalhub@127.0.0.1:5432/status_unit_tests";

const { withSubscriptionFooter } = await import("../lib/notify");
const { isSubscriptionToken, maskContact } = await import("../lib/subscriptions");
const { subscriptionFooter } = await import("../worker/notifications");

describe("subscription footer", () => {
  const links = {
    manage: "https://status.example.com/acme/subscription/tok_abcdefghijklmnopqrstuvwxyz0123456",
    unsubscribe: "https://status.example.com/api/v1/subscribe/unsubscribe/tok_abcdefghijklmnopqrstuvwxyz0123456",
  };

  it("round-trips: notify appends the links and the worker splits them back out", () => {
    const body = withSubscriptionFooter("We are investigating elevated errors.\n\nNext update in 30 minutes.", links);
    expect(body).toContain(links.manage);
    expect(body).toContain(links.unsubscribe);
    const parsed = subscriptionFooter(body);
    expect(parsed.manage).toBe(links.manage);
    expect(parsed.unsubscribe).toBe(links.unsubscribe);
    expect(parsed.content).toBe("We are investigating elevated errors.\n\nNext update in 30 minutes.");
  });

  it("leaves bodies without links untouched", () => {
    expect(withSubscriptionFooter("Body", null)).toBe("Body");
    expect(subscriptionFooter("Body")).toEqual({ content: "Body", manage: null, unsubscribe: null });
  });
});

describe("subscription helpers", () => {
  it("masks contacts shown on a page reachable by link", () => {
    expect(maskContact("jane@example.com")).toBe("j•••@example.com");
    expect(maskContact("+14155550123")).toBe("•••0123");
  });

  it("accepts only well-formed tokens", () => {
    expect(isSubscriptionToken("a".repeat(43))).toBe(true);
    expect(isSubscriptionToken("short")).toBe(false);
    expect(isSubscriptionToken("../../etc/passwd-aaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBe(false);
  });
});
