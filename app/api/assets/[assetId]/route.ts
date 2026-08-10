import { NextResponse } from "next/server";
import { assetStorageForDriver } from "@/lib/asset-storage";
import { isDatabaseId } from "@/lib/database-id";
import { errorFields, logger } from "@/lib/logger";
import { database } from "@/lib/postgres/client";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ assetId: string }> }
) {
  const { assetId } = await params;
  if (!isDatabaseId(assetId)) return new NextResponse("Not found", { status: 404 });
  const asset = await database.selectFrom("assets").selectAll()
    .where("id", "=", assetId).where("deletedAt", "is", null).executeTakeFirst();
  if (!asset) return new NextResponse("Not found", { status: 404 });
  try {
    const bytes = await assetStorageForDriver(asset.storageDriver).get(
      asset.storageKey
    );
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "content-type": asset.mimeType,
        "content-length": String(bytes.length),
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    logger.error({ ...errorFields(error), assetId, storageDriver: asset.storageDriver }, "Asset read failed");
    return new NextResponse("Asset unavailable", { status: 503 });
  }
}
