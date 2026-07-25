import { afterEach, describe, expect, it, vi } from "vitest";
import { startLeaseHeartbeat } from "../worker/lease-heartbeat";

describe("platform job lease heartbeat", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renews repeatedly during work that outlives one renewal interval", async () => {
    vi.useFakeTimers();
    const renew = vi.fn(async () => undefined);
    const heartbeat = startLeaseHeartbeat(renew, 1_000);

    await vi.advanceTimersByTimeAsync(3_500);

    expect(renew).toHaveBeenCalledTimes(3);
    await heartbeat.stop();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(renew).toHaveBeenCalledTimes(3);
  });

  it("continues scheduling after a transient renewal failure", async () => {
    vi.useFakeTimers();
    const renew = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("temporary database error"))
      .mockResolvedValue(undefined);
    const heartbeat = startLeaseHeartbeat(renew, 1_000);

    await vi.advanceTimersByTimeAsync(2_500);

    expect(renew).toHaveBeenCalledTimes(2);
    await heartbeat.stop();
  });
});
