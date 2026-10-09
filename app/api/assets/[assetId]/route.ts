import { NextResponse } from "next/server";
import { readImageCached } from "@/lib/asset-storage";
import { isDatabaseId } from "@/lib/database-id";
import { errorFields, logger } from "@/lib/logger";
import { database } from "@/lib/postgres/client";

// Asset ids are minted per upload and never reused, so the response for an id
// is immutable: browsers and CDNs may keep it for a year and revalidate for free.
const CACHE_CONTROL = "public, max-age=31536000, immutable";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> }
) {
  const { assetId } = await params;
  if (!isDatabaseId(assetId)) return new NextResponse("Not found", { status: 404 });
  const asset = await database.selectFrom("assets")
    .select(["id", "storageDriver", "storageKey", "mimeType"])
    .where("id", "=", assetId).where("deletedAt", "is", null).executeTakeFirst();
  if (!asset) return new NextResponse("Not found", { status: 404 });

  const etag = `"${asset.id}"`;
  const validators = request.headers.get("if-none-match")?.split(",").map((value) => value.trim().replace(/^W\//, ""));
  if (validators?.includes(etag) || validators?.includes("*")) {
    return new NextResponse(null, { status: 304, headers: { etag, "cache-control": CACHE_CONTROL } });
  }

  try {
    const bytes = await readImageCached(asset.storageDriver, asset.storageKey);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "content-type": asset.mimeType,
        "content-length": String(bytes.length),
        "cache-control": CACHE_CONTROL,
        etag,
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    logger.error({ ...errorFields(error), assetId, storageDriver: asset.storageDriver }, "Asset read failed");
    return new NextResponse("Asset unavailable", { status: 503 });
  }
}
