import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export async function authenticateApiKey(req: NextRequest) {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;

  const apiKey = await prisma.apiKey.findUnique({ where: { key: token } });
  if (!apiKey) return null;

  await prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } });
  return apiKey;
}
