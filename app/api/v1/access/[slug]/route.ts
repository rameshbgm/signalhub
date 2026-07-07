import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword, createPageAccessSession } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await prisma.page.findUnique({ where: { slug } });
  if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  if (page.type === "PRIVATE") {
    if (!page.passwordHash || !(await verifyPassword(body.password ?? "", page.passwordHash))) {
      return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
    }
    await createPageAccessSession(page.id, {});
    return NextResponse.json({ ok: true });
  }

  if (page.type === "AUDIENCE") {
    const user = await prisma.pageAccessUser.findUnique({ where: { pageId_email: { pageId: page.id, email: body.email ?? "" } } });
    if (!user || !(await verifyPassword(body.password ?? "", user.passwordHash))) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }
    await createPageAccessSession(page.id, { userId: user.id, email: user.email });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "This page does not require access control" }, { status: 400 });
}
