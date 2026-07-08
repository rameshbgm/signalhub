import { ObjectId } from "mongodb";

export function oid(id: string): ObjectId {
  return new ObjectId(id);
}

export function isValidOid(id: string): boolean {
  return ObjectId.isValid(id);
}

type StringifyObjectIds<T> = {
  [K in keyof T]: T[K] extends ObjectId
    ? string
    : T[K] extends ObjectId | null
      ? string | null
      : T[K];
};

/**
 * Converts `_id` to `id: string`, and stringifies any ObjectId-typed fields
 * (e.g. `pageId`, `orgId`) so string comparisons elsewhere in the app
 * (e.g. `page.orgId !== orgId`) keep working unchanged — both at runtime
 * and in the type the caller sees.
 */
export function toId<T extends { _id: ObjectId }>(
  doc: T
): Omit<StringifyObjectIds<T>, "_id"> & { id: string } {
  const { _id, ...rest } = doc;
  const converted: Record<string, unknown> = { ...rest, id: _id.toHexString() };
  for (const key of Object.keys(converted)) {
    const value = converted[key];
    if (value instanceof ObjectId) {
      converted[key] = value.toHexString();
    }
  }
  return converted as Omit<StringifyObjectIds<T>, "_id"> & { id: string };
}
