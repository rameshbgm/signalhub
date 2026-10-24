import { NextRequest, NextResponse } from "next/server";
import { currentSetupMode, guardSetupOrigin, requestIsHttps, setupError } from "@/lib/setup/http";
import { SETUP_COOKIE, validSetupToken } from "@/lib/setup/token";

export async function POST(request: NextRequest) {
  if (!currentSetupMode()) return setupError(409, "SETUP_STEP_UNAVAILABLE", "Setup is not available.");
  const denied = guardSetupOrigin(request);
  if (denied) return denied;
  // Read a bounded form body before parsing; this route runs without a database.
  const reader = request.body?.getReader();
  let body = "";
  let bytes = 0;
  const decoder = new TextDecoder();
  if (reader) {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 1024) {
          await reader.cancel();
          return setupError(413, "SETUP_INPUT_TOO_LARGE", "Setup token is too long.");
        }
        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
    } finally {
      reader.releaseLock();
    }
  }
  const token = new URLSearchParams(body).get("token") ?? "";
  const valid = validSetupToken(token);
  // Stay on the browser's origin even when Next is listening behind a proxy
  // or represents its internal request origin as localhost.
  const response = new NextResponse(null, { status: 303, headers: { location: valid ? "/setup" : "/setup?error=token" } });
  response.headers.set("cache-control", "no-store");
  if (valid) {
    response.cookies.set(SETUP_COOKIE, token, {
      httpOnly: true, secure: requestIsHttps(request), sameSite: "strict", path: "/", maxAge: 60 * 60,
    });
  }
  return response;
}
