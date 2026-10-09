import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { database } from "@/lib/postgres/client";

export type AssetStorageDriver = "DB" | "S3";

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

class S3AssetStorage implements AssetStorage {
  readonly driver = "S3" as const;
  private readonly bucket: string;
  private readonly client: S3Client;

  constructor() {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) throw new Error("S3_BUCKET is required when ASSET_STORAGE_DRIVER=s3");
    this.bucket = bucket;
    this.client = new S3Client({
      region: process.env.S3_REGION ?? "us-east-1",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials:
        process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.S3_ACCESS_KEY_ID,
              secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
            }
          : undefined,
    });
  }

  async put(key: string, bytes: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      })
    );
  }

  async get(key: string) {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key })
    );
    if (!result.Body) throw new Error("Asset body is unavailable");
    return Buffer.from(await result.Body.transformToByteArray());
  }

  async delete(key: string) {
    flushAssetCache(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

const cachedStorages = new Map<AssetStorageDriver, AssetStorage>();

export function assetStorage(driver?: AssetStorageDriver) {
  const resolvedDriver =
    driver ??
    ((process.env.ASSET_STORAGE_DRIVER ?? "db").toLowerCase() === "s3"
      ? "S3"
      : "DB");
  const cached = cachedStorages.get(resolvedDriver);
  if (cached) return cached;
  const storage =
    resolvedDriver === "S3"
      ? new S3AssetStorage()
      : new DbAssetStorage();
  cachedStorages.set(resolvedDriver, storage);
  return storage;
}

/**
 * Opens the backend recorded on an asset row. Unlike `assetStorage()`, this
 * never falls back to the current deployment default when legacy/corrupt data
 * has no driver, which prevents reading or deleting the same key in the wrong
 * backend after a storage migration.
 */
export function assetStorageForDriver(driver: unknown) {
  if (driver !== "DB" && driver !== "S3") {
    throw new Error("Asset storage driver is missing or unsupported");
  }
  return assetStorage(driver);
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
