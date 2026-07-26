import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export type AssetStorageDriver = "LOCAL" | "S3";

interface AssetStorage {
  readonly driver: AssetStorageDriver;
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

class LocalAssetStorage implements AssetStorage {
  readonly driver = "LOCAL" as const;
  // Resolves to /app/data/uploads in the container and <project>/data/uploads
  // during local development, so the same default works in both environments.
  private readonly root = path.resolve(
    process.env.ASSET_LOCAL_DIR ?? path.join(process.cwd(), "data", "uploads")
  );

  private file(key: string) {
    const target = path.resolve(this.root, key);
    if (!target.startsWith(`${this.root}${path.sep}`)) throw new Error("Invalid asset key");
    return target;
  }

  async put(key: string, bytes: Buffer) {
    const target = this.file(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: "wx" });
  }

  async get(key: string) {
    return readFile(this.file(key));
  }

  async delete(key: string) {
    await unlink(this.file(key)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
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
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

const cachedStorages = new Map<AssetStorageDriver, AssetStorage>();

export function assetStorage(driver?: AssetStorageDriver) {
  const resolvedDriver =
    driver ??
    ((process.env.ASSET_STORAGE_DRIVER ?? "local").toLowerCase() === "s3"
      ? "S3"
      : "LOCAL");
  const cached = cachedStorages.get(resolvedDriver);
  if (cached) return cached;
  const storage =
    resolvedDriver === "S3"
      ? new S3AssetStorage()
      : new LocalAssetStorage();
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
  if (driver !== "LOCAL" && driver !== "S3") {
    throw new Error("Asset storage driver is missing or unsupported");
  }
  return assetStorage(driver);
}

export function newAssetKey(pageId: string, extension: string) {
  return `${pageId}/${randomUUID()}.${extension}`;
}
