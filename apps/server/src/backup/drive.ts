/**
 * Google Drive Cloud Backup Module — OAuth + encrypted backup ops.
 *
 * Encryption reuses the SAME AES-256-GCM layout as S3/R2 backups
 * (see ./crypto.js): [IV (16)] [AuthTag (16)] [Ciphertext (...)].
 *
 * Settings keys:
 *   google_client_id / google_client_secret  (env GOOGLE_CLIENT_ID /
 *     GOOGLE_CLIENT_SECRET take precedence when set)
 *   google_refresh_token, google_account_email, google_drive_folder_id
 *   cloud_backup_provider (= "gdrive"), cloud_backup_folder (folder NAME),
 *   cloud_backup_encryption_key (shared with S3/R2)
 *
 * Secrets (tokens/keys) are never logged from this module.
 */

import { google, drive_v3 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { Readable } from "stream";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import { db } from "../db/index.js";
import { settings } from "../db/schema/index.js";
import { eq } from "drizzle-orm";
import { encryptFile, decryptFile } from "./crypto.js";

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const DRIVE_OAUTH_REDIRECT_URI =
  "http://localhost:3000/api/backup/drive/oauth-callback";
export const DRIVE_RETENTION_COUNT = 12;

const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";

// ---------------------------------------------------------------------------
// Settings helpers (module-local; mirrors cloud.ts)
// ---------------------------------------------------------------------------

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

async function deleteSetting(key: string): Promise<void> {
  await db.delete(settings).where(eq(settings.key, key));
}

function getOAuthClientId(): string | null {
  return process.env.GOOGLE_CLIENT_ID ?? null;
}

function getOAuthClientSecret(): string | null {
  return process.env.GOOGLE_CLIENT_SECRET ?? null;
}

async function getConfiguredClientId(): Promise<string | null> {
  return getOAuthClientId() ?? (await getSetting("google_client_id"));
}

async function getConfiguredClientSecret(): Promise<string | null> {
  return getOAuthClientSecret() ?? (await getSetting("google_client_secret"));
}

// ---------------------------------------------------------------------------
// OAuth client + token lifecycle (in-memory access token, refresh on expiry)
// ---------------------------------------------------------------------------

let cachedAccessToken: string | null = null;
let cachedAccessTokenExpiry = 0;

function buildOAuthClient(clientId: string, clientSecret: string): OAuth2Client {
  return new google.auth.OAuth2(clientId, clientSecret, DRIVE_OAUTH_REDIRECT_URI);
}

async function buildConfiguredOAuthClient(): Promise<OAuth2Client> {
  const [clientId, clientSecret] = await Promise.all([
    getConfiguredClientId(),
    getConfiguredClientSecret(),
  ]);
  if (!clientId || !clientSecret) {
    throw new Error(
      "Google OAuth client is not configured (google_client_id / google_client_secret)"
    );
  }
  return buildOAuthClient(clientId, clientSecret);
}

async function refreshAccessToken(
  oauth: OAuth2Client,
  refreshToken: string
): Promise<void> {
  oauth.setCredentials({ refresh_token: refreshToken });
  const res = await oauth.getAccessToken();
  const token = typeof res === "string" ? res : res?.token;
  if (!token) {
    throw new Error("Could not refresh Google access token");
  }
  cachedAccessToken = token;
  cachedAccessTokenExpiry = oauth.credentials.expiry_date ?? Date.now() + 3600_000;
}

export async function getDriveClient(): Promise<{
  oauth: OAuth2Client;
  drive: drive_v3.Drive;
}> {
  const refreshToken = await getSetting("google_refresh_token");
  if (!refreshToken) {
    throw new Error("Google Drive is not connected");
  }
  const oauth = await buildConfiguredOAuthClient();
  if (cachedAccessToken && cachedAccessTokenExpiry - Date.now() > 60_000) {
    oauth.setCredentials({
      refresh_token: refreshToken,
      access_token: cachedAccessToken,
      expiry_date: cachedAccessTokenExpiry,
    });
  } else {
    await refreshAccessToken(oauth, refreshToken);
  }
  return { oauth, drive: google.drive({ version: "v3", auth: oauth }) };
}

function isAuthError(err: unknown): boolean {
  const e = err as { code?: unknown; response?: { status?: unknown } } | null;
  if (!e || typeof e !== "object") return false;
  return e.code === 401 || e.response?.status === 401;
}

/** Run a Drive call; on 401 refresh the access token once and retry. */
async function withDrive<T>(fn: (drive: drive_v3.Drive) => Promise<T>): Promise<T> {
  const first = await getDriveClient();
  try {
    return await fn(first.drive);
  } catch (err) {
    if (!isAuthError(err)) throw err;
    // Token may have expired between check and call — refresh once and retry.
    cachedAccessToken = null;
    cachedAccessTokenExpiry = 0;
    const second = await getDriveClient();
    return fn(second.drive);
  }
}

// ---------------------------------------------------------------------------
// OAuth flow
// ---------------------------------------------------------------------------

export async function getDriveAuthUrl(): Promise<string> {
  const oauth = await buildConfiguredOAuthClient();
  return oauth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [DRIVE_SCOPE],
  });
}

