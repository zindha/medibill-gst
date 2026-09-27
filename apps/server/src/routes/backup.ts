import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { db, DB_PATH, DATA_DIR } from "../db/index.js";
import { backupHistory, settings } from "../db/schema/index.js";
import { eq, desc, and, sql } from "drizzle-orm";
import { authGuard } from "../plugins/auth.js";
import { generateId } from "../db/schema/index.js";
import { join } from "path";
import { existsSync, mkdirSync, copyFileSync, statSync, readdirSync } from "fs";
import { getCloudStatus, setCloudConfig, uploadBackupToCloud } from "../backup/cloud.js";
import {
  disconnectDrive,
  downloadBackupFromDrive,
  exchangeDriveCode,
  getDriveAuthUrl,
  listDriveBackups,
} from "../backup/drive.js";
import { getScheduleStatus, restartScheduler } from "../backup/scheduler.js";

const BACKUP_DIR = join(DATA_DIR, "../backups");
const DAILY_DIR = join(BACKUP_DIR, "daily");
const WEEKLY_DIR = join(BACKUP_DIR, "weekly");

// Ensure backup directories exist
function ensureBackupDirs() {
  if (!existsSync(DAILY_DIR)) mkdirSync(DAILY_DIR, { recursive: true });
  if (!existsSync(WEEKLY_DIR)) mkdirSync(WEEKLY_DIR, { recursive: true });
}

async function createBackup(type: "daily" | "weekly" | "manual"): Promise<string> {
  ensureBackupDirs();

  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timestamp = now.toTimeString().split(" ")[0].replace(/:/g, "-");

  const backupTypeDir = type === "weekly" ? WEEKLY_DIR : DAILY_DIR;
  const backupFolder = join(backupTypeDir, `${dateStr}_${timestamp}`);
  mkdirSync(backupFolder, { recursive: true });

  const backupFile = join(backupFolder, "medibill.db");

  // Use SQLite online backup (WAL checkpoint)
  // For better-sqlite3, we use the backup API
  const Database = (await import("better-sqlite3")).default;
  const backupDb = new Database(backupFile);

  // Copy the current database
  const currentDb = new Database(DB_PATH);

  try {
    // Use VACUUM INTO for a consistent backup
    currentDb.pragma("journal_mode = WAL");
    currentDb.exec(`VACUUM INTO '${backupFile.replace(/\\/g, "\\\\")}'`);
  } finally {
    backupDb.close();
    currentDb.close();
  }

  const stats = statSync(backupFile);

  // Record backup history
  await db.insert(backupHistory).values({
    id: generateId(),
    type,
    status: "success",
    filePath: backupFile,
    fileSize: stats.size,
    createdAt: now,
  });

  // Clean up old backups
  await cleanupOldBackups(type);

  return backupFile;
}

async function cleanupOldBackups(type: "daily" | "weekly" | "manual") {
  const backupDir = type === "weekly" ? WEEKLY_DIR : DAILY_DIR;

  if (!existsSync(backupDir)) return;

  const folders = readdirSync(backupDir)
    .map((f) => join(backupDir, f))
    .filter((f) => statSync(f).isDirectory())
    .sort()
    .reverse();

  const retention = type === "weekly" ? 12 : 30; // 12 weeks, 30 daily

  for (let i = retention; i < folders.length; i++) {
    try {
      // Delete old folder (simplified - in production use proper recursive delete)
      const { rmSync } = await import("fs");
      rmSync(folders[i], { recursive: true, force: true });
    } catch {
      // Ignore
    }
  }
}

