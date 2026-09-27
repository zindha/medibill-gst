/**
 * Cloud Backup Module — encrypts and uploads backups to S3, R2, or Google Drive.
 * Encryption: AES-256-GCM (shared ./crypto.js). IV is prepended to ciphertext.
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync, statSync } from "fs";
import { db } from "../db/index.js";
import { settings } from "../db/schema/index.js";
import { eq } from "drizzle-orm";
import { encryptFile } from "./crypto.js";
import { getDriveStatus, uploadBackupToDrive } from "./drive.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CloudProvider = "s3" | "r2" | "gdrive";

export interface CloudConfig {
  provider: CloudProvider;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  folder: string;
  encryptionKey: string; // 32-byte hex string (64 chars)
}

export interface CloudStatus {
  configured: boolean;
  provider: CloudProvider | null;
  bucket: string | null;
  region: string | null;
  folder: string | null;
  email?: string | null;
}

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

const CLOUD_KEYS = [
  "cloud_backup_provider",
  "cloud_backup_bucket",
  "cloud_backup_region",
  "cloud_backup_access_key_id",
  "cloud_backup_secret_access_key",
  "cloud_backup_folder",
  "cloud_backup_encryption_key",
] as const;

async function getSetting(key: string): Promise<string | null> {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, key) });
  return row?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  const existing = await db.query.settings.findFirst({ where: eq(settings.key, key) });
  if (existing) {
    await db.update(settings).set({ value }).where(eq(settings.key, key));
  } else {
    await db.insert(settings).values({ key, value });
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getCloudConfig(): Promise<CloudConfig | null> {
  const [provider, bucket, region, accessKeyId, secretAccessKey, folder, encryptionKey] =
    await Promise.all([
      getSetting("cloud_backup_provider"),
      getSetting("cloud_backup_bucket"),
      getSetting("cloud_backup_region"),
      getSetting("cloud_backup_access_key_id"),
      getSetting("cloud_backup_secret_access_key"),
      getSetting("cloud_backup_folder"),
      getSetting("cloud_backup_encryption_key"),
    ]);

  if (!provider || !folder || !encryptionKey) {
    return null;
  }

  if (provider === "gdrive") {
    return {
      provider: "gdrive",
      bucket: bucket ?? "",
      region: region ?? "",
      accessKeyId: accessKeyId ?? "",
      secretAccessKey: secretAccessKey ?? "",
      folder,
      encryptionKey,
    };
  }

  if (!bucket || !region || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return {
    provider: provider as "s3" | "r2",
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    folder,
    encryptionKey,
  };
}

export async function setCloudConfig(config: CloudConfig): Promise<void> {
  await Promise.all([
    setSetting("cloud_backup_provider", config.provider),
    setSetting("cloud_backup_bucket", config.bucket),
    setSetting("cloud_backup_region", config.region),
    setSetting("cloud_backup_access_key_id", config.accessKeyId),
    setSetting("cloud_backup_secret_access_key", config.secretAccessKey),
    setSetting("cloud_backup_folder", config.folder),
    setSetting("cloud_backup_encryption_key", config.encryptionKey),
  ]);
}

export async function getCloudStatus(): Promise<CloudStatus> {
  const config = await getCloudConfig();
  if (!config) {
    return { configured: false, provider: null, bucket: null, region: null, folder: null };
  }
  if (config.provider === "gdrive") {
    const driveStatus = await getDriveStatus();
    return {
      configured: true,
      provider: "gdrive",
      bucket: null,
      region: null,
      folder: config.folder,
      email: driveStatus.email,
    };
  }
  return {
    configured: true,
    provider: config.provider,
    bucket: config.bucket,
    region: config.region,
    folder: config.folder,
  };
}

// ---------------------------------------------------------------------------
// S3 / R2 Upload
// ---------------------------------------------------------------------------

function buildS3Client(config: CloudConfig): S3Client {
  // R2 uses a custom endpoint format: https://{account_id}.r2.cloudflarestorage.com
  // For R2, we store the full endpoint in the region field or use a fixed format.
  const isR2 = config.provider === "r2";
  const endpoint = isR2 ? `https://${config.bucket}.r2.cloudflarestorage.com` : undefined;

  return new S3Client({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    ...(endpoint ? { endpoint } : {}),
  });
}

async function uploadBackupToS3(config: CloudConfig, backupFilePath: string): Promise<string> {
  // Read backup file
  const fileBuffer = readFileSync(backupFilePath);
  const stats = statSync(backupFilePath);

  // Encrypt
  const encrypted = encryptFile(fileBuffer, config.encryptionKey);

  // Build S3 key
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timestamp = now.getTime();
  const key = `${config.folder.replace(/\/+$/, "")}/medibill_${dateStr}_${timestamp}.db.enc`;

  // Upload
  const client = buildS3Client(config as any);
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: encrypted,
      ContentType: "application/octet-stream",
      Metadata: {
        "original-size": String(stats.size),
        "encrypted-at": now.toISOString(),
      },
    })
  );

  // Return the key/URL
  if (config.provider === "r2") {
    return `https://${config.bucket}.r2.cloudflarestorage.com/${key}`;
  }
  return `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`;
}

export async function uploadBackupToCloud(backupFilePath: string): Promise<string> {
  const config = await getCloudConfig();
  if (!config) {
    throw new Error("Cloud backup is not configured");
  }

  if (config.provider === "gdrive") {
    const result = await uploadBackupToDrive(backupFilePath);
    return result.id;
  }

  return uploadBackupToS3(config, backupFilePath);
}
