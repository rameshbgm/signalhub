import { randomUUID } from "node:crypto";
import { database } from "@/lib/postgres/client";

export type AssetStorageDriver = "DB";

interface AssetStorage {
  readonly driver: AssetStorageDriver;
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

class DbAssetStorage implements AssetStorage {
  readonly driver = "DB" as const;

  async put(key: string, bytes: Buffer, contentType: string) {
    // Plain insert: keys carry a UUID, so a collision is a bug, not an overwrite.
    await database.insertInto("assetBlobs").values({ storageKey: key, contentType, bytes }).execute();
  }

  async get(key: string) {
    const row = await database.selectFrom("assetBlobs").select("bytes")
      .where("storageKey", "=", key).executeTakeFirst();
    if (!row) throw new Error("Asset body is unavailable");
    return row.bytes;
  }

  async delete(key: string) {
    flushAssetCache(key);
    await database.deleteFrom("assetBlobs").where("storageKey", "=", key).execute();
  }
}

const dbStorage = new DbAssetStorage();

export function assetStorage() {
  return dbStorage;
}

/**
 * Opens the backend recorded on an asset row. Unlike `assetStorage()`, this
 * never falls back to the current deployment default when legacy/corrupt data
 * has no driver, which prevents reading or deleting the same key in the wrong
 * backend after a storage migration.
 */
export function assetStorageForDriver(driver: unknown) {
  if (driver !== "DB") {
    throw new Error("Asset storage driver is missing or unsupported");
  }
  return assetStorage();
}

// In-process byte cache for served images (never exports). Entries are keyed by
// storage key, which embeds a UUID, so they are immutable; delete() flushes the
// key and the serving route re-checks the asset row on every request, so a
// stale entry can never be served for a removed asset.
const CACHE_MAX_BYTES = 32 * 1024 * 1024;
const imageCache = new Map<string, Buffer>();
let cachedBytes = 0;

export function flushAssetCache(key?: string) {
  if (key === undefined) {
    imageCache.clear();
    cachedBytes = 0;
    return;
  }
  const hit = imageCache.get(key);
  if (!hit) return;
  imageCache.delete(key);
  cachedBytes -= hit.length;
}

export async function readImageCached(driver: unknown, key: string) {
  const hit = imageCache.get(key);
  if (hit) {
    imageCache.delete(key);
    imageCache.set(key, hit); // refresh LRU position
    return hit;
  }
  const bytes = await assetStorageForDriver(driver).get(key);
  if (bytes.length <= CACHE_MAX_BYTES / 4) {
    imageCache.set(key, bytes);
    cachedBytes += bytes.length;
    for (const [oldest, value] of imageCache) {
      if (cachedBytes <= CACHE_MAX_BYTES) break;
      imageCache.delete(oldest);
      cachedBytes -= value.length;
    }
  }
  return bytes;
}

export function newAssetKey(pageId: string, extension: string) {
  return `${pageId}/${randomUUID()}.${extension}`;
}