async function restoreFromFile(
  filePath: string
): Promise<{ safetyBackup: string }> {
  // Verify backup file is a valid SQLite database
  const Database = (await import("better-sqlite3")).default;
  const testDb = new Database(filePath, { readonly: true });
  try {
    const integrity = testDb.prepare("PRAGMA integrity_check").get();
    if (integrity !== "ok") {
      throw new Error("Backup file is corrupted");
    }
  } finally {
    testDb.close();
  }

  // Create safety backup of current database
  const now = new Date();
  const safetyDir = join(DATA_DIR, "safety");
  if (!existsSync(safetyDir)) mkdirSync(safetyDir, { recursive: true });
  const safetyFile = join(safetyDir, `pre_restore_${now.toISOString().replace(/:/g, "-")}.db`);

  try {
    copyFileSync(DB_PATH, safetyFile);
  } catch (error: any) {
    throw new Error(`Could not create safety backup: ${error.message}`);
  }

  // Restore: close current connections, copy backup over current database
  const currentDb = new Database(DB_PATH);
  currentDb.close();
  copyFileSync(filePath, DB_PATH);

  return { safetyBackup: safetyFile };
}

export default async function backupRoutes(fastify: FastifyInstance) {
  // Get backup status
  fastify.get(
    "/status",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const lastDaily = await db.query.backupHistory.findFirst({
        where: and(
          eq(backupHistory.type, "daily"),
          eq(backupHistory.status, "success")
        ),
        orderBy: desc(backupHistory.createdAt),
      });

      const lastWeekly = await db.query.backupHistory.findFirst({
        where: and(
          eq(backupHistory.type, "weekly"),
          eq(backupHistory.status, "success")
        ),
        orderBy: desc(backupHistory.createdAt),
      });

      const lastManual = await db.query.backupHistory.findFirst({
        where: and(
          eq(backupHistory.type, "manual"),
          eq(backupHistory.status, "success")
        ),
        orderBy: desc(backupHistory.createdAt),
      });

      // Count recent failures
      const recentFailures = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(backupHistory)
        .where(
          and(
            eq(backupHistory.status, "failed"),
            sql`${backupHistory.createdAt} > ${Date.now() - 7 * 24 * 60 * 60 * 1000}`
          )
        );

      return reply.send({
        success: true,
        data: {
          lastDaily: lastDaily
            ? { date: lastDaily.createdAt, fileSize: lastDaily.fileSize }
            : null,
          lastWeekly: lastWeekly
            ? { date: lastWeekly.createdAt, fileSize: lastWeekly.fileSize }
            : null,
          lastManual: lastManual
            ? { date: lastManual.createdAt, fileSize: lastManual.fileSize }
            : null,
          health: recentFailures[0]?.count > 2 ? "unhealthy" : "healthy",
          recentFailures: recentFailures[0]?.count ?? 0,
        },
      });
    }
  );

  // Get backup history
  fastify.get(
    "/history",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { type, limit = "20" } = request.query as {
        type?: string;
        limit?: string;
      };

      const conditions = [];
      if (type) conditions.push(eq(backupHistory.type, type as any));

      const history = await db
        .select()
        .from(backupHistory)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(backupHistory.createdAt))
        .limit(parseInt(limit, 10));

      return reply.send({
        success: true,
        data: history,
      });
    }
  );

  // Create manual backup
  fastify.post(
    "/create",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { type = "manual" } = request.body as { type?: "daily" | "weekly" | "manual" };

      const now = new Date();

      // Record in-progress
      const [record] = await db
        .insert(backupHistory)
        .values({
          id: generateId(),
          type,
          status: "in_progress",
          createdBy: request.userId,
          createdAt: now,
        })
        .returning();

      try {
        const filePath = await createBackup(type);

        await db
          .update(backupHistory)
          .set({ status: "success", filePath })
          .where(eq(backupHistory.id, record.id));

        return reply.send({
          success: true,
          data: { message: "Backup created successfully", filePath },
        });
      } catch (error: any) {
        await db
          .update(backupHistory)
          .set({ status: "failed", errorMessage: error.message })
          .where(eq(backupHistory.id, record.id));

        return reply.status(500).send({
          success: false,
          error: `Backup failed: ${error.message}`,
        });
      }
    }
  );

  // Restore from backup
  fastify.post(
    "/restore",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { filePath } = request.body as { filePath: string };

      if (!filePath || !existsSync(filePath)) {
        return reply.status(400).send({
          success: false,
          error: "Invalid backup file path",
        });
      }

      try {
        const { safetyBackup } = await restoreFromFile(filePath);
        return reply.send({
          success: true,
          data: {
            message: "Restore completed. Please restart the application.",
            safetyBackup,
          },
        });
      } catch (error: any) {
        const message: string = error?.message ?? "Restore failed";
        const status = message === "Backup file is corrupted" ? 400 : 500;
        return reply.status(status).send({
          success: false,
          error: status === 400 ? message : `Restore failed: ${message}`,
        });
      }
    }
  );

  // ── Cloud Status ────────────────────────────────────────────────────────────

  fastify.get(
    "/cloud-status",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const status = await getCloudStatus();
      return reply.send({ success: true, data: status });
    }
  );

  fastify.put(
    "/cloud-status",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as Record<string, string>;
      const { provider, bucket, region, accessKeyId, secretAccessKey, folder, encryptionKey } = body;

      if (!provider || !folder || !encryptionKey) {
        return reply.status(400).send({ success: false, error: "provider, folder and encryptionKey are required" });
      }
      if (!["s3", "r2", "gdrive"].includes(provider)) {
        return reply.status(400).send({ success: false, error: "Provider must be s3, r2 or gdrive" });
      }
      if (encryptionKey.length !== 64) {
        return reply.status(400).send({ success: false, error: "Encryption key must be a 64-character hex string (32 bytes)" });
      }

      if (provider === "gdrive") {
        await setCloudConfig({
          provider: "gdrive",
          bucket: bucket ?? "",
          region: region ?? "",
          accessKeyId: accessKeyId ?? "",
          secretAccessKey: secretAccessKey ?? "",
          folder,
          encryptionKey,
        });
        return reply.send({ success: true, data: { message: "Cloud configuration saved" } });
      }

      if (!bucket || !region || !accessKeyId || !secretAccessKey) {
        return reply.status(400).send({ success: false, error: "bucket, region, accessKeyId and secretAccessKey are required for s3/r2" });
      }

      await setCloudConfig({ provider: provider as "s3" | "r2", bucket, region, accessKeyId, secretAccessKey, folder, encryptionKey });
      return reply.send({ success: true, data: { message: "Cloud configuration saved" } });
    }
  );

  // ── Upload Latest ───────────────────────────────────────────────────────────

  fastify.post(
    "/upload-latest",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Find most recent successful backup
      const lastBackup = await db.query.backupHistory.findFirst({
        where: and(eq(backupHistory.status, "success")),
        orderBy: desc(backupHistory.createdAt),
      });

      if (!lastBackup || !lastBackup.filePath) {
        return reply.status(404).send({ success: false, error: "No backup found to upload" });
      }
      if (!existsSync(lastBackup.filePath)) {
        return reply.status(404).send({ success: false, error: "Backup file not found on disk" });
      }

      try {
        const url = await uploadBackupToCloud(lastBackup.filePath);
        return reply.send({ success: true, data: { url, filePath: lastBackup.filePath } });
      } catch (err: any) {
        return reply.status(500).send({ success: false, error: `Upload failed: ${err.message}` });
      }
    }
  );

  // ── Google Drive ──────────────────────────────────────────────────────────

  fastify.get(
    "/drive/auth-url",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const url = await getDriveAuthUrl();
        return reply.send({ success: true, data: { url } });
      } catch (err: any) {
        return reply.status(500).send({ success: false, error: err.message });
      }
    }
  );

  // Browser redirect target — no authGuard (user arrives from Google consent).
  // Posts the code to the opener window (Settings popup flow); the app then
  // exchanges it via POST /drive/callback under the user's session.
  fastify.get(
    "/drive/oauth-callback",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { code, error } = request.query as { code?: string; error?: string };
      const payload = (type: string, extra: string) =>
        `<html><body><h1>Google Drive ${type === "medibill-drive-code" ? "approved" : "connection failed"}</h1>` +
        `<p>${extra} You can close this window and return to the app.</p>` +
        `<script>if (window.opener) { window.opener.postMessage(${JSON.stringify({ type, code: code ?? null })}, "*"); }</script>` +
        `</body></html>`;
      if (error) {
        return reply
          .status(400)
          .type("text/html")
          .send(payload("medibill-drive-error", `Google said: ${error}.`));
      }
      if (!code) {
        return reply
          .status(400)
          .type("text/html")
          .send(payload("medibill-drive-error", "Missing authorization code. Please return to the app and try again."));
      }
      return reply
        .type("text/html")
        .send(payload("medibill-drive-code", "Approval received — finishing the connection in the app."));
    }
  );

  fastify.post(
    "/drive/callback",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { code } = request.body as { code?: string };
      if (!code) {
        return reply.status(400).send({ success: false, error: "code is required" });
      }
      try {
        const { email } = await exchangeDriveCode(code);
        return reply.send({ success: true, data: { email } });
      } catch (err: any) {
        return reply.status(400).send({ success: false, error: err.message });
      }
    }
  );

  fastify.post(
    "/drive/disconnect",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      await disconnectDrive();
      return reply.send({ success: true, data: { message: "Google Drive disconnected" } });
    }
  );

  fastify.get(
    "/drive/files",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const files = await listDriveBackups();
        return reply.send({ success: true, data: files });
      } catch (err: any) {
        return reply.status(500).send({ success: false, error: err.message });
      }
    }
  );

  fastify.post(
    "/drive/restore",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { fileId } = request.body as { fileId?: string };
      if (!fileId) {
        return reply.status(400).send({ success: false, error: "fileId is required" });
      }

      ensureBackupDirs();
      const now = new Date();
      const destPath = join(
        DAILY_DIR,
        `drive_restore_${now.toISOString().split("T")[0]}_${now.getTime()}`,
        "medibill.db"
      );

      try {
        await downloadBackupFromDrive(fileId, destPath);
      } catch (err: any) {
        return reply.status(500).send({ success: false, error: `Download failed: ${err.message}` });
      }

      try {
        const { safetyBackup } = await restoreFromFile(destPath);
        return reply.send({
          success: true,
          data: {
            message: "Restore completed. Please restart the application.",
            safetyBackup,
          },
        });
      } catch (error: any) {
        const message: string = error?.message ?? "Restore failed";
        if (message === "Backup file is corrupted") {
          return reply.status(400).send({ success: false, error: message });
        }
        return reply.status(500).send({ success: false, error: `Restore failed: ${message}` });
      }
    }
  );

  // ── Schedule ────────────────────────────────────────────────────────────────

  fastify.get(
    "/schedule",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const status = await getScheduleStatus();
      return reply.send({ success: true, data: status });
    }
  );

  fastify.post(
    "/schedule",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { dailyHour, weeklyDay, weeklyHour } = request.body as {
        dailyHour: number;
        weeklyDay: number;
        weeklyHour: number;
      };

      if (dailyHour == null || dailyHour < 0 || dailyHour > 23) {
        return reply.status(400).send({ success: false, error: "dailyHour must be 0-23" });
      }
      if (weeklyDay == null || weeklyDay < 0 || weeklyDay > 6) {
        return reply.status(400).send({ success: false, error: "weeklyDay must be 0-6 (Sun-Sat)" });
      }
      if (weeklyHour == null || weeklyHour < 0 || weeklyHour > 23) {
        return reply.status(400).send({ success: false, error: "weeklyHour must be 0-23" });
      }

      const scheduleKeys = ["backup_daily_hour", "backup_weekly_day", "backup_weekly_hour"];
      const scheduleVals = [String(dailyHour), String(weeklyDay), String(weeklyHour)];

      for (let i = 0; i < scheduleKeys.length; i++) {
        const key = scheduleKeys[i];
        const existing = await db.query.settings.findFirst({ where: eq(settings.key, key) });
        if (existing) {
          await db.update(settings).set({ value: scheduleVals[i] }).where(eq(settings.key, key));
        } else {
          await db.insert(settings).values({ key, value: scheduleVals[i] });
        }
      }

      const status = await restartScheduler();

      return reply.send({
        success: true,
        data: {
          message: "Schedule updated",
          nextRun: {
            daily: status.daily.toISOString(),
            weekly: status.weekly.toISOString(),
          },
        },
      });
    }
  );
}
