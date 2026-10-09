import { NextResponse, type NextRequest } from "next/server";
import { guardSetupRequest, readJson, reloadAfterResponse, setupError } from "@/lib/setup/http";
import { revokeSetupToken } from "@/lib/setup/token";

const text = (value: unknown) => (typeof value === "string" ? value : "");

export async function POST(request: NextRequest) {
  const denied = guardSetupRequest(request, "admin");
  if (denied) return denied;
  // Imported lazily: this module is only usable once a database is configured.
  const { adminInputErrors, bootstrapInstance, normalizeAdminInput, SetupAlreadyCompleteError } = await import("@/lib/setup/admin");
  const body = (await readJson<Record<string, unknown>>(request)) ?? {};
  const input = normalizeAdminInput({
    username: text(body.username),
    password: text(body.password),
    name: text(body.name),
    email: text(body.email),
    organizationName: text(body.organizationName),
    organizationSlug: text(body.organizationSlug),
  });
  const fields = adminInputErrors(input, { strict: true });
  if (Object.keys(fields).length) {
    return setupError(422, "SETUP_INVALID_ADMIN", "Check the highlighted fields.", { fields });
  }
  try {
    // The person chose this password just now, so no forced change at first login.
    const result = await bootstrapInstance(input, { onlyIfNoUsers: true, mustChangePassword: false });
    await revokeSetupToken();
    reloadAfterResponse();
    return NextResponse.json({ username: result.username, organization: result.organization });
  } catch (error) {
    if (error instanceof SetupAlreadyCompleteError) return setupError(409, error.code, error.message);
    throw error;
  }
}
