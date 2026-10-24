import { NextRequest, NextResponse } from "next/server";
import { findSubscription, unsubscribe } from "@/lib/subscriptions";

const PRIVATE_HEADERS = { "cache-control": "no-store", "referrer-policy": "no-referrer" };

/**
 * Links in older emails point here. Send the visitor to the themed
 * preferences page for this subscription, where they can change services or
 * confirm unsubscribing. A GET never unsubscribes, so mail scanners that
 * prefetch links cannot remove anyone.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const subscription = await findSubscription(token);
  if (!subscription) {
    return new NextResponse("This link is no longer valid. You may already be unsubscribed.", {
      status: 404,
      headers: { ...PRIVATE_HEADERS, "content-type": "text/plain; charset=utf-8" },
    });
  }
  const target = new URL(`/${encodeURIComponent(subscription.slug)}/subscription/${token}`, req.nextUrl.origin);
  return NextResponse.redirect(target, { status: 303, headers: PRIVATE_HEADERS });
}

/**
 * RFC 8058 one-click unsubscribe, sent by mail clients from the
 * List-Unsubscribe header. Repeating it is harmless.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await unsubscribe(token);
  if (!result.ok) {
    return new NextResponse(result.error, { status: 409, headers: { ...PRIVATE_HEADERS, "content-type": "text/plain; charset=utf-8" } });
  }
  return new NextResponse(
    result.removed
      ? "You have been unsubscribed and will no longer receive status notifications."
      : "This subscription was already removed.",
    { status: 200, headers: { ...PRIVATE_HEADERS, "content-type": "text/plain; charset=utf-8" } },
  );
}
