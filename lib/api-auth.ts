import { NextRequest } from "next/server";
import { collections } from "@/lib/db";
import { toId } from "@/lib/mongo-utils";

export async function authenticateApiKey(req: NextRequest) {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;

  const apiKeyDoc = await collections.apiKeys().findOne({ key: token });
  if (!apiKeyDoc) return null;

  await collections.apiKeys().updateOne({ _id: apiKeyDoc._id }, { $set: { lastUsedAt: new Date() } });
  return toId(apiKeyDoc);
}
