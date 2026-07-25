import { randomBytes } from "node:crypto";
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import { decodeProtectedHeader, SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import { getSessionSigningKeys } from "@/lib/session-secret";
import { collections } from "@/lib/db";
import type { AuthSessionDoc, PlatformRole } from "@/lib/db";
import { hashSecret } from "@/lib/secrets";

const SESSION_COOKIE = "sp_session";
const PLATFORM_SESSION_COOKIE = "sp_platform_session";
const ACCESS_COOKIE_PREFIX = "sp_access_"; // per-page access cookie for private/audience pages

function seconds(name: string, fallback: number, minimum: number, maximum: number) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

function tenantIdleSeconds() {
  return seconds("TENANT_SESSION_IDLE_SECONDS", 8 * 60 * 60, 15 * 60, 30 * 24 * 60 * 60);
}

function tenantAbsoluteSeconds() {
  return seconds("TENANT_SESSION_ABSOLUTE_SECONDS", 7 * 24 * 60 * 60, 60 * 60, 90 * 24 * 60 * 60);
}

function platformIdleSeconds() {
  return seconds("PLATFORM_SESSION_IDLE_SECONDS", 60 * 60, 5 * 60, 12 * 60 * 60);
}

function platformAbsoluteSeconds() {
  return seconds("PLATFORM_SESSION_ABSOLUTE_SECONDS", 12 * 60 * 60, 30 * 60, 24 * 60 * 60);
}

export type SessionPayload = {
  userId: string;
  membershipId: string;
  orgId: string;
  email: string;
  name: string;
  role: string;
  supportSessionId?: string;
  supportSessionToken?: string;
  supportActorEmail?: string;
  supportActorName?: string;
  supportMode?: "VIEW" | "OPERATE";
  sessionId?: string;
  authMethod?: AuthSessionDoc["authMethod"];
  mfaVerified?: boolean;
};

export async function createSession(
  payload: SessionPayload,
  options: {
    maxAgeSeconds?: number;
    authMethod?: AuthSessionDoc["authMethod"];
    mfaVerified?: boolean;
    ipAddress?: string | null;
    userAgent?: string | null;
  } = {}
) {
  const absoluteSeconds = options.maxAgeSeconds ?? tenantAbsoluteSeconds();
  const idleSeconds = Math.min(tenantIdleSeconds(), absoluteSeconds);
  const now = new Date();
  const sessionId = new ObjectId();
  const verifier = randomBytes(32).toString("base64url");
  const { active } = getSessionSigningKeys();
  const sessionPayload = {
    ...payload,
    sessionId: sessionId.toHexString(),
    sessionVerifier: verifier,
    authMethod: options.authMethod ?? (payload.supportSessionId ? "SUPPORT" : "PASSWORD"),
    mfaVerified: options.mfaVerified ?? true,
  };
  const token = await new SignJWT(sessionPayload)
    .setProtectedHeader({ alg: "HS256", kid: active.id })
    .setAudience("org")
    .setIssuedAt()
    .setExpirationTime(`${absoluteSeconds}s`)
    .sign(active.secret);

  await collections.authSessions().insertOne({
    _id: sessionId,
    kind: "TENANT",
    tokenHash: hashSecret(verifier),
    userId: new ObjectId(payload.userId),
    membershipId: new ObjectId(payload.membershipId),
    orgId: new ObjectId(payload.orgId),
    platformAdminId: null,
    sessionVersion: 1,
    authMethod: sessionPayload.authMethod,
    mfaVerified: sessionPayload.mfaVerified,
    ipAddress: options.ipAddress ?? null,
    userAgent: options.userAgent ?? null,
    createdAt: now,
    lastSeenAt: now,
    idleExpiresAt: new Date(now.getTime() + idleSeconds * 1000),
    absoluteExpiresAt: new Date(now.getTime() + absoluteSeconds * 1000),
    revokedAt: null,
    revokedReason: null,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: absoluteSeconds,
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const payload = await verifySignedToken(token, "org").catch(() => null);
    if (typeof payload?.sessionId === "string") {
      await collections.authSessions().updateOne(
        { _id: new ObjectId(payload.sessionId), revokedAt: null },
        { $set: { revokedAt: new Date(), revokedReason: "logout" } }
      );
    }
  }
  store.delete(SESSION_COOKIE);
}

async function verifySignedToken(token: string, audience: "org" | "platform") {
  const { all } = getSessionSigningKeys();
  const kid = decodeProtectedHeader(token).kid;
  const candidates = kid ? all.filter((key) => key.id === kid) : all;
  let lastError: unknown = new Error("No matching signing key");
  for (const candidate of candidates) {
    try {
      return (await jwtVerify(token, candidate.secret, { audience })).payload;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function activeSession(
  payload: Record<string, unknown>,
  kind: AuthSessionDoc["kind"]
) {
  if (
    typeof payload.sessionId !== "string" ||
    typeof payload.sessionVerifier !== "string" ||
    !ObjectId.isValid(payload.sessionId)
  ) {
    return null;
  }
  const now = new Date();
  const session = await collections.authSessions().findOne({
    _id: new ObjectId(payload.sessionId),
    kind,
    tokenHash: hashSecret(payload.sessionVerifier),
    revokedAt: null,
    idleExpiresAt: { $gt: now },
    absoluteExpiresAt: { $gt: now },
  });
  if (!session) return null;
  if (now.getTime() - session.lastSeenAt.getTime() > 5 * 60_000) {
    const idleSeconds = kind === "TENANT" ? tenantIdleSeconds() : platformIdleSeconds();
    const idleExpiresAt = new Date(
      Math.min(session.absoluteExpiresAt.getTime(), now.getTime() + idleSeconds * 1000)
    );
    await collections.authSessions().updateOne(
      { _id: session._id, revokedAt: null, idleExpiresAt: { $gt: now } },
      { $set: { lastSeenAt: now, idleExpiresAt } }
    );
  }
  return session;
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const payload = await verifySignedToken(token, "org");
    if (
      typeof payload.userId !== "string" ||
      typeof payload.membershipId !== "string" ||
      typeof payload.orgId !== "string"
    ) {
      return null;
    }
    const stored = await activeSession(payload, "TENANT");
    if (
      !stored ||
      stored.userId?.toHexString() !== payload.userId ||
      stored.membershipId?.toHexString() !== payload.membershipId ||
      stored.orgId?.toHexString() !== payload.orgId
    ) {
      return null;
    }
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string) {
  return argonHash(password, {
    algorithm: 2,
    memoryCost: seconds("ARGON2_MEMORY_KIB", 19_456, 8_192, 262_144),
    timeCost: seconds("ARGON2_TIME_COST", 2, 1, 10),
    parallelism: seconds("ARGON2_PARALLELISM", 1, 1, 4),
    outputLen: 32,
  });
}

export async function verifyPassword(password: string, hash: string) {
  if (hash.startsWith("$argon2")) return argonVerify(hash, password);
  return bcrypt.compare(password, hash);
}

export function passwordNeedsRehash(hash: string) {
  return !hash.startsWith("$argon2id$");
}

// ---- Platform-admin sessions (span all tenants, separate cookie/identity from org sessions) ----

export type PlatformSessionPayload = {
  platformAdminId: string;
  email: string;
  name: string;
  role: PlatformRole;
  sessionVersion: number;
  mfaVerified: true;
  sessionId?: string;
};

export async function createPlatformSession(
  payload: PlatformSessionPayload,
  options: {
    authMethod?: AuthSessionDoc["authMethod"];
    ipAddress?: string | null;
    userAgent?: string | null;
  } = {}
) {
  const maxAge = platformAbsoluteSeconds();
  const now = new Date();
  const sessionId = new ObjectId();
  const verifier = randomBytes(32).toString("base64url");
  const { active } = getSessionSigningKeys();
  const token = await new SignJWT({
    ...payload,
    sessionId: sessionId.toHexString(),
    sessionVerifier: verifier,
  })
    .setProtectedHeader({ alg: "HS256", kid: active.id })
    .setAudience("platform")
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .sign(active.secret);

  await collections.authSessions().insertOne({
    _id: sessionId,
    kind: "PLATFORM",
    tokenHash: hashSecret(verifier),
    userId: null,
    membershipId: null,
    orgId: null,
    platformAdminId: new ObjectId(payload.platformAdminId),
    sessionVersion: payload.sessionVersion,
    authMethod: options.authMethod ?? "PASSWORD",
    mfaVerified: true,
    ipAddress: options.ipAddress ?? null,
    userAgent: options.userAgent ?? null,
    createdAt: now,
    lastSeenAt: now,
    idleExpiresAt: new Date(now.getTime() + platformIdleSeconds() * 1000),
    absoluteExpiresAt: new Date(now.getTime() + maxAge * 1000),
    revokedAt: null,
    revokedReason: null,
  });

  const store = await cookies();
  store.set(PLATFORM_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

export async function destroyPlatformSession() {
  const store = await cookies();
  const token = store.get(PLATFORM_SESSION_COOKIE)?.value;
  if (token) {
    const payload = await verifySignedToken(token, "platform").catch(() => null);
    if (typeof payload?.sessionId === "string") {
      await collections.authSessions().updateOne(
        { _id: new ObjectId(payload.sessionId), revokedAt: null },
        { $set: { revokedAt: new Date(), revokedReason: "logout" } }
      );
    }
  }
  store.delete(PLATFORM_SESSION_COOKIE);
}

export async function getPlatformSession(): Promise<PlatformSessionPayload | null> {
  const store = await cookies();
  const token = store.get(PLATFORM_SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const payload = await verifySignedToken(token, "platform");
    if (
      typeof payload.platformAdminId !== "string" ||
      typeof payload.sessionVersion !== "number" ||
      payload.mfaVerified !== true ||
      !["OWNER", "OPERATOR", "AUDITOR"].includes(String(payload.role))
    ) {
      return null;
    }
    const stored = await activeSession(payload, "PLATFORM");
    if (
      !stored ||
      stored.platformAdminId?.toHexString() !== payload.platformAdminId ||
      stored.sessionVersion !== payload.sessionVersion ||
      !stored.mfaVerified
    ) {
      return null;
    }
    return payload as unknown as PlatformSessionPayload;
  } catch {
    return null;
  }
}

// ---- Page-visitor access sessions (for PRIVATE / AUDIENCE pages) ----

export async function createPageAccessSession(pageId: string, data: { userId?: string; email?: string }) {
  const { active } = getSessionSigningKeys();
  const token = await new SignJWT({ pageId, ...data })
    .setProtectedHeader({ alg: "HS256", kid: active.id })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(active.secret);
  const store = await cookies();
  store.set(`${ACCESS_COOKIE_PREFIX}${pageId}`, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function getPageAccessSession(pageId: string): Promise<{ pageId: string; userId?: string; email?: string } | null> {
  const store = await cookies();
  const token = store.get(`${ACCESS_COOKIE_PREFIX}${pageId}`)?.value;
  if (!token) return null;
  try {
    const { all } = getSessionSigningKeys();
    const kid = decodeProtectedHeader(token).kid;
    const candidates = kid ? all.filter((candidate) => candidate.id === kid) : all;
    for (const candidate of candidates) {
      try {
        const { payload } = await jwtVerify(token, candidate.secret);
        return payload as unknown as { pageId: string; userId?: string; email?: string };
      } catch {
        // Continue through rotation keys.
      }
    }
    return null;
  } catch {
    return null;
  }
}