export async function exchangeDriveCode(code: string): Promise<{ email: string }> {
  if (!code) {
    throw new Error("Missing OAuth code");
  }
  const oauth = await buildConfiguredOAuthClient();
  const { tokens } = await oauth.getToken(code);

  const existingRefresh = await getSetting("google_refresh_token");
  const refreshToken = tokens.refresh_token ?? existingRefresh;
  if (!refreshToken) {
    throw new Error(
      "Google did not return a refresh token. Disconnect and connect again."
    );
  }
  oauth.setCredentials({ ...tokens, refresh_token: refreshToken });

  // Resolve the account email — prefer userinfo, fall back to drive.about.
  let email: string | null = null;
  try {
    const oauth2 = google.oauth2({ version: "v2", auth: oauth });
    const me = await oauth2.userinfo.get();
    email = me.data.email ?? null;
  } catch {
    email = null;
  }
  if (!email) {
    const drive = google.drive({ version: "v3", auth: oauth });
    const about = await drive.about.get({ fields: "user" });
    email = about.data.user?.emailAddress ?? null;
  }
  if (!email) {
    throw new Error("Could not determine Google account email");
  }

  await setSetting("google_refresh_token", refreshToken);
  await setSetting("google_account_email", email);

  if (tokens.access_token) {
    cachedAccessToken = tokens.access_token;
    cachedAccessTokenExpiry = tokens.expiry_date ?? Date.now() + 3600_000;
  } else {
    cachedAccessToken = null;
    cachedAccessTokenExpiry = 0;
  }

  return { email };
}

// ---------------------------------------------------------------------------
// Folder resolution (folder NAME from cloud_backup_folder; id cached)
// ---------------------------------------------------------------------------

function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export async function resolveDriveFolderId(): Promise<string> {
  const folderName = (await getSetting("cloud_backup_folder"))?.trim();
  if (!folderName) {
    throw new Error("Cloud backup folder is not configured");
  }

  const cachedId = await getSetting("google_drive_folder_id");
  if (cachedId) {
    // Verify the cached folder still exists with the same name.
    try {
      const meta = await withDrive((drive) =>
        drive.files.get({ fileId: cachedId, fields: "id,name,trashed" })
      );
      if (!meta.data.trashed && meta.data.name === folderName && meta.data.id) {
        return meta.data.id;
      }
    } catch {
      // Fall through to find-or-create below.
    }
  }

  const escaped = escapeDriveQuery(folderName);
  const id = await withDrive(async (drive) => {
    const found = await drive.files.list({
      q: `mimeType='${DRIVE_FOLDER_MIME}' and name='${escaped}' and trashed=false`,
      fields: "files(id,name)",
      pageSize: 10,
    });
    const existing = found.data.files?.[0]?.id;
    if (existing) return existing;

    const created = await drive.files.create({
      requestBody: { name: folderName, mimeType: DRIVE_FOLDER_MIME },
      fields: "id",
    });
    if (!created.data.id) {
      throw new Error("Could not create Google Drive folder");
    }
    return created.data.id;
  });

  await setSetting("google_drive_folder_id", id);
  return id;
}

