import { randomBytes } from "node:crypto";
import { ObjectId, type ClientSession } from "mongodb";
import { collections } from "@/lib/db";
import { encryptSecret } from "@/lib/encryption";
import { oid, toId } from "@/lib/mongo-utils";
import { hashSecret } from "@/lib/secrets";
import { validateHttpTarget } from "@/lib/target-validation";
import { generateWebhookSecret } from "@/lib/tokens";

export async function prepareVerifiedWebhookEndpoint(
  pageId: string,
  rawUrl: string
) {
  const url = String(rawUrl).trim();
  await validateHttpTarget(url, { httpsOnly: true, allowPrivate: false });

  const challenge = randomBytes(24).toString("base64url");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "Status-Webhook-Verifier/1.0",
    },
    body: JSON.stringify({ type: "status.webhook.verify", challenge }),
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
    !response.ok ||
    !echoed ||
    typeof echoed !== "object" ||
    !("challenge" in echoed) ||
    (echoed as { challenge?: unknown }).challenge !== challenge
  ) {
    throw new Error("Webhook verification failed: endpoint must echo the HTTPS challenge");
  }

  const secret = generateWebhookSecret();
  const endpointId = new ObjectId();
  const document = {
    _id: endpointId,
    pageId: oid(pageId),
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
  return {
    document,
    result: { endpoint: toId(document), secret: secret.token },
  };
}

export async function insertVerifiedWebhookEndpoint(
  prepared: Awaited<ReturnType<typeof prepareVerifiedWebhookEndpoint>>,
  session: ClientSession
) {
  await collections.webhookEndpoints().insertOne(prepared.document, {
    session,
  });
  return prepared.result;
}

export async function rotateWebhookEndpointSecret(
  endpointId: string,
  session?: ClientSession
) {
  const secret = generateWebhookSecret();
  const result = await collections.webhookEndpoints().updateOne(
    { _id: oid(endpointId), active: true },
    {
      $set: {
        secretHash: secret.hash,
        secretCiphertext: encryptSecret(secret.token),
        secretPrefix: secret.prefix,
        secretLastFour: secret.lastFour,
      },
    },
    { session }
  );
  return result.matchedCount ? secret : null;
}
