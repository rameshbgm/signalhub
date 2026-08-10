import { randomUUID } from "node:crypto";
import type { Updateable } from "kysely";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin-guard";
import { apiError, routeError } from "@/lib/api-response";
import { assetStorage, assetStorageForDriver, newAssetKey } from "@/lib/asset-storage";
import { AssetValidationError, normalizeAsset, type AssetKind } from "@/lib/assets";
import {
  DEFAULT_COVER_IMAGE_SETTINGS,
  normalizedCoverImageCrop,
  normalizedCoverImageSettings,
} from "@/lib/cover-image";
import {
  fenceActiveOrganizationMutation,
  OrganizationMutationBlockedError,
} from "@/lib/organization-mutation";
import { database, withDatabaseTransaction } from "@/lib/postgres/client";
import type { PageTable } from "@/lib/postgres/schema";

const PAGE_FIELD: Record<AssetKind, "logoUrl" | "faviconUrl" | "coverImageUrl"> = {
  LOGO: "logoUrl",
  FAVICON: "faviconUrl",
  COVER: "coverImageUrl",
};

function assetPageUpdate(kind: AssetKind, value: string | null): Updateable<PageTable> {
  if (kind === "LOGO") return { logoUrl: value };
  if (kind === "FAVICON") return { faviconUrl: value };
  return {
    coverImageUrl: value,
    ...(value ? {
      coverImageFit: DEFAULT_COVER_IMAGE_SETTINGS.fit,
      coverImagePositionX: DEFAULT_COVER_IMAGE_SETTINGS.positionX,
      coverImagePositionY: DEFAULT_COVER_IMAGE_SETTINGS.positionY,
      coverImageCropX: null,
      coverImageCropY: null,
      coverImageCropWidth: null,
      coverImageCropHeight: null,
    } : {}),
  };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ pageId: string }> }) {
  try {
    const { pageId } = await params;
    const staged = request.nextUrl.searchParams.get("stage") === "1";
    const session = await requireCapability("page.configure", pageId);
    const page = await database.selectFrom("pages").selectAll()
      .where("id", "=", pageId).where("orgId", "=", session.orgId)
      .where("deletedAt", "is", null).executeTakeFirst();
    if (!page) return apiError(404, "PAGE_NOT_FOUND", "Page not found");
    const formData = await request.formData();
    const file = formData.get("file");
    const kind = String(formData.get("kind") ?? "").toUpperCase() as AssetKind;
    if (!(file instanceof File)) return apiError(400, "FILE_REQUIRED", "Choose an image");
    if (!["LOGO", "FAVICON", "COVER"].includes(kind)) return apiError(400, "INVALID_ASSET_KIND", "Invalid asset type");
    const normalized = await normalizeAsset(file, kind);
    const storage = assetStorage();
    const storageKey = newAssetKey(pageId, normalized.extension);
    await storage.put(storageKey, normalized.bytes, normalized.mimeType);
    const assetId = randomUUID();
    const publicUrl = `/api/assets/${assetId}`;
    let previousAsset: { storageKey: string; storageDriver: "LOCAL" | "S3" } | undefined;
    try {
      previousAsset = await withDatabaseTransaction(async (transaction) => {
        await fenceActiveOrganizationMutation(session.orgId, transaction);
        const currentPage = await transaction.selectFrom("pages").selectAll()
          .where("id", "=", pageId).where("orgId", "=", session.orgId)
          .where("deletedAt", "is", null).forUpdate().executeTakeFirst();
        if (!currentPage) throw new Error("The page is no longer active; the uploaded asset was not saved");
        const previousUrl = staged ? null : currentPage[PAGE_FIELD[kind]];
        const previous = previousUrl
          ? await transaction.selectFrom("assets").selectAll()
              .where("publicUrl", "=", previousUrl).where("pageId", "=", pageId)
              .where("deletedAt", "is", null).forUpdate().executeTakeFirst()
          : undefined;
        await transaction.insertInto("assets").values({
          id: assetId, orgId: session.orgId, pageId, kind, storageDriver: storage.driver,
          storageKey, publicUrl, mimeType: normalized.mimeType, byteSize: normalized.bytes.length,
          width: normalized.width, height: normalized.height, createdBy: session.userId,
          createdAt: new Date(), deletedAt: null,
        }).execute();
        if (!staged) {
          const changed = await transaction.updateTable("pages").set(assetPageUpdate(kind, publicUrl))
            .where("id", "=", pageId).where("orgId", "=", session.orgId)
            .returning("id").executeTakeFirst();
          if (!changed) throw new Error("The page changed while the asset was being saved; retry the upload");
        }
        if (previous) {
          await transaction.updateTable("assets").set({ deletedAt: new Date() })
            .where("id", "=", previous.id).where("deletedAt", "is", null).execute();
          return { storageKey: previous.storageKey, storageDriver: previous.storageDriver };
        }
        return undefined;
      });
    } catch (error) {
      await storage.delete(storageKey);
      throw error;
    }
    if (previousAsset) await assetStorageForDriver(previousAsset.storageDriver).delete(previousAsset.storageKey).catch(() => undefined);
    revalidatePath(`/organization/pages/${pageId}`);
    if (!staged) revalidatePath(page.isHub ? `/hub/${page.slug}` : `/${page.slug}`, "layout");
    return NextResponse.json({
      ok: true,
      asset: {
        id: assetId, url: publicUrl, width: normalized.width, height: normalized.height,
        ...(kind === "COVER" ? { cover: DEFAULT_COVER_IMAGE_SETTINGS } : {}),
      },
    });
  } catch (error) {
    if (error instanceof AssetValidationError) return apiError(400, "INVALID_IMAGE", error.message);
    if (error instanceof OrganizationMutationBlockedError) {
      return apiError(409, "ORGANIZATION_NOT_ACTIVE", "The organization is no longer active; the uploaded asset was not saved");
    }
    return routeError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ pageId: string }> }) {
  try {
    const { pageId } = await params;
    const session = await requireCapability("page.configure", pageId);
    const page = await database.selectFrom("pages").selectAll()
      .where("id", "=", pageId).where("orgId", "=", session.orgId)
      .where("deletedAt", "is", null).executeTakeFirst();
    if (!page) return apiError(404, "PAGE_NOT_FOUND", "Page not found");
    if (!page.coverImageUrl) return apiError(409, "COVER_IMAGE_REQUIRED", "Upload a cover image before adjusting it");
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return apiError(400, "INVALID_COVER_SETTINGS", "Cover image settings are required");
    const fit = "fit" in body ? String(body.fit).toUpperCase() : "";
    if (fit !== "COVER" && fit !== "CONTAIN") return apiError(400, "INVALID_COVER_FIT", "Choose fill frame or show full image");
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
    if (settings.fit === "COVER" && !crop) return apiError(400, "INVALID_COVER_CROP", "Drag a crop frame over the image before saving");
    await withDatabaseTransaction(async (transaction) => {
      await fenceActiveOrganizationMutation(session.orgId, transaction);
      const changed = await transaction.updateTable("pages").set({
        coverImageFit: settings.fit, coverImagePositionX: settings.positionX,
        coverImagePositionY: settings.positionY, coverImageCropX: crop?.x ?? null,
        coverImageCropY: crop?.y ?? null, coverImageCropWidth: crop?.width ?? null,
        coverImageCropHeight: crop?.height ?? null,
      }).where("id", "=", pageId).where("orgId", "=", session.orgId)
        .where("coverImageUrl", "is not", null).returning("id").executeTakeFirst();
      if (!changed) throw new Error("The cover image changed; reload and try again");
    });
    revalidatePath(`/organization/pages/${pageId}`);
    revalidatePath(page.isHub ? `/hub/${page.slug}` : `/${page.slug}`, "layout");
    return NextResponse.json({
      ok: true,
      cover: {
        ...settings, cropX: crop?.x ?? null, cropY: crop?.y ?? null,
        cropWidth: crop?.width ?? null, cropHeight: crop?.height ?? null,
      },
    });
  } catch (error) {
    if (error instanceof OrganizationMutationBlockedError) return apiError(409, "ORGANIZATION_NOT_ACTIVE", "The organization is no longer active");
    return routeError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ pageId: string }> }) {
  try {
    const { pageId } = await params;
    const kind = String(request.nextUrl.searchParams.get("kind") ?? "").toUpperCase() as AssetKind;
    if (!["LOGO", "FAVICON", "COVER"].includes(kind)) return apiError(400, "INVALID_ASSET_KIND", "Invalid asset type");
    const session = await requireCapability("page.configure", pageId);
    const page = await database.selectFrom("pages").selectAll()
      .where("id", "=", pageId).where("orgId", "=", session.orgId)
      .where("deletedAt", "is", null).executeTakeFirst();
    if (!page) return apiError(404, "PAGE_NOT_FOUND", "Page not found");
    const field = PAGE_FIELD[kind];
    const asset = await withDatabaseTransaction(async (transaction) => {
      await fenceActiveOrganizationMutation(session.orgId, transaction);
      const currentPage = await transaction.selectFrom("pages").selectAll()
        .where("id", "=", pageId).where("orgId", "=", session.orgId).forUpdate().executeTakeFirst();
      if (!currentPage) throw new Error("Page not found in your organization");
      const currentUrl = currentPage[field];
      const currentAsset = currentUrl
        ? await transaction.selectFrom("assets").selectAll().where("pageId", "=", pageId)
            .where("publicUrl", "=", currentUrl).where("deletedAt", "is", null).forUpdate().executeTakeFirst()
        : undefined;
      await transaction.updateTable("pages").set(assetPageUpdate(kind, null)).where("id", "=", pageId).execute();
      if (currentAsset) {
        await transaction.updateTable("assets").set({ deletedAt: new Date() })
          .where("id", "=", currentAsset.id).where("deletedAt", "is", null).execute();
      }
      return currentAsset;
    });
    if (asset) await assetStorageForDriver(asset.storageDriver).delete(asset.storageKey).catch(() => undefined);
    revalidatePath(`/organization/pages/${pageId}`);
    revalidatePath(page.isHub ? `/hub/${page.slug}` : `/${page.slug}`, "layout");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
