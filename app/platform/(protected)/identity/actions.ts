"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformCapability } from "@/lib/admin-guard";
import { isDatabaseId } from "@/lib/database-id";
import { encryptSecret } from "@/lib/encryption";
import { oidcConnectionConfig, samlConnectionConfig } from "@/lib/identity-connections";
import { getOidcDiscovery } from "@/lib/oidc";
import { writePlatformAudit } from "@/lib/platform-policy";
import { database, withDatabaseTransaction } from "@/lib/postgres/client";
import type { IdentityRoleMapping } from "@/lib/postgres/schema";

const mappingSchema = z.array(z.object({
  group: z.string().trim().min(1).max(255),
  role: z.enum(["ADMIN", "INCIDENT_MANAGER", "RESPONDER", "VIEWER"]),
  pageIds: z.array(z.string().refine(isDatabaseId)).optional(),
})).max(100);

function slug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export async function createIdentityConnection(formData: FormData) {
  const actor = await requirePlatformCapability("identity.manage");
  const name = String(formData.get("name") ?? "").trim();
  const connectionSlug = slug(String(formData.get("slug") ?? name));
  const type = String(formData.get("type") ?? "");
  const orgId = String(formData.get("orgId") ?? "").trim();
  if (!name || name.length > 120 || !connectionSlug) throw new Error("Enter a valid connection name and slug");
  if (type !== "OIDC" && type !== "SAML") throw new Error("Choose OIDC or SAML");
  if (!isDatabaseId(orgId)) throw new Error("Choose an organization");
  const organization = await database.selectFrom("organizations").select("id")
    .where("id", "=", orgId).where("status", "=", "ACTIVE").executeTakeFirst();
  if (!organization) throw new Error("Organization not found");
  const parsedMappings = mappingSchema.parse(JSON.parse(String(formData.get("roleMappings") ?? "[]")));
  const pageIds = [...new Set(parsedMappings.flatMap((mapping) => mapping.pageIds ?? []))];
  if (pageIds.length) {
    const pages = await database.selectFrom("pages").select("id").where("id", "in", pageIds)
      .where("orgId", "=", orgId).execute();
    if (pages.length !== pageIds.length) throw new Error("A role mapping references a page outside the organization");
  }
  const mappings: IdentityRoleMapping[] = parsedMappings.map((mapping) => ({ ...mapping, pageIds: mapping.pageIds ?? null }));
  const config = type === "OIDC" ? {
    issuer: String(formData.get("issuer") ?? "").trim().replace(/\/$/, ""),
    clientId: String(formData.get("clientId") ?? "").trim(),
    clientSecret: String(formData.get("clientSecret") ?? ""),
    scopes: String(formData.get("scopes") ?? "openid email profile groups").trim().split(/\s+/),
  } : {
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
  const now = new Date();
  const connection = await withDatabaseTransaction(async (transaction) => {
    const created = await transaction.insertInto("identityConnections").values({
      name, slug: connectionSlug, type, audience: "ORGANIZATION", orgId, enabled: true,
      configCiphertext: encryptSecret(JSON.stringify(config)), roleMappings: mappings,
      defaultRole: "VIEWER", acceptedAcrValues, acceptedAmrValues,
      allowJitProvisioning: formData.get("allowJitProvisioning") === "on",
      lastTestedAt: null, lastTestOk: null, lastError: null,
      createdBy: actor.platformAdminId, createdAt: now, updatedAt: now,
    }).returning("id").executeTakeFirstOrThrow();
    await writePlatformAudit({
      actorId: actor.platformAdminId, actorEmail: actor.email, actorRole: actor.role,
      action: "IDENTITY_CONNECTION_CREATED", targetType: "identityConnection", targetId: created.id,
      organizationId: orgId, metadata: { name, slug: connectionSlug, type, audience: "ORGANIZATION" },
    }, { executor: transaction });
    return created;
  });
  void connection;
  revalidatePath("/organization/platform/identity");
}

export async function setIdentityConnectionEnabled(id: string, formData: FormData) {
  const actor = await requirePlatformCapability("identity.manage");
  const enabled = String(formData.get("enabled")) === "true";
  await withDatabaseTransaction(async (transaction) => {
    const connection = await transaction.updateTable("identityConnections").set({ enabled, updatedAt: new Date() })
      .where("id", "=", id).returning(["id", "orgId"]).executeTakeFirst();
    if (!connection) throw new Error("Identity connection not found");
    if (!enabled) await transaction.updateTable("scimTokens").set({ revokedAt: new Date() })
      .where("connectionId", "=", connection.id).where("revokedAt", "is", null).execute();
    await writePlatformAudit({
      actorId: actor.platformAdminId, actorEmail: actor.email, actorRole: actor.role,
      action: enabled ? "IDENTITY_CONNECTION_ENABLED" : "IDENTITY_CONNECTION_DISABLED",
      targetType: "identityConnection", targetId: connection.id, organizationId: connection.orgId,
    }, { executor: transaction });
  });
  revalidatePath("/organization/platform/identity");
}

export async function testIdentityConnection(id: string) {
  const actor = await requirePlatformCapability("identity.manage");
  const connection = await database.selectFrom("identityConnections").selectAll().where("id", "=", id).executeTakeFirst();
  if (!connection) throw new Error("Identity connection not found");
  let error: string | null = null;
  try {
    if (connection.type === "OIDC") await getOidcDiscovery(oidcConnectionConfig(connection));
    else samlConnectionConfig(connection);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Connection test failed";
  }
  const testedAt = new Date();
  await withDatabaseTransaction(async (transaction) => {
    await transaction.updateTable("identityConnections").set({
      lastTestedAt: testedAt, lastTestOk: !error, lastError: error, updatedAt: testedAt,
    }).where("id", "=", connection.id).execute();
    await writePlatformAudit({
      actorId: actor.platformAdminId, actorEmail: actor.email, actorRole: actor.role,
      action: "IDENTITY_CONNECTION_TESTED", targetType: "identityConnection", targetId: connection.id,
      organizationId: connection.orgId, metadata: { success: !error },
    }, { executor: transaction });
  });
  revalidatePath("/organization/platform/identity");
  if (error) throw new Error(error);
}
