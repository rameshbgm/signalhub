import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
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
import {
  DEFAULT_COVER_IMAGE_SETTINGS,
  normalizedCoverImageCrop,
  normalizedCoverImageSettings,
} from "@/lib/cover-image";

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
            {
              $set: {
                [PAGE_FIELD[kind]]: publicUrl,
                ...(kind === "COVER"
                  ? {
                      coverImageFit: DEFAULT_COVER_IMAGE_SETTINGS.fit,
                      coverImagePositionX: DEFAULT_COVER_IMAGE_SETTINGS.positionX,
                      coverImagePositionY: DEFAULT_COVER_IMAGE_SETTINGS.positionY,
                      coverImageCropX: null,
                      coverImageCropY: null,
                      coverImageCropWidth: null,
                      coverImageCropHeight: null,
                    }
                  : {}),
              },
            },
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
    revalidatePath(`/organization/pages/${pageId}`);
    revalidatePath(page.isHub ? `/hub/${page.slug}` : `/${page.slug}`, "layout");
    return NextResponse.json({
      ok: true,
      asset: {
        id: assetId.toHexString(),
        url: publicUrl,
        width: normalized.width,
        height: normalized.height,
        ...(kind === "COVER" ? { cover: DEFAULT_COVER_IMAGE_SETTINGS } : {}),
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

export async function PATCH(
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
    if (!page.coverImageUrl) {
      return apiError(409, "COVER_IMAGE_REQUIRED", "Upload a cover image before adjusting it");
    }
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return apiError(400, "INVALID_COVER_SETTINGS", "Cover image settings are required");
    }
    const fit = "fit" in body ? String(body.fit).toUpperCase() : "";
    if (fit !== "COVER" && fit !== "CONTAIN") {
      return apiError(400, "INVALID_COVER_FIT", "Choose fill frame or show full image");
    }
    const settings = normalizedCoverImageSettings({
      fit,
      positionX: "positionX" in body ? Number(body.positionX) : undefined,
      positionY: "positionY" in body ? Number(body.positionY) : undefined,
    });
    const crop = normalizedCoverImageCrop({
      cropX: "cropX" in body ? Number(body.cropX) : undefined,
      cropY: "cropY" in body ? Number(body.cropY) : undefined,
      cropWidth: "cropWidth" in body ? Number(body.cropWidth) : undefined,
      cropHeight: "cropHeight" in body ? Number(body.cropHeight) : undefined,
    });
    if (settings.fit === "COVER" && !crop) {
      return apiError(400, "INVALID_COVER_CROP", "Drag a crop frame over the image before saving");
    }
    const databaseSession = mongoClient.startSession();
    try {
      await databaseSession.withTransaction(async () => {
        await fenceActiveOrganizationMutation(session.orgId, databaseSession);
        const changed = await collections.pages().updateOne(
          { _id: page._id, orgId: page.orgId, coverImageUrl: { $ne: null } },
          {
            $set: {
              coverImageFit: settings.fit,
              coverImagePositionX: settings.positionX,
              coverImagePositionY: settings.positionY,
              coverImageCropX: crop?.x ?? null,
              coverImageCropY: crop?.y ?? null,
              coverImageCropWidth: crop?.width ?? null,
              coverImageCropHeight: crop?.height ?? null,
            },
          },
          { session: databaseSession }
        );
        if (!changed.matchedCount) {
          throw new Error("The cover image changed; reload and try again");
        }
      });
    } finally {
      await databaseSession.endSession();
    }
    revalidatePath(`/organization/pages/${pageId}`);
    revalidatePath(page.isHub ? `/hub/${page.slug}` : `/${page.slug}`, "layout");
    return NextResponse.json({
      ok: true,
      cover: {
        ...settings,
        cropX: crop?.x ?? null,
        cropY: crop?.y ?? null,
        cropWidth: crop?.width ?? null,
        cropHeight: crop?.height ?? null,
      },
    });
  } catch (error) {
    if (error instanceof OrganizationMutationBlockedError) {
      return apiError(409, "ORGANIZATION_NOT_ACTIVE", "The organization is no longer active");
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
    revalidatePath(`/organization/pages/${pageId}`);
    revalidatePath(page.isHub ? `/hub/${page.slug}` : `/${page.slug}`, "layout");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
