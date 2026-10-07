import { describe, expect, it } from "vitest";
import { formatWindow, MAX_WINDOW_MINUTES, QUICK_WINDOWS, specForWindow } from "../lib/metric-ranges";

describe("specForWindow", () => {
  it("gives every quick window about 90 chart points and at most 48 calendar cells", () => {
    for (const { minutes } of QUICK_WINDOWS) {
      const spec = specForWindow(minutes);
      expect(spec.windowMs).toBe(minutes * 60_000);
      expect(spec.windowMs / 1000 / spec.bucketSec).toBeLessThanOrEqual(90);
      expect(spec.windowMs / 1000 / spec.cellSec).toBeLessThanOrEqual(48);
    }
  });

  it("never uses a zero-second bucket for a 1 minute window", () => {
    expect(specForWindow(1).bucketSec).toBeGreaterThanOrEqual(1);
  });

  it("caps calendar cells at one day for the longest window", () => {
    expect(specForWindow(MAX_WINDOW_MINUTES).cellSec).toBe(86_400);
  });
});

describe("formatWindow", () => {
  it.each([
    [1, "1 min"],
    [45, "45 min"],
    [60, "1 hour"],
    [180, "3 hours"],
    [90, "1 h 30 min"],
    [1_440, "1 day"],
    [2_880, "2 days"],
    [6_000, "4 d 4 h"],
  ])("%i minutes -> %s", (minutes, label) => {
    expect(formatWindow(minutes)).toBe(label);
  });
});
