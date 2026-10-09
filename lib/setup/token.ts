import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { dataDir } from "@/lib/setup/config-file";

/**
 * Until first-run setup completes, anyone who reaches the URL could point the
 * instance at their own database or claim the admin account. Every setup step
 * therefore requires a one-time token that only the operator can read (logs or
 * the data volume).
 */
export const SETUP_COOKIE = "sp_setup";
export const SETUP_COOKIE_MAX_AGE_SECONDS = 30 * 60;

export function setupTokenPath(env: NodeJS.ProcessEnv = process.env) {
  return path.join(dataDir(env), "setup-token");
}

/**
 * Reuses the pending token so the browser stays unlocked across the in-place
 * reload between the database and administrator steps.
 */
export async function issueSetupToken(env: NodeJS.ProcessEnv = process.env) {
  const existing = (await readFile(setupTokenPath(env), "utf8").catch(() => "")).trim();
  if (existing.length >= 32) return existing;
  const token = randomBytes(24).toString("base64url");
  await mkdir(dataDir(env), { recursive: true });
  await writeFile(setupTokenPath(env), `${token}\n`, { mode: 0o600 });
  return token;
}

/** Forces a fresh token (`signalhubctl setup --new-token`): unlocked browsers must unlock again. */
export async function rotateSetupToken(env: NodeJS.ProcessEnv = process.env) {
  await rm(setupTokenPath(env), { force: true });
  return issueSetupToken(env);
}

/**
 * The token the web server accepts right now. Read from the file on every
 * call so a token rotated from the command line takes effect immediately;
 * the environment copy covers read-only filesystems.
 */
export function currentSetupToken(env: NodeJS.ProcessEnv = process.env) {
  try {
    const value = readFileSync(setupTokenPath(env), "utf8").trim();
    if (value) return value;
  } catch {
    // No file (read-only filesystem, or setup finished).
  }
  return env.SIGNALHUB_SETUP_MODE ? env.SIGNALHUB_SETUP_TOKEN : undefined;
}

export async function revokeSetupToken(env: NodeJS.ProcessEnv = process.env) {
  await rm(setupTokenPath(env), { force: true });
}

function equal(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function setupTokenMatches(candidate: string, token: string | undefined) {
  return Boolean(token) && equal(candidate.trim(), token!);
}

function signature(token: string, issuedAt: number) {
  return createHmac("sha256", token).update(`setup:${issuedAt}`).digest("base64url");
}

export function setupCookieValue(token: string, now = Date.now()) {
  return `${now}.${signature(token, now)}`;
}

export function setupCookieValid(value: string | undefined, token: string | undefined, now = Date.now()) {
  if (!value || !token) return false;
  const [issued, mac] = value.split(".");
  const issuedAt = Number(issued);
  if (!Number.isFinite(issuedAt) || !mac) return false;
  if (now - issuedAt > SETUP_COOKIE_MAX_AGE_SECONDS * 1000 || issuedAt > now + 60_000) return false;
  return equal(mac, signature(token, issuedAt));
}

// ponytail: in-memory limiter; setup mode is a single web process with no
// database yet, so the DB-backed limiter in lib/rate-limit.ts cannot run.
const attempts = new Map<string, { count: number; resetAt: number }>();
export const SETUP_ATTEMPTS_PER_MINUTE = 10;

export function consumeSetupAttempt(ip: string, now = Date.now()) {
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt <= now) {
    attempts.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= SETUP_ATTEMPTS_PER_MINUTE;
}