// ---------------------------------------------------------------------------
// Backup ops
// ---------------------------------------------------------------------------

export interface DriveUploadResult {
  id: string;
  name: string;
  size: number;
}

export interface DriveBackupFile {
  id: string;
  name: string;
  size: number;
  createdAt: string;
}

function isBackupFileName(name: string): boolean {
  return name.startsWith("medibill_") && name.endsWith(".db.enc");
}

export async function uploadBackupToDrive(filePath: string): Promise<DriveUploadResult> {
  const encryptionKey = await getSetting("cloud_backup_encryption_key");
  if (!encryptionKey) {
    throw new Error("Cloud backup encryption key is not configured");
  }

  const folderId = await resolveDriveFolderId();
  const fileBuffer = readFileSync(filePath);
  const encrypted = encryptFile(fileBuffer, encryptionKey);

  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const name = `medibill_${dateStr}_${now.getTime()}.db.enc`;

  const result = await withDrive(async (drive) => {
    const created = await drive.files.create({
      requestBody: {
        name,
        parents: [folderId],
        appProperties: { "original-size": String(fileBuffer.length) },
      },
      media: {
        mimeType: "application/octet-stream",
        body: Readable.from(encrypted),
      },
      fields: "id,name,size",
    });

    // Enforce retention: keep newest 12 backup files, delete older.
    try {
      const listed = await drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        orderBy: "createdTime desc",
        fields: "files(id,name,createdTime)",
        pageSize: 50,
      });
      const backups = (listed.data.files ?? []).filter(
        (f) => f.id && f.name && isBackupFileName(f.name)
      );
      for (const stale of backups.slice(DRIVE_RETENTION_COUNT)) {
        if (!stale.id) continue;
        try {
          await drive.files.delete({ fileId: stale.id });
        } catch {
          // Ignore per-file delete failures.
        }
      }
    } catch {
      // Retention enforcement must not fail the upload.
    }

    if (!created.data.id) {
      throw new Error("Google Drive upload did not return a file id");
    }
    return {
      id: created.data.id,
      name: created.data.name ?? name,
      size: Number(created.data.size ?? encrypted.length),
    };
  });

  return result;
}

export async function listDriveBackups(): Promise<DriveBackupFile[]> {
  const folderId = await resolveDriveFolderId();
  return withDrive(async (drive) => {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      orderBy: "createdTime desc",
      fields: "files(id,name,size,createdTime)",
      pageSize: 50,
    });
    return (res.data.files ?? [])
      .filter((f) => f.id && f.name)
      .map((f) => ({
        id: f.id as string,
        name: f.name as string,
        size: Number(f.size ?? 0),
        createdAt: f.createdTime ?? "",
      }));
  });
}

export async function downloadBackupFromDrive(
  fileId: string,
  destPath: string
): Promise<string> {
  if (!fileId) {
    throw new Error("Missing Drive file id");
  }
  const encryptionKey = await getSetting("cloud_backup_encryption_key");
  if (!encryptionKey) {
    throw new Error("Cloud backup encryption key is not configured");
  }

  const encrypted = await withDrive(async (drive) => {
    const res = await drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });
    return Buffer.from(res.data as ArrayBuffer);
  });

  const decrypted = decryptFile(encrypted, encryptionKey);
  mkdirSync(dirname(destPath), { recursive: true });
  writeFileSync(destPath, decrypted);
  return destPath;
}

export async function disconnectDrive(): Promise<void> {
  cachedAccessToken = null;
  cachedAccessTokenExpiry = 0;
  await Promise.all([
    deleteSetting("google_refresh_token"),
    deleteSetting("google_account_email"),
    deleteSetting("google_drive_folder_id"),
  ]);
}

export interface DriveStatus {
  connected: boolean;
  email: string | null;
  folder: string | null;
}

export async function getDriveStatus(): Promise<DriveStatus> {
  const [refreshToken, email, folder] = await Promise.all([
    getSetting("google_refresh_token"),
    getSetting("google_account_email"),
    getSetting("cloud_backup_folder"),
  ]);
  return {
    connected: !!refreshToken,
    email: email ?? null,
    folder: folder ?? null,
  };
}
