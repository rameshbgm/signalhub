import { NextResponse } from "next/server";
import packageJson from "@/package.json";

export function GET() {
  return NextResponse.json({ live: true, service: "signalhub-web", version: packageJson.version });
}
