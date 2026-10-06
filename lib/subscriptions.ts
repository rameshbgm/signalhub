import { isDatabaseId } from "@/lib/database-id";
import { fenceActiveOrganizationMutation, OrganizationMutationBlockedError } from "@/lib/organization-mutation";
import { database, withDatabaseTransaction } from "@/lib/postgres/client";
import { publicPagePath } from "@/lib/public-path";
import { publicAppUrl } from "@/lib/url";

/**
 * Visitor-side subscription management. The unsubscribe token in every
 * message is the credential: it is random, unguessable, and scoped to one
 * subscription, so these helpers never need a login.
 */

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export function isSubscriptionToken(token: string) {
  return TOKEN_PATTERN.test(token);
}

/** Masks a contact for display on a page reachable by link: "j•••@example.com". */
export function maskContact(contact: string) {
  const at = contact.indexOf("@");
  if (at > 0) return `${contact[0]}•••${contact.slice(at)}`;
  return contact.length > 4 ? `•••${contact.slice(-4)}` : "•••";
}

export async function findSubscription(token: string) {
  if (!isSubscriptionToken(token)) return null;
  return database.selectFrom("subscribers as subscriber")
    .innerJoin("pages as page", "page.id", "subscriber.pageId")
    .select([
      "subscriber.id", "subscriber.channel", "subscriber.contact", "subscriber.componentIds",
      "subscriber.verified", "subscriber.quarantined",
      "page.id as pageId", "page.slug", "page.name as pageName", "page.type as pageType", "page.isHub", "page.orgId",
    ])
    .where("subscriber.unsubscribeToken", "=", token)
    .where("page.deletedAt", "is", null)
    .executeTakeFirst();
}

/** Services a subscriber may choose from: visible ones on the page. */
export async function subscribableComponents(pageId: string) {
  return database.selectFrom("components").select(["id", "name"])
    .where("pageId", "=", pageId).where("visible", "=", true)
    .orderBy("order").execute();
}

export type SubscriptionChange = { ok: true } | { ok: false; error: string };

/**
 * Narrows (or widens) a subscription to chosen services. An empty selection
 * means "all services". Audience pages keep the scope chosen at sign-up,
 * because a visitor's allowed services can only be checked after sign-in.
 */
export async function updateSubscriptionScope(token: string, componentIds: string[]): Promise<SubscriptionChange> {
  const subscription = await findSubscription(token);
  if (!subscription) return { ok: false, error: "This subscription no longer exists." };
  if (subscription.pageType === "AUDIENCE") {
    return { ok: false, error: "Service choices for this private page are set when you subscribe." };
  }
  const requested = [...new Set(componentIds)];
  if (requested.some((id) => !isDatabaseId(id))) return { ok: false, error: "One or more services are unavailable." };
  const allowed = new Set((await subscribableComponents(subscription.pageId)).map((component) => component.id));
  if (requested.some((id) => !allowed.has(id))) return { ok: false, error: "One or more services are unavailable." };
  try {
    await withDatabaseTransaction(async (transaction) => {
      await fenceActiveOrganizationMutation(subscription.orgId, transaction);
      await transaction.updateTable("subscribers").set({ componentIds: requested })
        .where("id", "=", subscription.id).where("unsubscribeToken", "=", token).execute();
    });
  } catch (error) {
    if (error instanceof OrganizationMutationBlockedError) return { ok: false, error: "This status page is not accepting changes right now." };
    throw error;
  }
  return { ok: true };
}

/** Removes the subscription. Idempotent from the visitor's point of view. */
export async function unsubscribe(token: string): Promise<SubscriptionChange & { removed?: boolean }> {
  if (!isSubscriptionToken(token)) return { ok: true, removed: false };
  try {
    const removed = await withDatabaseTransaction(async (transaction) => {
      const subscriber = await transaction.selectFrom("subscribers as subscriber")
        .innerJoin("pages as page", "page.id", "subscriber.pageId")
        .select(["subscriber.id", "page.orgId"]).where("subscriber.unsubscribeToken", "=", token)
        .forUpdate("subscriber").executeTakeFirst();
      if (!subscriber) return false;
      await fenceActiveOrganizationMutation(subscriber.orgId, transaction);
      const result = await transaction.deleteFrom("subscribers").where("id", "=", subscriber.id)
        .where("unsubscribeToken", "=", token).returning("id").executeTakeFirst();
      return Boolean(result);
    });
    return { ok: true, removed };
  } catch (error) {
    if (error instanceof OrganizationMutationBlockedError) return { ok: false, error: "This status page is not accepting changes right now." };
    throw error;
  }
}

/** Absolute links placed in every subscriber message. */
export function subscriptionLinks(page: { slug: string; isHub?: boolean }, token: string) {
  let base: string;
  try {
    base = publicAppUrl().replace(/\/+$/, "");
  } catch {
    return null;
  }
  return {
    // The preferences page, themed like the status page.
    manage: `${base}${publicPagePath({ slug: page.slug })}/subscription/${token}`,
    // Stable API URL: GET redirects to the page above; POST is RFC 8058 one-click.
    unsubscribe: `${base}/api/v1/subscribe/unsubscribe/${token}`,
  };
}
