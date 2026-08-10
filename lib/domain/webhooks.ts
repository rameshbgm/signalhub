import { randomBytes } from "node:crypto";
import type { Insertable } from "kysely";
import type { DatabaseTransaction } from "@/lib/postgres/client";
import type { WebhookEndpointTable } from "@/lib/postgres/schema";
import { newDatabaseId } from "@/lib/database-id";
import { encryptSecret } from "@/lib/encryption";
import { hashSecret } from "@/lib/secrets";
import { validateHttpTarget } from "@/lib/target-validation";
import { generateWebhookSecret } from "@/lib/tokens";

export async function prepareVerifiedWebhookEndpoint(pageId: string, rawUrl: string) {
  const url = String(rawUrl).trim();
  await validateHttpTarget(url, { httpsOnly: true, allowPrivate: false });
  const challenge = randomBytes(24).toString("base64url");
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "SignalHub-Webhook-Verifier/1.0" },
    body: JSON.stringify({ type: "signalhub.webhook.verify", challenge }),
    signal: AbortSignal.timeout(5_000),
    redirect: "manual",
  });
  const responseBody = await response.text();
  if (responseBody.length > 10_000) throw new Error("Webhook verification response is too large");
  let echoed: unknown = null;
  try {
    echoed = JSON.parse(responseBody);
  } catch {
    // The structured failure below is intentionally generic.
  }
  if (
    !response.ok || !echoed || typeof echoed !== "object" ||
    !("challenge" in echoed) || (echoed as { challenge?: unknown }).challenge !== challenge
  ) {
    throw new Error("Webhook verification failed: endpoint must echo the HTTPS challenge");
  }
  const secret = generateWebhookSecret();
  const document: Insertable<WebhookEndpointTable> & { id: string } = {
    id: newDatabaseId(),
    pageId,
    url,
    secretHash: secret.hash,
    secretCiphertext: encryptSecret(secret.token),
    secretPrefix: secret.prefix,
    secretLastFour: secret.lastFour,
    active: true,
    verifiedAt: new Date(),
    verificationTokenHash: hashSecret(challenge),
    createdAt: new Date(),
  };
  return { document, result: { endpoint: document, secret: secret.token } };
}

export async function insertVerifiedWebhookEndpoint(
  prepared: Awaited<ReturnType<typeof prepareVerifiedWebhookEndpoint>>,
  transaction: DatabaseTransaction
) {
  const endpoint = await transaction.insertInto("webhookEndpoints")
    .values(prepared.document).returningAll().executeTakeFirstOrThrow();
  return { endpoint, secret: prepared.result.secret };
}

export async function rotateWebhookEndpointSecret(endpointId: string, transaction: DatabaseTransaction) {
  const secret = generateWebhookSecret();
  const result = await transaction.updateTable("webhookEndpoints").set({
    secretHash: secret.hash,
    secretCiphertext: encryptSecret(secret.token),
    secretPrefix: secret.prefix,
    secretLastFour: secret.lastFour,
  }).where("id", "=", endpointId).where("active", "=", true)
    .returning("id").executeTakeFirst();
  return result ? secret : null;
}
