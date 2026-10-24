import { NextRequest, NextResponse } from "next/server";
import { authenticateScim, SCIM_GROUP_SCHEMA, SCIM_USER_SCHEMA, scimError } from "@/lib/scim";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ connection: string }> }
) {
  const { connection } = await params;
  if (!(await authenticateScim(request, connection))) return scimError(401, "A valid SCIM bearer token is required");
  return NextResponse.json({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults: 2,
    startIndex: 1,
    itemsPerPage: 2,
    Resources: [
      { schemas: ["urn:ietf:params:scim:schemas:core:2.0:ResourceType"], id: "User", name: "User", endpoint: "/Users", schema: SCIM_USER_SCHEMA },
      { schemas: ["urn:ietf:params:scim:schemas:core:2.0:ResourceType"], id: "Group", name: "Group", endpoint: "/Groups", schema: SCIM_GROUP_SCHEMA },
    ],
  });
}
