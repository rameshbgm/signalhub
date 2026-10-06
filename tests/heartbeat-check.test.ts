import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgresql://signalhub:signalhub@127.0.0.1:5432/status_unit_tests";

const { heartbeatCheck } = await import("../worker/checks");

describe("heartbeat check", () => {
  const base = { intervalSec: 60, heartbeatGraceSec: 30 };

  it("gives a new monitor a full interval plus grace before reporting it down", () => {
    expect(heartbeatCheck({ ...base, lastHeartbeatAt: null, createdAt: new Date() }).ok).toBe(true);
    const old = heartbeatCheck({ ...base, lastHeartbeatAt: null, createdAt: new Date(Date.now() - 120_000) });
    expect(old.ok).toBe(false);
    expect(old.error).toBe("No heartbeat received");
  });

  it("measures staleness from the last heartbeat once one has arrived", () => {
    expect(heartbeatCheck({ ...base, lastHeartbeatAt: new Date(Date.now() - 10_000), createdAt: new Date(0) }).ok).toBe(true);
    const stale = heartbeatCheck({ ...base, lastHeartbeatAt: new Date(Date.now() - 200_000), createdAt: new Date(0) });
    expect(stale.ok).toBe(false);
    expect(stale.error).toMatch(/Heartbeat is \d+ seconds old/);
  });
});
