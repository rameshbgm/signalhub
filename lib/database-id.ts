import { randomUUID } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function newDatabaseId() {
  return randomUUID();
}

export function isDatabaseId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
