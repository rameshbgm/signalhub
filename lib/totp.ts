import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { normalizeRecoveryCode } from "@/lib/mfa/policy";
import { getSessionSecret } from "./session-secret";
import { hashSecret } from "./secrets";
import type { DatabaseExecutor } from "@/lib/postgres/client";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function encodeBase32(input: Uint8Array): string {
  let bits = "";
  for (const byte of input) bits += byte.toString(2).padStart(8, "0");
  let output = "";
  for (let index = 0; index < bits.length; index += 5) {
    output += BASE32_ALPHABET[Number.parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
  }
  return output;
}

function decodeBase32(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const character of clean) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error("Invalid base32 secret");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret() {
  return encodeBase32(randomBytes(20));
}

export function totpCode(secret: string, at = Date.now(), stepSeconds = 30): string {
  const counter = Math.floor(at / 1_000 / stepSeconds);
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counterBytes).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

/** The 30-second time step a valid code belongs to (±1 step of drift), or null. */
export function totpStep(secret: string, candidate: string, at = Date.now()): number | null {
  const normalized = candidate.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return null;
  for (const offset of [-30_000, 0, 30_000]) {
    const expected = Buffer.from(totpCode(secret, at + offset));
    const actual = Buffer.from(normalized);
    if (actual.length === expected.length && timingSafeEqual(actual, expected)) return Math.floor((at + offset) / 30_000);
  }
  return null;
}

export function verifyTotp(secret: string, candidate: string, at = Date.now()): boolean {
  return totpStep(secret, candidate, at) !== null;
}

/**
 * Records `step` as used by one device; false when it (or a later step) already
 * was, so the same code cannot be replayed while it is still valid (RFC 6238 §5.2).
 */
export async function consumeDeviceStep(executor: DatabaseExecutor, deviceId: string, step: number) {
  const consumed = await executor.updateTable("mfaDevices").set({ lastStep: step, lastUsedAt: new Date() })
    .where("id", "=", deviceId)
    .where((expression) => expression.or([expression("lastStep", "is", null), expression("lastStep", "<", step)]))
    .returning("id")
    .executeTakeFirst();
  return Boolean(consumed);
}

export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const value = randomBytes(6).toString("hex").toUpperCase();
    return `${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}`;
  });
}

/** Keyed hash, so a leaked table cannot be brute-forced offline without the server secret. */
export function mfaHmac(value: string): string {
  const key = createHash("sha256").update("signalhub-mfa-hmac:").update(getSessionSecret()).digest();
  return createHmac("sha256", key).update(value, "utf8").digest("hex");
}

export function hashRecoveryCode(code: string): string {
  return mfaHmac(normalizeRecoveryCode(code));
}

/** Codes carried over from the old design were stored as a bare SHA-256; both forms are looked up. */
export function recoveryCodeLookupHashes(code: string): string[] {
  return [hashRecoveryCode(code), hashSecret(normalizeRecoveryCode(code))];
}

export function totpUri(secret: string, email: string, issuer = "SignalHub Platform") {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
