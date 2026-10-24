import pino from "pino";

const REDACTED_KEYS = /password|secret|token|authorization|cookie|assertion|recovery|certificate|privatekey/i;

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (value instanceof Error) return value;
  if (Array.isArray(value)) return value.map((item) => sanitize(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      REDACTED_KEYS.test(key) ? "[redacted]" : sanitize(item, depth + 1),
    ]));
  }
  return value;
}

export const logger = pino({
  name: process.env.SERVICE_NAME ?? "signalhub",
  level: process.env.LOG_LEVEL ?? "info",
  base: {
    service: process.env.SERVICE_NAME ?? "signalhub",
    environment: process.env.NODE_ENV ?? "development",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
    request: (request: { method?: string; url?: string; headers?: Record<string, unknown> }) => ({
      method: request.method,
      url: request.url,
    }),
  },
  redact: {
    paths: [
      "password",
      "secret",
      "token",
      "authorization",
      "cookie",
      "*.password",
      "*.secret",
      "*.token",
      "*.authorization",
      "*.cookie",
    ],
    censor: "[redacted]",
  },
});

export function log(
  level: "debug" | "info" | "warn" | "error",
  message: string,
  fields: Record<string, unknown> = {}
) {
  logger[level](sanitize(fields) as Record<string, unknown>, message);
}

export function errorFields(error: unknown) {
  return error instanceof Error
    ? { err: error }
    : { error: sanitize(error) };
}
