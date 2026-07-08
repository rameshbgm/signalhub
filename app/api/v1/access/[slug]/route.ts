import { NextRequest, NextResponse } from "next/server";
import { collections } from "@/lib/db";
import { toId } from "@/lib/mongo-utils";
import { verifyPassword, createPageAccessSession } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pageDoc = await collections.pages().findOne({ slug });
  if (!pageDoc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const page = toId(pageDoc);

  const body = await req.json().catch(() => ({}));

  if (page.type === "PRIVATE") {
    if (!page.passwordHash || !(await verifyPassword(body.password ?? "", page.passwordHash))) {
      return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
    }
    await createPageAccessSession(page.id, {});
    return NextResponse.json({ ok: true });
  }

  if (page.type === "AUDIENCE") {
    const userDoc = await collections.pageAccessUsers().findOne({ pageId: pageDoc._id, email: body.email ?? "" });
    if (!userDoc || !(await verifyPassword(body.password ?? "", userDoc.passwordHash))) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }
    const user = toId(userDoc);
    await createPageAccessSession(page.id, { userId: user.id, email: user.email });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "This page does not require access control" }, { status: 400 });
}
