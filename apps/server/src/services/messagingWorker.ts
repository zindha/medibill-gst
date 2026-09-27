/**
 * Messaging worker — system-level cron that drains `message.send` outbox
 * events and (when settings `refill_automation.mode === "queue"`) scans due
 * refill reminders. Started from index.ts next to the backup scheduler.
 *
 * Tests must never trigger real sends: the worker is a no-op under Vitest /
 * NODE_ENV=test so no cron timer is ever armed in the test process.
 */

import cron, { type ScheduledTask } from "node-cron";
import { db } from "../db/index.js";
import { settings } from "../db/schema/index.js";
import { eq } from "drizzle-orm";
import { runOutboxWorkerOnce, sendRefillDue } from "./messaging.js";
import { tickDueScheduledReports } from "./reportsDelivery.js";

let task: ScheduledTask | null = null;

/** Settings key `refill_automation` — JSON `{ mode: "off" | "queue" }`. Default off. */
export async function getRefillAutomationMode(): Promise<"off" | "queue"> {
  try {
    const [row] = await db.select().from(settings).where(eq(settings.key, "refill_automation")).limit(1);
    if (!row) return "off";
    const parsed = JSON.parse(row.value);
    return parsed?.mode === "queue" ? "queue" : "off";
  } catch {
    return "off";
  }
}

/** One worker tick: drain outbox + (if enabled) queue due refill reminders + run due scheduled reports. */
export async function runMessagingTick(): Promise<void> {
  await runOutboxWorkerOnce();
  if ((await getRefillAutomationMode()) === "queue") {
    await sendRefillDue(null, "whatsapp");
  }
  // Scheduled reports (Task 17) — never let one bad report crash the tick.
  await tickDueScheduledReports().catch((err) => {
    console.error("[messaging-worker] scheduled reports tick failed:", err);
  });
}

/**
 * Start the every-2-minutes messaging cron. No-op in tests. Returns the
 * scheduled task (or null when skipped) — use stopMessagingWorker() to tear
 * it down.
 */
export function startMessagingWorker(): ScheduledTask | null {
  if (process.env.VITEST || process.env.NODE_ENV === "test") return null;
  task?.stop();
  task = cron.schedule("*/2 * * * *", () => {
    runMessagingTick().catch((err) => {
      console.error("[messaging-worker] tick failed:", err);
    });
  });
  return task;
}

export function stopMessagingWorker(): void {
  task?.stop();
  task = null;
}
