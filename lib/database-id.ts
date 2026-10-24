import { randomUUID } from "node:crypto";
export { isDatabaseId } from "@/lib/database-id-validation";

export function newDatabaseId() {
  return randomUUID();
}
