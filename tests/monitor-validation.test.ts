import { describe, expect, it } from "vitest";
import {
  isExpectedStatus,
  normalizeMonitorConfiguration,
  parseExpectedStatusRange,
} from "../lib/monitor-validation";

function configuration(
  overrides: Partial<Parameters<typeof normalizeMonitorConfiguration>[0]> = {}
) {
  return {
    type: "HTTP" as const,
    target: "https://status.example.test/health",
    port: null,
    expectedStatusRange: "200-299",
    keywordMatch: null,
    keywordAbsent: null,
    ...overrides,
  };
}

describe("monitor configuration validation", () => {
  it("accepts ordered HTTP status ranges and checks their bounds", () => {
    expect(parseExpectedStatusRange(" 200-299 ")).toEqual({
      minimum: 200,
      maximum: 299,
      normalized: "200-299",
    });
    expect(isExpectedStatus("200-299", 204)).toBe(true);
    expect(isExpectedStatus("200-299", 404)).toBe(false);
  });

  it.each([
    ["200", "must look like"],
    ["299-200", "start at or below"],
    ["099-200", "between 100 and 599"],
    ["200-600", "between 100 and 599"],
  ])("rejects invalid status range %s", (range, message) => {
    expect(() => parseExpectedStatusRange(range)).toThrow(message);
  });

  it("requires a valid HTTP URL for HTTP and keyword checks", () => {
    expect(() =>
      normalizeMonitorConfiguration(configuration({ target: "example.test" }))
    ).toThrow("valid URLs");
    expect(() =>
      normalizeMonitorConfiguration(
        configuration({ type: "KEYWORD", target: "ftp://example.test" })
      )
    ).toThrow("HTTP or HTTPS");
  });

  it("requires a keyword assertion for KEYWORD monitors", () => {
    expect(() =>
      normalizeMonitorConfiguration(configuration({ type: "KEYWORD" }))
    ).toThrow("require a keyword");
    expect(
      normalizeMonitorConfiguration(
        configuration({ type: "KEYWORD", keywordMatch: "healthy" })
      ).keywordMatch
    ).toBe("healthy");
  });

  it("requires TCP ports and enforces their numeric bounds", () => {
    expect(() =>
      normalizeMonitorConfiguration(
        configuration({ type: "TCP", target: "example.test" })
      )
    ).toThrow("require a port");
    expect(() =>
      normalizeMonitorConfiguration(
        configuration({ type: "TCP", target: "example.test", port: 65_536 })
      )
    ).toThrow("between 1 and 65535");
  });

  it("normalizes target-less heartbeat templates to a runtime-safe sentinel", () => {
    const heartbeat = normalizeMonitorConfiguration(
      configuration({
        type: "HEARTBEAT",
        target: "",
      })
    );
    expect(heartbeat.target).toBe("heartbeat");
  });
});
