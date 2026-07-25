import { NextRequest, NextResponse } from "next/server";
import { applicationMetrics } from "@/lib/metrics";
import { secretMatches, hashSecret } from "@/lib/secrets";

export async function GET(request: NextRequest) {
  const configured = process.env.METRICS_TOKEN;
  if (!configured) return new NextResponse("Not found", { status: 404 });
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token || !secretMatches(token, hashSecret(configured))) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  return new NextResponse(await applicationMetrics(), {
    headers: {
      "content-type": "text/plain; version=0.0.4; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
