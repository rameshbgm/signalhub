import { describe, expect, it } from "vitest";
import { buildStatusCards, type StatusInput } from "@/lib/platform-status";

const healthy: StatusInput = {
  organizations: { active: 3, suspended: 0 }, activeUsers: 4, databaseOk: true,
  migrations: { current: true, verified: 23, expected: 23 }, worker: { healthy: true, seen: 2 },
  platformJobsQueued: 0, deliveries: { queued: 0, processing: 0, blocked: 0, delivered: 5, deadLetter: 0 },
  smtp: { configured: true, ok: true, error: null }, email: { reason: null }, sms: { enabled: true, reason: null },
  publicUrlConfigured: true, telemetryConfigured: true,
};
const tone = (input: StatusInput, id: string) => buildStatusCards(input).find((card) => card.id === id)?.tone;

describe("platform status cards", () => {
  it("has one card per signal, in a stable order", () => {
    const cards = buildStatusCards(healthy);
    expect(new Set(cards.map((card) => card.id)).size).toBe(cards.length);
    expect(cards).toHaveLength(17);
    expect(cards.map((card) => card.id).slice(0, 3)).toEqual(["organizations", "suspended", "identities"]);
    // Related cards are adjacent: each group appears once, as one run, in whole rows of four.
    const runs = cards.map((card) => card.group).filter((group, index, all) => group !== all[index - 1]);
    expect(runs).toEqual(["organizations", "notifications", "delivery", "system", "setup"]);
    expect(cards.slice(0, 16).map((card) => card.group)).toEqual(["organizations", "notifications", "delivery", "system"].flatMap((group) => Array(4).fill(group)));
    expect(cards.filter((card) => card.group === "delivery").map((card) => card.id)).toEqual(["deadLetter", "email", "sms", "worker"]);
    // The old per-tab duplicates are single cards now.
    for (const duplicated of ["deadLetter", "migrations", "worker", "email"]) expect(cards.filter((card) => card.id === duplicated)).toHaveLength(1);
    expect(cards.every((card) => card.tone === "normal")).toBe(true);
  });

  it("names and explains every card", () => {
    for (const card of buildStatusCards(healthy)) {
      expect(card.label.length).toBeGreaterThan(8);
      expect(card.description.length).toBeGreaterThan(20);
    }
  });

  it("flags what needs attention", () => {
    expect(tone({ ...healthy, deliveries: { ...healthy.deliveries, deadLetter: 1 } }, "deadLetter")).toBe("danger");
    expect(tone({ ...healthy, databaseOk: false }, "database")).toBe("danger");
    expect(tone({ ...healthy, migrations: { current: false, verified: 22, expected: 23 } }, "migrations")).toBe("danger");
    expect(tone({ ...healthy, worker: { healthy: false, seen: 2 } }, "worker")).toBe("danger");
    expect(tone({ ...healthy, organizations: { active: 2, suspended: 1 } }, "suspended")).toBe("warn");
    expect(tone({ ...healthy, publicUrlConfigured: false }, "url")).toBe("warn");
    expect(tone({ ...healthy, smtp: { configured: false, ok: false, error: null } }, "email")).toBe("warn");
    expect(tone({ ...healthy, smtp: { configured: true, ok: false, error: "refused" } }, "email")).toBe("danger");
    expect(tone({ ...healthy, sms: { enabled: false, reason: "SMS delivery is not configured" } }, "sms")).toBe("warn");
  });

  it("explains a failing mail server instead of the generic reason", () => {
    const card = buildStatusCards({ ...healthy, smtp: { configured: true, ok: false, error: "connect ECONNREFUSED" }, email: { reason: "The delivery worker is unavailable" } }).find((entry) => entry.id === "email");
    expect(card).toMatchObject({ value: "Unavailable", detail: "connect ECONNREFUSED" });
  });
});
