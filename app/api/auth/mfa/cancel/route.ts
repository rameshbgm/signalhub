import { readRequestJson } from "@/lib/request-body";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validationError } from "@/lib/api-response";
import { mfaRouteError } from "@/lib/mfa/http";
import { cancelRequest } from "@/lib/mfa/requests";
import { consumeNamedLimit, requestIp } from "@/lib/rate-limit";

const schema = z.object({ token: z.string().min(10).max(200) });

/** "This wasn't me": cancels the pending request the emailed link belongs to. No sign-in needed. */
export async function POST(request: NextRequest) {
  try {
    const requestBody = await readRequestJson(request);
    if (requestBody instanceof Response) return requestBody;
    const parsed = schema.safeParse(requestBody);
    if (!parsed.success) return validationError(parsed.error);
    await consumeNamedLimit("mfa-ip", requestIp(request), "cancel");
    await cancelRequest({ token: parsed.data.token });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return mfaRouteError(error, "POST /api/auth/mfa/cancel");
  }
}
