export const MONITOR_TYPES = [
  "HTTP",
  "KEYWORD",
  "TCP",
  "TLS",
  "ICMP",
  "DNS",
  "HEARTBEAT",
] as const;

type MonitorType = (typeof MONITOR_TYPES)[number];

export type MonitorConfiguration = {
  type: MonitorType;
  target: string;
  port: number | null;
  expectedStatusRange: string;
  keywordMatch?: string | null;
  keywordAbsent?: string | null;
};

export function parseExpectedStatusRange(value: string) {
  const normalized = value.trim();
  const match = /^(\d{3})-(\d{3})$/.exec(normalized);
  if (!match) {
    throw new Error("Expected status range must look like 200-299");
  }
  const minimum = Number(match[1]);
  const maximum = Number(match[2]);
  if (minimum < 100 || maximum > 599) {
    throw new Error("Expected HTTP statuses must be between 100 and 599");
  }
  if (minimum > maximum) {
    throw new Error("Expected status range must start at or below its end");
  }
  return { minimum, maximum, normalized };
}

export function isExpectedStatus(value: string, status: number) {
  const range = parseExpectedStatusRange(value);
  return status >= range.minimum && status <= range.maximum;
}

function assertHttpTargetSyntax(target: string) {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    throw new Error("HTTP and keyword monitor targets must be valid URLs");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("HTTP and keyword monitor targets must use HTTP or HTTPS");
  }
  if (url.username || url.password) {
    throw new Error("Credentials are not allowed in monitor target URLs");
  }
}

export function monitorNetworkHostname(configuration: MonitorConfiguration) {
  if (configuration.type !== "TLS" || !configuration.target.includes("://")) {
    return configuration.target;
  }
  let url: URL;
  try {
    url = new URL(configuration.target);
  } catch {
    throw new Error("TLS monitor target must be a hostname or valid URL");
  }
  if (url.username || url.password) {
    throw new Error("Credentials are not allowed in monitor target URLs");
  }
  return url.hostname;
}

/**
 * Applies the type-specific invariants shared by monitor creation and global
 * monitor templates. Network resolution is intentionally handled separately.
 */
export function normalizeMonitorConfiguration<T extends MonitorConfiguration>(
  configuration: T
): T {
  const target = configuration.target.trim();
  const expectedStatusRange = parseExpectedStatusRange(
    configuration.expectedStatusRange
  ).normalized;
  const keywordMatch = configuration.keywordMatch?.trim() || null;
  const keywordAbsent = configuration.keywordAbsent?.trim() || null;

  if (configuration.type !== "HEARTBEAT" && !target) {
    throw new Error("Monitor target is required");
  }
  if (
    (configuration.type === "HTTP" || configuration.type === "KEYWORD") &&
    target
  ) {
    assertHttpTargetSyntax(target);
  }
  if (configuration.type === "KEYWORD" && !keywordMatch && !keywordAbsent) {
    throw new Error("Keyword monitors require a keyword to match or reject");
  }
  if (
    configuration.port !== null &&
    (!Number.isInteger(configuration.port) ||
      configuration.port < 1 ||
      configuration.port > 65_535)
  ) {
    throw new Error("Monitor port must be between 1 and 65535");
  }
  if (configuration.type === "TCP" && configuration.port === null) {
    throw new Error("TCP monitors require a port");
  }

  return {
    ...configuration,
    target: configuration.type === "HEARTBEAT" && !target ? "heartbeat" : target,
    expectedStatusRange,
    keywordMatch,
    keywordAbsent,
  };
}
