import { NextRequest, NextResponse } from "next/server";
import { fenceActiveOrganizationMutation, OrganizationMutationBlockedError } from "@/lib/organization-mutation";
import { database, withDatabaseTransaction } from "@/lib/postgres/client";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const subscriber = await database.selectFrom("subscribers").select("id").where("unsubscribeToken", "=", token).executeTakeFirst();
  if (!subscriber) return new NextResponse("This unsubscribe link is invalid or has already been used.", { status: 404 });
  const action = new URL(req.nextUrl.pathname, req.nextUrl.origin).toString();
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Notification preferences</title><style>body{margin:0;background:#0b1018;color:#edf3fa;font:16px system-ui,sans-serif}main{max-width:34rem;margin:10vh auto;padding:2rem;border:1px solid #2a3544;background:#111925}p{color:#aeb9c8;line-height:1.6}button{border:0;background:#38d7e7;color:#071116;padding:.75rem 1rem;font-weight:700;cursor:pointer}</style></head><body><main><h1>Notification preferences</h1><p>Stop incident and maintenance notifications for this subscription?</p><form method="post" action="${action}"><button type="submit">Unsubscribe</button></form></main></body></html>`;
  return new NextResponse(html, { status: 200, headers: {
    "content-type": "text/html; charset=utf-8", "cache-control": "no-store",
    "referrer-policy": "no-referrer", "x-content-type-options": "nosniff",
  }});
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const deleted = await withDatabaseTransaction(async (transaction) => {
      const subscriber = await transaction.selectFrom("subscribers as subscriber")
        .innerJoin("pages as page", "page.id", "subscriber.pageId")
        .select(["subscriber.id", "page.orgId"]).where("subscriber.unsubscribeToken", "=", token)
        .forUpdate("subscriber").executeTakeFirst();
      if (!subscriber) return false;
      await fenceActiveOrganizationMutation(subscriber.orgId, transaction);
      const result = await transaction.deleteFrom("subscribers").where("id", "=", subscriber.id)
        .where("unsubscribeToken", "=", token).returning("id").executeTakeFirst();
      return Boolean(result);
    });
    if (!deleted) return new NextResponse("This unsubscribe link is invalid or has already been used.", { status: 404 });
  } catch (error) {
    if (error instanceof OrganizationMutationBlockedError) {
      return new NextResponse("This subscription cannot be changed while its organization is inactive.", { status: 409 });
    }
    throw error;
  }
  return new NextResponse("You have been unsubscribed and will no longer receive status notifications.", {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" },
  });
}
