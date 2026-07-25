import { NextRequest, NextResponse } from "next/server";
import { collections, mongoClient } from "@/lib/db";
import {
  fenceActiveOrganizationMutation,
  OrganizationMutationBlockedError,
} from "@/lib/organization-mutation";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sub = await collections.subscribers().findOne({ unsubscribeToken: token });
  if (!sub) {
    return new NextResponse("This unsubscribe link is invalid or has already been used.", { status: 404 });
  }
  const action = new URL(req.nextUrl.pathname, req.nextUrl.origin).toString();
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Notification preferences</title><style>
body{margin:0;background:#0b1018;color:#edf3fa;font:16px system-ui,sans-serif}
main{max-width:34rem;margin:10vh auto;padding:2rem;border:1px solid #2a3544;background:#111925}
p{color:#aeb9c8;line-height:1.6}button{border:0;background:#38d7e7;color:#071116;padding:.75rem 1rem;font-weight:700;cursor:pointer}
</style></head><body><main><h1>Notification preferences</h1>
<p>Stop incident and maintenance notifications for this subscription?</p>
<form method="post" action="${action}"><button type="submit">Unsubscribe</button></form>
</main></body></html>`;
  return new NextResponse(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const databaseSession = mongoClient.startSession();
  let deleted = false;
  try {
    deleted =
      (await databaseSession.withTransaction(async () => {
        const sub = await collections.subscribers().findOne(
          { unsubscribeToken: token },
          { session: databaseSession }
        );
        if (!sub) return false;
        const page = await collections.pages().findOne(
          { _id: sub.pageId },
          { session: databaseSession }
        );
        if (!page) return false;
        await fenceActiveOrganizationMutation(
          page.orgId,
          databaseSession
        );
        const result = await collections.subscribers().deleteOne(
          { _id: sub._id, unsubscribeToken: token },
          { session: databaseSession }
        );
        return result.deletedCount === 1;
      })) ?? false;
  } catch (error) {
    if (error instanceof OrganizationMutationBlockedError) {
      return new NextResponse(
        "This subscription cannot be changed while its organization is inactive.",
        { status: 409 }
      );
    }
    throw error;
  } finally {
    await databaseSession.endSession();
  }
  if (!deleted) {
    return new NextResponse("This unsubscribe link is invalid or has already been used.", { status: 404 });
  }
  return new NextResponse("You have been unsubscribed and will no longer receive status notifications.", {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    },
  });
}
