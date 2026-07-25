const REDACTED_KEYS = /password|secret|token|authorization|cookie|assertion|recovery|certificate|privatekey/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        REDACTED_KEYS.test(key) ? "[redacted]" : redact(item, depth + 1),
      ])
    );
  }
  return value;
}

export function log(
  level: "debug" | "info" | "warn" | "error",
  message: string,
  fields: Record<string, unknown> = {}
) {
  const configured = process.env.LOG_LEVEL ?? "info";
  const weights = { debug: 10, info: 20, warn: 30, error: 40 };
  if (weights[level] < weights[configured as keyof typeof weights]) return;
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: process.env.SERVICE_NAME ?? "status",
    message,
    ...(redact(fields) as Record<string, unknown>),
  });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.log(entry);
}
