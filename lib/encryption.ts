import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getSessionSecret } from "@/lib/session-secret";

type EncryptionKey = { id: string; value: Buffer };

function deriveKey(configured?: string) {
  const material = configured
    ? Buffer.from(configured, "utf8")
    : Buffer.from(getSessionSecret());
  return createHash("sha256").update(material).digest();
}

function keyring(): { active: EncryptionKey; all: EncryptionKey[] } {
  const legacy = { id: "legacy", value: deriveKey(process.env.ENCRYPTION_KEY) };
  const configured = process.env.ENCRYPTION_KEYS;
  if (!configured) return { active: legacy, all: [legacy] };
  let parsed: Record<string, string>;
  try {
    parsed = JSON.parse(configured) as Record<string, string>;
  } catch {
    throw new Error("ENCRYPTION_KEYS must be a JSON object");
  }
  const keys = Object.entries(parsed).map(([id, value]) => ({
    id,
    value: deriveKey(value),
  }));
  if (!keys.length) throw new Error("ENCRYPTION_KEYS must contain at least one key");
  const activeId = process.env.ENCRYPTION_ACTIVE_KEY_ID ?? keys[0].id;
  const active = keys.find((candidate) => candidate.id === activeId);
  if (!active) throw new Error("ENCRYPTION_ACTIVE_KEY_ID does not exist in ENCRYPTION_KEYS");
  return { active, all: keys.some((item) => item.id === "legacy") ? keys : [...keys, legacy] };
}

export function encryptSecret(value: string) {
  const { active } = keyring();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", active.value, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", active.id, iv, tag, ciphertext]
    .map((part) => typeof part === "string" ? part : part.toString("base64url"))
    .join(".");
}

export function decryptSecret(value: string) {
  const parts = value.split(".");
  const versioned = parts[0] === "v1";
  const keyId = versioned ? parts[1] : "legacy";
  const [ivPart, tagPart, ciphertextPart] = versioned ? parts.slice(2) : parts;
  if (!ivPart || !tagPart || !ciphertextPart) throw new Error("Invalid encrypted secret");
  const encryptionKey = keyring().all.find((candidate) => candidate.id === keyId);
  if (!encryptionKey) throw new Error(`Encryption key ${keyId} is not configured`);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey.value,
    Buffer.from(ivPart, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function encryptedSecretKeyId(value: string) {
  const [version, keyId] = value.split(".");
  return version === "v1" && keyId ? keyId : "legacy";
}
