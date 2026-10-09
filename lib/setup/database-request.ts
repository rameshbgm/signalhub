import type { DatabaseInput } from "@/lib/setup/database-check";

export type DatabaseRequest =
  | { method: "bundled" }
  | { method: "url"; url: string; ca?: string }
  | {
      method: "fields";
      host: string;
      port?: number;
      database: string;
      user: string;
      password: string;
      sslMode: "verify-full" | "no-verify" | "disable";
      ca?: string;
    };

const SSL_MODES = new Set(["verify-full", "no-verify", "disable"]);
const text = (value: unknown) => (typeof value === "string" ? value : "");

/** Turns the wizard's JSON into a connection input, or an error message. */
export function databaseInputFromRequest(body: unknown): DatabaseInput | string {
  const value = (body ?? {}) as Record<string, unknown>;
  if (value.method === "bundled") {
    const url = process.env.SIGNALHUB_BUNDLED_DATABASE_URL;
    return url ? { url } : "No bundled database is configured for this installation.";
  }
  const ca = text(value.ca).trim() || undefined;
  if (value.method === "url") return { url: text(value.url), ca };
  if (value.method === "fields") {
    const sslMode = text(value.sslMode);
    if (!SSL_MODES.has(sslMode)) return "Choose an SSL mode.";
    const port = Number(value.port || 5432);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return "Enter a valid port.";
    return {
      host: text(value.host),
      port,
      database: text(value.database),
      user: text(value.user),
      password: text(value.password),
      sslMode: sslMode as "verify-full" | "no-verify" | "disable",
      ca,
    };
  }
  return "Choose how to connect to the database.";
}
