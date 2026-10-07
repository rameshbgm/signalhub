import { describe, expect, it } from "vitest";
import { alertAction, defaultConfig, DESTINATION_CHANNELS, DESTINATION_PROVIDERS, normalizeDestinationConfig, sanitizeDestinationDefaults } from "@/lib/destination-catalog";

describe("destination catalog", () => {
  it("keeps only the fields of the chosen auth mode", () => {
    expect(normalizeDestinationConfig("SLACK", { auth: "bot", botToken: "xoxb-1", channel: "C1", url: "https://stale.example" }))
      .toEqual({ auth: "bot", botToken: "xoxb-1", channel: "C1" });
    expect(normalizeDestinationConfig("SLACK", { url: "https://hooks.slack.com/x" }))
      .toEqual({ auth: "webhook", url: "https://hooks.slack.com/x" });
  });

  it("requires the credentials of the chosen auth mode", () => {
    expect(() => normalizeDestinationConfig("NTFY", { topic: "t", auth: "basic", username: "u" })).toThrow("Password is required");
    expect(() => normalizeDestinationConfig("HTTP", { url: "https://x.example", auth: "bearer" })).toThrow("Bearer token is required");
  });

  it("rejects select values outside the options", () => {
    expect(() => normalizeDestinationConfig("PAGERDUTY", { routingKey: "k", severity: "apocalyptic" })).toThrow("unsupported value");
  });

  it("every conditional field points at a select of the same provider", () => {
    for (const channel of DESTINATION_CHANNELS) {
      const fields = DESTINATION_PROVIDERS[channel].fields;
      for (const field of fields.filter((candidate) => candidate.when)) {
        const controller = fields.find((candidate) => candidate.key === field.when!.field);
        expect(controller?.kind, `${channel}.${field.key}`).toBe("select");
        expect(controller?.defaultValue, `${channel}.${field.key}`).toBeDefined();
      }
    }
  });

  it("pages on-call only for alerting events", () => {
    expect(alertAction("incident.created")).toBe("trigger");
    expect(alertAction("monitor.recovered")).toBe("resolve");
    expect(alertAction("maintenance.scheduled")).toBeNull();
  });

  it("applies platform defaults but never secrets or invalid options", () => {
    const defaults = sanitizeDestinationDefaults({
      OPSGENIE: { region: "eu", apiKey: "leaked" },
      PAGERDUTY: { severity: "apocalyptic" },
      NTFY: { serverUrl: "https://ntfy.example.com" },
      NOPE: { x: "y" },
    });
    expect(defaults).toEqual({ OPSGENIE: { region: "eu" }, NTFY: { serverUrl: "https://ntfy.example.com" } });
    expect(defaultConfig("OPSGENIE", defaults)).toEqual({ region: "eu", priority: "P3" });
    expect(normalizeDestinationConfig("NTFY", { topic: "t" }, defaults)).toMatchObject({ serverUrl: "https://ntfy.example.com", topic: "t" });
  });
});
