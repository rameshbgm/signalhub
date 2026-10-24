/** UUID validation shared by browser forms and server data access. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isDatabaseId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
