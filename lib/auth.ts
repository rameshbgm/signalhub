import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { getSessionSecret } from "@/lib/session-secret";

const SESSION_COOKIE = "sp_session";
const ACCESS_COOKIE_PREFIX = "sp_access_"; // per-page access cookie for private/audience pages

function getSecret() {
  return getSessionSecret();
}

export type SessionPayload = {
  teamMemberId: string;
  orgId: string;
  email: string;
  name: string;
  role: string;
};

export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecret());

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

// ---- Page-visitor access sessions (for PRIVATE / AUDIENCE pages) ----

export async function createPageAccessSession(pageId: string, data: { userId?: string; email?: string }) {
  const token = await new SignJWT({ pageId, ...data })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
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
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as { pageId: string; userId?: string; email?: string };
  } catch {
    return null;
  }
}
