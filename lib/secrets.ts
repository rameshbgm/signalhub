import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function secretMatches(secret: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashSecret(secret), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function generateSecret(prefix: string, bytes = 32) {
  const token = `${prefix}${randomBytes(bytes).toString("base64url")}`;
  return {
    token,
    hash: hashSecret(token),
    prefix: token.slice(0, Math.min(token.length, prefix.length + 8)),
    lastFour: token.slice(-4),
  };
}

export function secretLabel(prefix: string, lastFour: string) {
  return `${prefix}…${lastFour}`;
}
