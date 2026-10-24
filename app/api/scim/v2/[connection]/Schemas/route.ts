import { NextRequest, NextResponse } from "next/server";
import { authenticateScim, SCIM_GROUP_SCHEMA, SCIM_USER_SCHEMA, scimError } from "@/lib/scim";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ connection: string }> }
) {
  const { connection } = await params;
  if (!(await authenticateScim(request, connection))) return scimError(401, "A valid SCIM bearer token is required");
  const resources = [
    {
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:Schema"],
      id: SCIM_USER_SCHEMA,
      name: "User",
      description: "Enterprise user",
      attributes: [
        { name: "userName", type: "string", multiValued: false, required: true, uniqueness: "server", mutability: "readWrite", returned: "default", caseExact: false },
        { name: "displayName", type: "string", multiValued: false, required: false, mutability: "readWrite", returned: "default" },
        { name: "active", type: "boolean", multiValued: false, required: false, mutability: "readWrite", returned: "default" },
      ],
    },
    {
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:Schema"],
      id: SCIM_GROUP_SCHEMA,
      name: "Group",
      description: "Enterprise group",
      attributes: [
        { name: "displayName", type: "string", multiValued: false, required: true, uniqueness: "server", mutability: "readWrite", returned: "default" },
        { name: "members", type: "complex", multiValued: true, required: false, mutability: "readWrite", returned: "default" },
      ],
    },
  ];
  return NextResponse.json({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults: resources.length,
    startIndex: 1,
    itemsPerPage: resources.length,
    Resources: resources,
  });
}
