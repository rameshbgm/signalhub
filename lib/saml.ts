import { SAML, ValidateInResponseTo, type CacheProvider } from "@node-saml/node-saml";
import { collections, type IdentityConnectionDoc } from "@/lib/db";
import { samlConnectionConfig } from "@/lib/identity-connections";

class MongoSamlCache implements CacheProvider {
  async saveAsync(key: string, value: string) {
    const createdAt = Date.now();
    await collections.samlRequests().updateOne(
      { _id: key },
      {
        $set: {
          value,
          createdAt: new Date(createdAt),
          expiresAt: new Date(createdAt + 10 * 60_000),
        },
      },
      { upsert: true }
    );
    return { value, createdAt };
  }

  async getAsync(key: string) {
    const request = await collections.samlRequests().findOne({
      _id: key,
      expiresAt: { $gt: new Date() },
    });
    return request?.value ?? null;
  }

  async removeAsync(key: string | null) {
    if (!key) return null;
    const request = await collections.samlRequests().findOneAndDelete({ _id: key });
    return request?.value ?? null;
  }
}

export function samlCallbackUrl(origin: string, slug: string) {
  const base = (process.env.NEXT_PUBLIC_APP_URL || origin).replace(/\/$/, "");
  return `${base}/api/auth/saml/${encodeURIComponent(slug)}/acs`;
}

export function createSamlClient(connection: IdentityConnectionDoc, origin: string) {
  const config = samlConnectionConfig(connection);
  return new SAML({
    entryPoint: config.entryPoint,
    issuer: config.issuer,
    callbackUrl: samlCallbackUrl(origin, connection.slug),
    idpCert: config.idpCertificate,
    privateKey: config.privateKey,
    decryptionPvk: config.decryptionPrivateKey,
    signatureAlgorithm: config.signatureAlgorithm ?? "sha256",
    identifierFormat: config.identifierFormat ?? null,
    audience: config.issuer,
    acceptedClockSkewMs: 120_000,
    maxAssertionAgeMs: 5 * 60_000,
    validateInResponseTo: ValidateInResponseTo.always,
    requestIdExpirationPeriodMs: 10 * 60_000,
    cacheProvider: new MongoSamlCache(),
    wantAssertionsSigned: true,
    wantAuthnResponseSigned: true,
    disableRequestedAuthnContext: false,
    authnContext: [
      "urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport",
    ],
  });
}

export function samlProfileIdentity(profile: Record<string, unknown>) {
  const emailValue =
    profile.email ??
    profile.mail ??
    profile["urn:oid:0.9.2342.19200300.100.1.3"];
  const email = typeof emailValue === "string" ? emailValue : null;
  const subject = typeof profile.nameID === "string" ? profile.nameID : null;
  if (!email || !subject) throw new Error("SAML assertion must include NameID and email");
  const rawGroups =
    profile.groups ??
    profile.group ??
    profile["http://schemas.microsoft.com/ws/2008/06/identity/claims/groups"] ??
    [];
  const groups = (Array.isArray(rawGroups) ? rawGroups : [rawGroups]).filter(
    (group): group is string => typeof group === "string"
  );
  const displayName =
    profile.displayName ?? profile.name ?? profile.cn ?? email;
  const acr =
    profile.authnContextClassRef ??
    profile["urn:oasis:names:tc:SAML:2.0:ac:classes:AuthnContextClassRef"];
  return {
    subject,
    email,
    name: typeof displayName === "string" ? displayName : email,
    groups,
    acr: typeof acr === "string" ? acr : null,
    amr: [] as string[],
  };
}
