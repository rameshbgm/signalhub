import { ObjectId } from "mongodb";

export class InvalidObjectIdError extends Error {
  constructor(public readonly value: string) {
    super("Malformed identifier");
    this.name = "InvalidObjectIdError";
  }
}

export function oid(id: string): ObjectId {
  if (!ObjectId.isValid(id)) throw new InvalidObjectIdError(id);
  return new ObjectId(id);
}

export function isValidOid(id: string): boolean {
  return ObjectId.isValid(id);
}

export function tryOid(id: string): ObjectId | null {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
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
