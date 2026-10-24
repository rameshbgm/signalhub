import { NextRequest, NextResponse } from "next/server";
import { apiError, routeError } from "@/lib/api-response";
import { findEnabledConnection, samlConnectionConfig } from "@/lib/identity-connections";
import { createSamlClient } from "@/lib/saml";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ connection: string }> }
) {
  try {
    const { connection: slug } = await params;
    const connection = await findEnabledConnection(slug, "SAML");
    if (!connection) return apiError(404, "IDENTITY_CONNECTION_NOT_FOUND", "Identity connection not found");
    const config = samlConnectionConfig(connection);
    const metadata = createSamlClient(connection, request.nextUrl.origin)
      .generateServiceProviderMetadata(null, config.spCertificate ?? null);
    return new NextResponse(metadata, {
      headers: { "content-type": "application/samlmetadata+xml; charset=utf-8" },
    });
  } catch (error) {
    return routeError(error);
  }
}
