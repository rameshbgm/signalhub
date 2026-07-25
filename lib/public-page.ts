import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";

export async function isPageOrganizationActive(orgId: ObjectId | string) {
  return Boolean(
    await collections.organizations().findOne(
      {
        _id: typeof orgId === "string" ? oid(orgId) : orgId,
        suspended: { $ne: true },
        status: { $nin: ["PROVISIONING", "SUSPENDED", "DELETING"] },
      },
      { projection: { _id: 1 } }
    )
  );
}
