"use server";

import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformCapability } from "@/lib/admin-guard";
import { collections, type IdentityRoleMapping } from "@/lib/db";
import { encryptSecret } from "@/lib/encryption";
import { oid } from "@/lib/mongo-utils";
import { getOidcDiscovery } from "@/lib/oidc";
import { oidcConnectionConfig, samlConnectionConfig } from "@/lib/identity-connections";
import { writePlatformAudit } from "@/lib/platform-policy";

const mappingSchema = z.array(z.object({
  group: z.string().trim().min(1).max(255),
  role: z.enum(["OWNER", "ADMIN", "INCIDENT_MANAGER", "RESPONDER", "VIEWER", "OPERATOR", "AUDITOR"]),
  pageIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).optional(),
})).max(100);

function slug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export async function createIdentityConnection(formData: FormData) {
  const actor = await requirePlatformCapability("identity.manage");
  const name = String(formData.get("name") ?? "").trim();
  const connectionSlug = slug(String(formData.get("slug") ?? name));
  const type = String(formData.get("type") ?? "");
  const audience = String(formData.get("audience") ?? "");
  const orgIdValue = String(formData.get("orgId") ?? "").trim();
  if (!name || name.length > 120 || !connectionSlug) throw new Error("Enter a valid connection name and slug");
  if (!["OIDC", "SAML"].includes(type)) throw new Error("Choose OIDC or SAML");
  if (!["ORGANIZATION", "PLATFORM"].includes(audience)) throw new Error("Choose a connection audience");
  const orgId = audience === "ORGANIZATION" ? oid(orgIdValue) : null;
  if (orgId && !(await collections.organizations().findOne({ _id: orgId }))) {
    throw new Error("Organization not found");
  }
  const parsedMappings = mappingSchema.parse(JSON.parse(String(formData.get("roleMappings") ?? "[]")));
  if (audience === "ORGANIZATION" && parsedMappings.some((mapping) => ["OPERATOR", "AUDITOR"].includes(mapping.role))) {
    throw new Error("Organization connections may only map tenant roles");
  }
  if (audience === "PLATFORM" && parsedMappings.some((mapping) => !["OWNER", "OPERATOR", "AUDITOR"].includes(mapping.role))) {
    throw new Error("Platform connections may only map platform roles");
  }
  const pageIds = parsedMappings.flatMap((mapping) => mapping.pageIds ?? []);
  if (orgId && pageIds.length) {
    const pageCount = await collections.pages().countDocuments({
      _id: { $in: pageIds.map(oid) },
      orgId,
    });
    if (pageCount !== new Set(pageIds).size) throw new Error("A role mapping references a page outside the organization");
  }
  const mappings: IdentityRoleMapping[] = parsedMappings.map((mapping) => ({
    group: mapping.group,
    role: mapping.role,
    pageIds: mapping.pageIds?.map(oid) ?? null,
  }));
  const config = type === "OIDC"
    ? {
        issuer: String(formData.get("issuer") ?? "").trim().replace(/\/$/, ""),
        clientId: String(formData.get("clientId") ?? "").trim(),
        clientSecret: String(formData.get("clientSecret") ?? ""),
        scopes: String(formData.get("scopes") ?? "openid email profile groups").trim().split(/\s+/),
      }
    : {
        entryPoint: String(formData.get("entryPoint") ?? "").trim(),
        issuer: String(formData.get("issuer") ?? "").trim(),
        idpCertificate: String(formData.get("idpCertificate") ?? "").trim(),
        privateKey: String(formData.get("privateKey") ?? "").trim() || undefined,
        spCertificate: String(formData.get("spCertificate") ?? "").trim() || undefined,
        decryptionPrivateKey: String(formData.get("decryptionPrivateKey") ?? "").trim() || undefined,
        signatureAlgorithm: "sha256" as const,
      };
  if (Object.values(config).some((value) => value === "")) throw new Error("Complete all required provider fields");
  const acceptedAcrValues = String(formData.get("acceptedAcrValues") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const acceptedAmrValues = String(formData.get("acceptedAmrValues") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  if (audience === "PLATFORM" && !acceptedAcrValues.length && !acceptedAmrValues.length) {
    throw new Error("Platform SSO must require at least one accepted acr or amr MFA value");
  }
  const now = new Date();
  const id = new ObjectId();
  await collections.identityConnections().insertOne({
    _id: id,
    name,
    slug: connectionSlug,
    type: type as "OIDC" | "SAML",
    audience: audience as "ORGANIZATION" | "PLATFORM",
    orgId,
    enabled: true,
    configCiphertext: encryptSecret(JSON.stringify(config)),
    roleMappings: mappings,
    defaultRole: audience === "ORGANIZATION"
      ? (String(formData.get("defaultRole") ?? "VIEWER") as "VIEWER")
      : null,
    acceptedAcrValues,
    acceptedAmrValues,
    allowJitProvisioning: audience === "ORGANIZATION" && formData.get("allowJitProvisioning") === "on",
    lastTestedAt: null,
    lastTestOk: null,
    lastError: null,
    createdBy: oid(actor.platformAdminId),
    createdAt: now,
    updatedAt: now,
  });
  await writePlatformAudit({
    actorId: oid(actor.platformAdminId),
    actorEmail: actor.email,
    actorRole: actor.role,
    action: "IDENTITY_CONNECTION_CREATED",
    targetType: "identityConnection",
    targetId: id.toHexString(),
    organizationId: orgId,
    metadata: { name, slug: connectionSlug, type, audience },
  });
  revalidatePath("/platform/identity");
}

export async function setIdentityConnectionEnabled(id: string, formData: FormData) {
  const actor = await requirePlatformCapability("identity.manage");
  const enabled = String(formData.get("enabled")) === "true";
  const connection = await collections.identityConnections().findOne({ _id: oid(id) });
  if (!connection) throw new Error("Identity connection not found");
  await collections.identityConnections().updateOne(
    { _id: connection._id },
    { $set: { enabled, updatedAt: new Date() } }
  );
  if (!enabled) {
    await collections.scimTokens().updateMany(
      { connectionId: connection._id, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
  }
  await writePlatformAudit({
    actorId: oid(actor.platformAdminId),
    actorEmail: actor.email,
    actorRole: actor.role,
    action: enabled ? "IDENTITY_CONNECTION_ENABLED" : "IDENTITY_CONNECTION_DISABLED",
    targetType: "identityConnection",
    targetId: connection._id.toHexString(),
    organizationId: connection.orgId,
  });
  revalidatePath("/platform/identity");
}

export async function testIdentityConnection(id: string) {
  const actor = await requirePlatformCapability("identity.manage");
  const connection = await collections.identityConnections().findOne({ _id: oid(id) });
  if (!connection) throw new Error("Identity connection not found");
  let error: string | null = null;
  try {
    if (connection.type === "OIDC") {
      await getOidcDiscovery(oidcConnectionConfig(connection));
    } else {
      samlConnectionConfig(connection);
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Connection test failed";
  }
  await collections.identityConnections().updateOne(
    { _id: connection._id },
    {
      $set: {
        lastTestedAt: new Date(),
        lastTestOk: !error,
        lastError: error,
        updatedAt: new Date(),
      },
    }
  );
  await writePlatformAudit({
    actorId: oid(actor.platformAdminId),
    actorEmail: actor.email,
    actorRole: actor.role,
    action: "IDENTITY_CONNECTION_TESTED",
    targetType: "identityConnection",
    targetId: connection._id.toHexString(),
    organizationId: connection.orgId,
    metadata: { success: !error },
  });
  revalidatePath("/platform/identity");
  if (error) throw new Error(error);
}
