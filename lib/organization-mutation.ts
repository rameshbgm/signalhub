import { ObjectId, type ClientSession } from "mongodb";
import { collections } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";

export class OrganizationMutationBlockedError extends Error {
  constructor() {
    super("The organization is not active");
    this.name = "OrganizationMutationBlockedError";
  }
}

/**
 * Establishes a durable ordering between an organization mutation and a
 * lifecycle transition.
 *
 * This must run inside the same MongoDB transaction as the tenant writes. The
 * organization-row update conflicts with suspension or deletion, while the
 * predicate prevents a transaction retried after that conflict from writing
 * into an inactive organization. The second branch preserves legacy
 * organizations that predate the explicit status field.
 */
export async function fenceActiveOrganizationMutation(
  organizationId: string | ObjectId,
  session: ClientSession
): Promise<void> {
  const result = await collections.organizations().updateOne(
    {
      _id:
        organizationId instanceof ObjectId
          ? organizationId
          : oid(organizationId),
      $or: [
        { status: "ACTIVE" },
        {
          status: { $exists: false },
          suspended: { $ne: true },
        },
      ],
    },
    { $inc: { mutationRevision: 1 } },
    { session }
  );
  if (result.matchedCount !== 1) {
    throw new OrganizationMutationBlockedError();
  }
}
