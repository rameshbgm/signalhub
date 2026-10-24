import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { database } from "@/lib/postgres/client";
import { getSessionSecret } from "@/lib/session-secret";
import { safeReturnTo } from "@/lib/public-path";

export const SAML_TRANSACTION_COOKIE = "__Host-signalhub-saml";
export const SAML_TRANSACTION_SECONDS = 600;
const nonceHash = (nonce: string) => createHash("sha256").update(nonce).digest("hex");

export async function createSamlTransaction(connectionSlug: string, returnTo: string) {
  const nonce = randomBytes(32).toString("base64url");
  const requestId = `_${randomBytes(32).toString("hex")}`;
  const relayState = await new SignJWT({ connectionSlug, requestId, returnTo: safeReturnTo(returnTo, "/organization") })
    .setProtectedHeader({ alg: "HS256" }).setAudience("saml-transaction")
    .setIssuedAt().setExpirationTime(`${SAML_TRANSACTION_SECONDS}s`).sign(getSessionSecret());
  await database.insertInto("samlRequests").values({
    id: `browser:${requestId}`, value: nonceHash(nonce), createdAt: new Date(),
    expiresAt: new Date(Date.now() + SAML_TRANSACTION_SECONDS * 1000),
  }).execute();
  return { nonce, requestId, relayState };
}

/** Atomic one-time claim: a valid response from a different browser is insufficient. */
export async function consumeSamlTransaction(relayState: string, nonce: string | undefined, connectionSlug: string) {
  if (!nonce || !/^[A-Za-z0-9_-]{43}$/.test(nonce)) throw new Error("SAML browser transaction is missing");
  const { payload } = await jwtVerify(relayState, getSessionSecret(), { audience: "saml-transaction", algorithms: ["HS256"] });
  if (payload.connectionSlug !== connectionSlug || typeof payload.requestId !== "string" ||
    !/^_[a-f0-9]{64}$/.test(payload.requestId) || typeof payload.returnTo !== "string") {
    throw new Error("SAML transaction does not match this connection");
  }
  const claimed = await database.deleteFrom("samlRequests")
    .where("id", "=", `browser:${payload.requestId}`).where("value", "=", nonceHash(nonce))
    .where("expiresAt", ">", new Date()).returning("id").executeTakeFirst();
  if (!claimed) throw new Error("SAML browser transaction is invalid, expired or already used");
  return { requestId: payload.requestId, returnTo: safeReturnTo(payload.returnTo, "/organization") };
}
