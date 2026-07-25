import { describe, expect, it } from "vitest";
import {
  assertDevelopmentSeedEnabled,
  generateDevelopmentPassword,
} from "../scripts/dev-seed";

describe("development sample seeds", () => {
  it("requires an explicit opt-in", () => {
    expect(() =>
      assertDevelopmentSeedEnabled("Sample seed", {
        NODE_ENV: "development",
        ALLOW_DEV_SEED: "false",
      })
    ).toThrow("opt-in");
  });

  it("requires the runtime mode to be explicitly development or test", () => {
    expect(() =>
      assertDevelopmentSeedEnabled("Sample seed", {
        NODE_ENV: undefined,
        ALLOW_DEV_SEED: "true",
      })
    ).toThrow("NODE_ENV=unset");
  });

  it("always refuses production, even when the opt-in flag is present", () => {
    expect(() =>
      assertDevelopmentSeedEnabled("Sample seed", {
        NODE_ENV: "production",
        ALLOW_DEV_SEED: "true",
      })
    ).toThrow("development/test-only");
  });

  it("allows explicitly opted-in development and test runs", () => {
    expect(() =>
      assertDevelopmentSeedEnabled("Sample seed", {
        NODE_ENV: "development",
        ALLOW_DEV_SEED: "true",
      })
    ).not.toThrow();
    expect(() =>
      assertDevelopmentSeedEnabled("Sample seed", {
        NODE_ENV: "test",
        ALLOW_DEV_SEED: "true",
      })
    ).not.toThrow();
  });

  it("generates unique strong passwords instead of shared fixtures", () => {
    const first = generateDevelopmentPassword();
    const second = generateDevelopmentPassword();

    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(24);
    expect(first).toMatch(/[A-Z]/);
    expect(first).toMatch(/[a-z]/);
    expect(first).toMatch(/[0-9]/);
    expect(first).toContain("!");
  });
});
