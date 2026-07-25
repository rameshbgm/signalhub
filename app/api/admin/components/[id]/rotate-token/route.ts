import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin-guard";
import { apiError, routeError } from "@/lib/api-response";
import { collections } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";
import { generateAutomationToken } from "@/lib/tokens";
import { withTransaction } from "@/lib/cascade";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireCapability("integration.manage");
    const { id } = await params;
    const component = await collections.components().findOne({ _id: oid(id) });
    if (!component) return apiError(404, "COMPONENT_NOT_FOUND", "Component not found");
    const page = await collections.pages().findOne({
      _id: component.pageId,
      orgId: oid(session.orgId),
    });
    if (!page) return apiError(404, "COMPONENT_NOT_FOUND", "Component not found");
    const secret = generateAutomationToken();
    await withTransaction(async (databaseSession) => {
      await fenceActiveOrganizationMutation(session.orgId, databaseSession);
      const currentPage = await collections.pages().findOne(
        { _id: component.pageId, orgId: oid(session.orgId) },
        { session: databaseSession }
      );
      if (!currentPage) throw new Error("Component not found");
      await collections.components().updateOne(
        { _id: component._id, pageId: currentPage._id },
        {
          $set: {
            automationTokenHash: secret.hash,
            automationTokenPrefix: secret.prefix,
            automationTokenLastFour: secret.lastFour,
          },
        },
        { session: databaseSession }
      );
    });
    return NextResponse.json({ token: secret.token, prefix: secret.prefix, lastFour: secret.lastFour });
  } catch (error) {
    return routeError(error);
  }
}
