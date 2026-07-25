import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import {
  assetStorage,
  assetStorageForDriver,
  newAssetKey,
} from "@/lib/asset-storage";
import { AssetValidationError, normalizeAsset, type AssetKind } from "@/lib/assets";
import { requireCapability } from "@/lib/admin-guard";
import { apiError, routeError } from "@/lib/api-response";
import { collections, mongoClient } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";
import {
  fenceActiveOrganizationMutation,
  OrganizationMutationBlockedError,
} from "@/lib/organization-mutation";

const PAGE_FIELD: Record<AssetKind, "logoUrl" | "faviconUrl" | "coverImageUrl"> = {
  LOGO: "logoUrl",
  FAVICON: "faviconUrl",
  COVER: "coverImageUrl",
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const { pageId } = await params;
    const session = await requireCapability("page.configure", pageId);
    const page = await collections.pages().findOne({
      _id: oid(pageId),
      orgId: oid(session.orgId),
    });
    if (!page) return apiError(404, "PAGE_NOT_FOUND", "Page not found");
    const formData = await request.formData();
    const file = formData.get("file");
    const kind = String(formData.get("kind") ?? "").toUpperCase() as AssetKind;
    if (!(file instanceof File)) return apiError(400, "FILE_REQUIRED", "Choose an image");
    if (!["LOGO", "FAVICON", "COVER"].includes(kind)) {
      return apiError(400, "INVALID_ASSET_KIND", "Invalid asset type");
    }
    const normalized = await normalizeAsset(file, kind);
    const storage = assetStorage();
    const storageKey = newAssetKey(pageId, normalized.extension);
    await storage.put(storageKey, normalized.bytes, normalized.mimeType);
    const assetId = new ObjectId();
    const publicUrl = `/api/assets/${assetId.toHexString()}`;
    let previousStorageKey: string | null = null;
    let previousStorageDriver: "LOCAL" | "S3" | null = null;
    try {
      const databaseSession = mongoClient.startSession();
      try {
        await databaseSession.withTransaction(async () => {
          previousStorageKey = null;
          previousStorageDriver = null;
          await fenceActiveOrganizationMutation(
            page.orgId,
            databaseSession
          );
          const currentPage = await collections.pages().findOne(
            { _id: page._id, orgId: page.orgId },
            { session: databaseSession }
          );
          if (!currentPage) {
            throw new Error(
              "The page is no longer active; the uploaded asset was not saved"
            );
          }
          const previousUrl = currentPage[PAGE_FIELD[kind]];
          const previousAsset = previousUrl
            ? await collections.assets().findOne(
                {
                  publicUrl: previousUrl,
                  pageId: currentPage._id,
                  deletedAt: null,
                },
                { session: databaseSession }
              )
            : null;
          await collections.assets().insertOne(
            {
              _id: assetId,
              orgId: currentPage.orgId,
              pageId: currentPage._id,
              kind,
              storageDriver: storage.driver,
              storageKey,
              publicUrl,
              mimeType: normalized.mimeType,
              byteSize: normalized.bytes.length,
              width: normalized.width,
              height: normalized.height,
              createdBy: oid(session.userId),
              createdAt: new Date(),
              deletedAt: null,
            },
            { session: databaseSession }
          );
          const updatedPage = await collections.pages().updateOne(
            { _id: currentPage._id, orgId: currentPage.orgId },
            { $set: { [PAGE_FIELD[kind]]: publicUrl } },
            { session: databaseSession }
          );
          if (updatedPage.matchedCount !== 1) {
            throw new Error(
              "The page changed while the asset was being saved; retry the upload"
            );
          }
          if (previousAsset) {
            await collections.assets().updateOne(
              { _id: previousAsset._id, deletedAt: null },
              { $set: { deletedAt: new Date() } },
              { session: databaseSession }
            );
            previousStorageKey = previousAsset.storageKey;
            previousStorageDriver = previousAsset.storageDriver;
          }
        });
      } finally {
        await databaseSession.endSession();
      }
      if (previousStorageKey && previousStorageDriver) {
        await assetStorageForDriver(previousStorageDriver)
          .delete(previousStorageKey)
          .catch(() => undefined);
      }
    } catch (error) {
      await storage.delete(storageKey);
      throw error;
    }
    return NextResponse.json({
      ok: true,
      asset: {
        id: assetId.toHexString(),
        url: publicUrl,
        width: normalized.width,
        height: normalized.height,
      },
    });
  } catch (error) {
    if (error instanceof AssetValidationError) {
      return apiError(400, "INVALID_IMAGE", error.message);
    }
    if (error instanceof OrganizationMutationBlockedError) {
      return apiError(
        409,
        "ORGANIZATION_NOT_ACTIVE",
        "The organization is no longer active; the uploaded asset was not saved"
      );
    }
    return routeError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const { pageId } = await params;
    const kind = String(request.nextUrl.searchParams.get("kind") ?? "").toUpperCase() as AssetKind;
    if (!["LOGO", "FAVICON", "COVER"].includes(kind)) {
      return apiError(400, "INVALID_ASSET_KIND", "Invalid asset type");
    }
    const session = await requireCapability("page.configure", pageId);
    const page = await collections.pages().findOne({ _id: oid(pageId), orgId: oid(session.orgId) });
    if (!page) return apiError(404, "PAGE_NOT_FOUND", "Page not found");
    const field = PAGE_FIELD[kind];
    const databaseSession = mongoClient.startSession();
    try {
      await databaseSession.withTransaction(async () => {
        await fenceActiveOrganizationMutation(session.orgId, databaseSession);
        const currentPage = await collections.pages().findOne(
          { _id: page._id, orgId: oid(session.orgId) },
          { session: databaseSession }
        );
        if (!currentPage) throw new Error("Page not found in your organization");
        const currentUrl = currentPage[field];
        const asset = currentUrl
          ? await collections.assets().findOne(
              {
                pageId: currentPage._id,
                publicUrl: currentUrl,
                deletedAt: null,
              },
              { session: databaseSession }
            )
          : null;
        if (asset) {
          await assetStorageForDriver(asset.storageDriver).delete(
            asset.storageKey
          );
        }
        const changedPage = await collections.pages().updateOne(
          { _id: currentPage._id, orgId: currentPage.orgId },
          { $set: { [field]: null } },
          { session: databaseSession }
        );
        if (!changedPage.matchedCount) {
          throw new Error("Page changed while the asset was being removed");
        }
        if (asset) {
          const changedAsset = await collections.assets().updateOne(
            { _id: asset._id, pageId: currentPage._id, deletedAt: null },
            { $set: { deletedAt: new Date() } },
            { session: databaseSession }
          );
          if (!changedAsset.matchedCount) {
            throw new Error("Asset changed while it was being removed");
          }
        }
      });
    } finally {
      await databaseSession.endSession();
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
