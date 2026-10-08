import type { DatabaseTransaction } from "@/lib/postgres/client";
import { narrowSubscriberScope } from "@/lib/public-surface-policy";

/**
 * Subscriptions carry no visitor credential, so when an audience user is
 * removed or their services shrink, their email subscriptions must follow.
 * Matches by email: an SMS or differently-addressed subscription cannot be
 * tied back to a user.
 */
export async function reconcileAudienceSubscribers(
  transaction: DatabaseTransaction,
  page: { id: string; isHub: boolean },
  emails: string[]
) {
  for (const email of new Set(emails)) {
    const user = await transaction.selectFrom("pageAccessUsers").selectAll()
      .where("pageId", "=", page.id).where("email", "=", email).executeTakeFirst();
    // Hub visitors only sign in; services are enforced per child page.
    if (user && page.isHub) continue;

    let allowed: string[] = [];
    if (user) {
      const group = user.groupId
        ? await transaction.selectFrom("pageAccessGroups").select("componentIds")
            .where("id", "=", user.groupId).where("pageId", "=", page.id).executeTakeFirst()
        : null;
      allowed = Array.from(new Set([...user.componentIds, ...(group?.componentIds ?? [])]));
    }
    const subscribers = await transaction.selectFrom("subscribers").select(["id", "componentIds"])
      .where("pageId", "=", page.id).where("channel", "=", "EMAIL").where("contact", "=", email).execute();
    for (const subscriber of subscribers) {
      const next = narrowSubscriberScope(subscriber.componentIds, allowed);
      if (next === null) {
        await transaction.deleteFrom("subscribers").where("id", "=", subscriber.id).execute();
      } else if (next.length !== subscriber.componentIds.length || next.some((id, index) => id !== subscriber.componentIds[index])) {
        await transaction.updateTable("subscribers").set({ componentIds: next }).where("id", "=", subscriber.id).execute();
      }
    }
  }
}
