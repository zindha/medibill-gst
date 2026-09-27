/**
 * Backup Scheduler — runs automatic daily and weekly backups via node-cron.
 * Automatically skips duplicate runs within the same period.
 */

import cron, { ScheduledTask } from "node-cron";
import { db, DB_PATH, DATA_DIR } from "../db/index.js";
import { backupHistory, settings } from "../db/schema/index.js";
import { eq, desc, and, sql } from "drizzle-orm";
import { join } from "path";
import { existsSync, mkdirSync, statSync, readdirSync } from "fs";
import { createRequire } from "module";
import { getCloudConfig, uploadBackupToCloud } from "./cloud.js";

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Backup directory layout (mirrored from backup.ts)
// ---------------------------------------------------------------------------
const BACKUP_DIR = join(DATA_DIR, "../backups");
const DAILY_DIR = join(BACKUP_DIR, "daily");
const WEEKLY_DIR = join(BACKUP_DIR, "weekly");

function ensureBackupDirs() {
  if (!existsSync(DAILY_DIR)) mkdirSync(DAILY_DIR, { recursive: true });
  if (!existsSync(WEEKLY_DIR)) mkdirSync(WEEKLY_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// Minimal backup creation (duplicated from backup.ts to avoid circular deps)
// ---------------------------------------------------------------------------
async function createBackup(type: "daily" | "weekly" | "manual"): Promise<string> {
  ensureBackupDirs();

  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timestamp = now.toTimeString().split(" ")[0].replace(/:/g, "-");

  const backupTypeDir = type === "weekly" ? WEEKLY_DIR : DAILY_DIR;
  const backupFolder = join(backupTypeDir, `${dateStr}_${timestamp}`);
  mkdirSync(backupFolder, { recursive: true });

  const backupFile = join(backupFolder, "medibill.db");

  const Database = (await import("better-sqlite3")).default;
  const currentDb = new Database(DB_PATH);

  try {
    currentDb.pragma("journal_mode = WAL");
    currentDb.exec(`VACUUM INTO '${backupFile.replace(/\\/g, "\\\\")}'`);
  } finally {
    currentDb.close();
  }

  const stats = statSync(backupFile);

  await db.insert(backupHistory).values({
    id: require("nanoid")(16),
    type,
    status: "success",
    filePath: backupFile,
    fileSize: stats.size,
    createdAt: now,
  });

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

  const retention = type === "weekly" ? 12 : 30;

  for (let i = retention; i < folders.length; i++) {
    try {
      const { rmSync } = await import("fs");
      rmSync(folders[i], { recursive: true, force: true });
    } catch {
      // Ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Schedule helpers
// ---------------------------------------------------------------------------

interface ScheduleConfig {
  dailyHour: number;
  weeklyDay: number;
  weeklyHour: number;
}

async function getScheduleConfig(): Promise<ScheduleConfig> {
  const rows = await db.select().from(settings).where(
    sql`${settings.key} IN ('backup_daily_hour','backup_weekly_day','backup_weekly_hour')`
  );

  const map: Record<string, string | null> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }

  return {
    dailyHour: map["backup_daily_hour"] ? parseInt(map["backup_daily_hour"], 10) : 2,
    weeklyDay: map["backup_weekly_day"] ? parseInt(map["backup_weekly_day"], 10) : 0,
    weeklyHour: map["backup_weekly_hour"] ? parseInt(map["backup_weekly_hour"], 10) : 3,
  };
}

async function hasRunToday(type: "daily" | "weekly"): Promise<boolean> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const last = await db.query.backupHistory.findFirst({
    where: and(
      eq(backupHistory.type, type),
      eq(backupHistory.status, "success"),
      sql`${backupHistory.createdAt} >= ${todayStart.getTime()}`
    ),
    orderBy: desc(backupHistory.createdAt),
  });

  return !!last;
}

async function computeNextRuns(config: ScheduleConfig): Promise<{ daily: Date; weekly: Date }> {
  const now = new Date();

  // Next daily
  const nextDaily = new Date(now);
  nextDaily.setHours(config.dailyHour, 0, 0, 0);
  if (nextDaily <= now) nextDaily.setDate(nextDaily.getDate() + 1);

  // Next weekly (0=Sun)
  const nextWeekly = new Date(now);
  nextWeekly.setHours(config.weeklyHour, 0, 0, 0);
  const daysUntil = (config.weeklyDay - nextWeekly.getDay() + 7) % 7 || 7;
  nextWeekly.setDate(nextWeekly.getDate() + daysUntil);

  return { daily: nextDaily, weekly: nextWeekly };
}

// ---------------------------------------------------------------------------
// Scheduler state
// ---------------------------------------------------------------------------
let dailyTask: ScheduledTask | null = null;
let weeklyTask: ScheduledTask | null = null;
let currentConfig: ScheduleConfig | null = null;

// ---------------------------------------------------------------------------
// Start / restart
// ---------------------------------------------------------------------------

export async function startBackupScheduler(): Promise<{ daily: Date; weekly: Date }> {
  const config = await getScheduleConfig();
  currentConfig = config;

  const { daily, weekly } = await computeNextRuns(config);

  // Stop existing tasks
  dailyTask?.stop();
  weeklyTask?.stop();

  // Daily: "0 <hour> * * *" — at minute 0 of the given hour, every day
  const dailyCron = `0 ${config.dailyHour} * * *`;
  dailyTask = cron.schedule(dailyCron, async () => {
    try {
      const already = await hasRunToday("daily");
      if (!already) {
        await createBackup("daily");
      }
    } catch (err) {
      console.error("[scheduler] Daily backup failed:", err);
    }
  });

  // Weekly: "0 <hour> * * <day>" — Sunday = 0
  const weeklyCron = `0 ${config.weeklyHour} * * ${config.weeklyDay}`;
  weeklyTask = cron.schedule(weeklyCron, async () => {
    try {
      const already = await hasRunToday("weekly");
      if (!already) {
        const filePath = await createBackup("weekly");
        // Upload weekly backup to cloud when a provider is configured.
        // Daily stays local-only.
        const cloudConfig = await getCloudConfig();
        if (cloudConfig) {
          try {
            await uploadBackupToCloud(filePath);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            await db.insert(backupHistory).values({
              id: require("nanoid")(16),
              type: "weekly",
              status: "failed",
              filePath,
              errorMessage: `Cloud upload failed: ${message}`,
              createdAt: new Date(),
            });
            console.error("[scheduler] Weekly cloud upload failed:", err);
          }
        }
      }
    } catch (err) {
      console.error("[scheduler] Weekly backup failed:", err);
    }
  });

  return { daily, weekly };
}

export async function restartScheduler(): Promise<{ daily: Date; weekly: Date }> {
  return startBackupScheduler();
}

export async function getScheduleStatus(): Promise<{
  config: ScheduleConfig;
  nextRun: { daily: Date; weekly: Date };
}> {
  const config = await getScheduleConfig();
  const nextRun = await computeNextRuns(config);
  return { config, nextRun };
}
