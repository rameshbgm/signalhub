import { ObjectId, type ClientSession } from "mongodb";
import {
  collections,
  mongoClient,
  type AuditLogDoc,
} from "@/lib/db";
import { oid } from "@/lib/mongo-utils";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";

export async function writeActiveTenantAudit(
  organizationId: string | ObjectId,
  audit: Omit<AuditLogDoc, "_id" | "orgId">
): Promise<void>;
export async function writeActiveTenantAudit<T>(
  organizationId: string | ObjectId,
  audit: Omit<AuditLogDoc, "_id" | "orgId">,
  verify: (session: ClientSession) => Promise<T>
): Promise<T>;
export async function writeActiveTenantAudit<T>(
  organizationId: string | ObjectId,
  audit: Omit<AuditLogDoc, "_id" | "orgId">,
  verify?: (session: ClientSession) => Promise<T>
) {
  const databaseSession = mongoClient.startSession();
  try {
    let verified: T | undefined;
    await databaseSession.withTransaction(async () => {
      await fenceActiveOrganizationMutation(
        organizationId,
        databaseSession
      );
      verified = verify
        ? await verify(databaseSession)
        : undefined;
      await collections.auditLogs().insertOne(
        {
          _id: new ObjectId(),
          orgId:
            organizationId instanceof ObjectId
              ? organizationId
              : oid(organizationId),
          ...audit,
        },
        { session: databaseSession }
      );
    });
    return verified as T;
  } finally {
    await databaseSession.endSession();
  }
}
