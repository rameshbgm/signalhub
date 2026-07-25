import { NextRequest, NextResponse } from "next/server";
import { authenticateScim, scimError } from "@/lib/scim";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ connection: string }> }
) {
  const { connection } = await params;
  if (!(await authenticateScim(request, connection))) {
    return scimError(401, "A valid SCIM bearer token is required");
  }
  return NextResponse.json({
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: 200 },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: true },
    authenticationSchemes: [{
      type: "oauthbearertoken",
      name: "Bearer Token",
      description: "Connection-specific SCIM bearer token",
      specUri: "https://www.rfc-editor.org/rfc/rfc6750",
      primary: true,
    }],
  });
}
