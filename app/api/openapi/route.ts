import { NextResponse } from "next/server";
import { openApiDocument } from "@/lib/openapi";

export function GET() {
  return NextResponse.json(openApiDocument, {
    headers: {
      "cache-control": "public, max-age=300",
      "access-control-allow-origin": "*",
    },
  });
}
