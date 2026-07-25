import { NextResponse } from "next/server";
import { assetStorageForDriver } from "@/lib/asset-storage";
import { collections } from "@/lib/db";
import { isValidOid, oid } from "@/lib/mongo-utils";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ assetId: string }> }
) {
  const { assetId } = await params;
  if (!isValidOid(assetId)) return new NextResponse("Not found", { status: 404 });
  const asset = await collections.assets().findOne({ _id: oid(assetId), deletedAt: null });
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
  } catch {
    return new NextResponse("Asset unavailable", { status: 503 });
  }
}
