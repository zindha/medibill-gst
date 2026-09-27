/**
 * Scheduled Reports delivery (Task 17) — report data builders, RFC-4180 CSV,
 * file storage, outbox-backed delivery and the due-report tick.
 *
 * Timezone (documented): `next_run_at` / `last_run_at` are SERVER-LOCAL
 * wall-clock strings `YYYY-MM-DDTHH:mm` (no zone). computeNextRun and the
 * tick compare them as plain strings against the server's local clock — the
 * install is single-store and runs in the pharmacy's own timezone.
 *
 * Periods are period-RELATIVE: `filters.daysBack` (default 30) counted back
 * from the run date, so one definition produces a rolling window per run.
 *
 * Delivery semantics: the CSV is always stored as a `stored_files` row
 * (purpose "scheduled-report"); recipients then get a `custom` message whose
 * body inlines the CSV when it is ≤ 100 KB (else a "(file saved)" note).
 * Queueing is provider-agnostic — a delivery row + pending outbox event are
 * created even when no messaging provider is configured; the messaging worker
 * decides whether it can actually send. A messaging failure NEVER fails the
 * run (status stays `done`, `message_status` records the best effort).
 *
 * Failures during generation store a `failed` run row and rethrow a
 * ComplianceError-shaped error (statusCode) for the route.
 */

import { and, asc, desc, eq, gt, gte, isNotNull, lte } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  batches,
  customers,
  generateId,
  invoices,
  medicines,
  payments,
  purchaseBills,
  scheduledReportRuns,
  scheduledReports,
  suppliers,
  type MessageChannel,
  type ScheduledReport,
  type ScheduledReportRun,
} from "../db/schema/index.js";
import { ComplianceError } from "./compliance.js";
import { auditEvents } from "./audit.js";
import { fileStorage } from "./fileStorage.js";
import { queueMessage } from "./messaging.js";

// ---------------------------------------------------------------------------
// Schedule presets
// ---------------------------------------------------------------------------

export type ScheduleKind = "daily" | "weekly" | "monthly";

export interface SchedulePreset {
  kind: ScheduleKind;
  /** "HH:mm" (24h, server-local). */
  time: string;
  /** weekly: 0-6 (Sun-Sat); monthly: 1-28 (clamped so every month has it). */
  day?: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Local `YYYY-MM-DD` for a Date. */
export function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local `YYYY-MM-DDTHH:mm` — the exact format stored in next_run_at. */
export function localStamp(d: Date): string {
  return `${localDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Next fire time strictly AFTER `after`, as a local `YYYY-MM-DDTHH:mm` stamp.
 * - daily: today at `time`, else tomorrow;
 * - weekly: next date whose weekday === `day`;
 * - monthly: next month's `day` (zod caps day at 28, so no clamping needed).
 */
export function computeNextRun(after: Date, schedule: SchedulePreset): string {
  const [h, m] = schedule.time.split(":").map((v) => parseInt(v, 10));
  const at = (base: Date) =>
    new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m, 0, 0);

  if (schedule.kind === "daily") {
    let candidate = at(after);
    if (candidate.getTime() <= after.getTime()) {
      candidate = new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate() + 1, h, m, 0, 0);
    }
    return localStamp(candidate);
  }

  if (schedule.kind === "weekly") {
    const target = schedule.day ?? 0;
    let candidate = at(after);
    for (let i = 0; i < 14; i++) {
      if (candidate.getDay() === target && candidate.getTime() > after.getTime()) break;
      candidate = new Date(
        candidate.getFullYear(),
        candidate.getMonth(),
        candidate.getDate() + 1,
        h,
        m,
        0,
        0
      );
    }
    return localStamp(candidate);
  }

  // monthly — day is 1..28 (zod), so every candidate date exists.
  const day = Math.min(28, Math.max(1, schedule.day ?? 1));
  let month = new Date(after.getFullYear(), after.getMonth(), 1);
  for (let i = 0; i < 24; i++) {
    const candidate = new Date(month.getFullYear(), month.getMonth(), day, h, m, 0, 0);
    if (candidate.getTime() > after.getTime()) return localStamp(candidate);
    month = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  }
  return localStamp(new Date(after.getFullYear() + 1, 0, day, h, m, 0, 0));
}

export function parseSchedule(raw: string): SchedulePreset | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.kind !== "daily" && parsed.kind !== "weekly" && parsed.kind !== "monthly") return null;
    if (typeof parsed.time !== "string" || !/^\d{2}:\d{2}$/.test(parsed.time)) return null;
    return parsed as SchedulePreset;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// CSV (RFC 4180 — CRLF, quoted when needed, UTF-8 BOM for Excel)
// ---------------------------------------------------------------------------

export interface ReportColumn {
  key: string;
  header: string;
}

export function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildCsv(columns: ReportColumn[], rows: Record<string, unknown>[]): string {
  const lines: string[] = [columns.map((c) => csvEscape(c.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => csvEscape(row[c.key])).join(","));
  }
  // BOM so Excel detects UTF-8; CRLF line endings per RFC 4180.
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------------
// Report data builders
// ---------------------------------------------------------------------------

export type ReportType = "sales" | "stock" | "purchase" | "payments" | "party";

export interface ReportData {
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  summary: Record<string, number>;
  from: string;
  to: string;
}

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

function period(runDate: Date, daysBack: number): { from: string; to: string } {
  const from = new Date(runDate.getFullYear(), runDate.getMonth(), runDate.getDate() - daysBack);
  return { from: localDate(from), to: localDate(runDate) };
}

export async function buildReportData(
  userId: string,
  reportType: ReportType,
  runDate: Date,
  daysBack: number
): Promise<ReportData> {
  const { from, to } = period(runDate, daysBack);

  if (reportType === "sales") {
    const rowsRaw = await db
      .select({
        date: invoices.date,
        invoiceNo: invoices.invoiceNo,
        customerName: invoices.customerName,
        subtotal: invoices.subtotal,
        totalGst: invoices.totalGst,
        discountAmount: invoices.discountAmount,
        grandTotal: invoices.grandTotal,
        status: invoices.status,
      })
      .from(invoices)
      .where(and(eq(invoices.createdBy, userId), gte(invoices.date, from), lte(invoices.date, to)))
      .orderBy(asc(invoices.date), asc(invoices.invoiceNo));
    const inWindow = rowsRaw;
    const rows = inWindow.map((r) => ({ ...r, customerName: r.customerName ?? "Walk-in" }));
    return {
      columns: [
        { key: "date", header: "Date" },
        { key: "invoiceNo", header: "Invoice No" },
        { key: "customerName", header: "Customer" },
        { key: "subtotal", header: "Subtotal" },
        { key: "totalGst", header: "GST" },
        { key: "discountAmount", header: "Discount" },
        { key: "grandTotal", header: "Grand Total" },
        { key: "status", header: "Status" },
      ],
      rows,
      summary: {
        invoices: rows.length,
        subtotal: round2(rows.reduce((s, r) => s + (r.subtotal ?? 0), 0)),
        totalGst: round2(rows.reduce((s, r) => s + (r.totalGst ?? 0), 0)),
        grandTotal: round2(rows.reduce((s, r) => s + (r.grandTotal ?? 0), 0)),
      },
      from,
      to,
    };
  }

  if (reportType === "stock") {
    const rowsRaw = await db
      .select({
        name: medicines.name,
        batchNo: batches.batchNo,
        expiryDate: batches.expiryDate,
        quantity: batches.quantity,
        purchasePrice: batches.purchasePrice,
        sellingPrice: batches.sellingPrice,
      })
      .from(batches)
      .innerJoin(medicines, eq(batches.medicineId, medicines.id))
      .where(
        and(
          eq(batches.createdBy, userId),
          eq(batches.isActive, true),
          gt(batches.quantity, 0),
          eq(medicines.createdBy, userId)
        )
      )
      .orderBy(asc(medicines.name), asc(batches.expiryDate));
    const rows = rowsRaw.map((r) => ({
      ...r,
      quantity: r.quantity ?? 0,
      value: round2((r.quantity ?? 0) * (r.purchasePrice ?? 0)),
    }));
    return {
      columns: [
        { key: "name", header: "Medicine" },
        { key: "batchNo", header: "Batch" },
        { key: "expiryDate", header: "Expiry" },
        { key: "quantity", header: "Quantity" },
        { key: "purchasePrice", header: "Purchase Price" },
        { key: "sellingPrice", header: "Selling Price" },
        { key: "value", header: "Stock Value" },
      ],
      rows,
      summary: {
        batches: rows.length,
        stockValue: round2(rows.reduce((s, r) => s + (r.value as number), 0)),
      },
      from,
      to,
    };
  }

  if (reportType === "purchase") {
    const rowsRaw = await db
      .select({
        billDate: purchaseBills.billDate,
        billNo: purchaseBills.billNo,
        supplierName: purchaseBills.supplierName,
        joinedSupplier: suppliers.name,
        subtotal: purchaseBills.subtotal,
        totalGst: purchaseBills.totalGst,
        discountAmount: purchaseBills.discountAmount,
        grandTotal: purchaseBills.grandTotal,
        paymentStatus: purchaseBills.paymentStatus,
      })
      .from(purchaseBills)
      .leftJoin(suppliers, eq(purchaseBills.supplierId, suppliers.id))
      .where(
        and(
          eq(purchaseBills.createdBy, userId),
          gte(purchaseBills.billDate, from),
          lte(purchaseBills.billDate, to)
        )
      )
      .orderBy(asc(purchaseBills.billDate), asc(purchaseBills.billNo));
    const inWindow = rowsRaw;
    const rows = inWindow.map((r) => ({
      billDate: r.billDate,
      billNo: r.billNo,
      supplierName: r.supplierName ?? r.joinedSupplier ?? "",
      subtotal: r.subtotal,
      totalGst: r.totalGst,
      discountAmount: r.discountAmount,
      grandTotal: r.grandTotal,
      paymentStatus: r.paymentStatus,
    }));
    return {
      columns: [
        { key: "billDate", header: "Bill Date" },
        { key: "billNo", header: "Bill No" },
        { key: "supplierName", header: "Supplier" },
        { key: "subtotal", header: "Subtotal" },
        { key: "totalGst", header: "GST" },
        { key: "discountAmount", header: "Discount" },
        { key: "grandTotal", header: "Grand Total" },
        { key: "paymentStatus", header: "Payment Status" },
      ],
      rows,
      summary: {
        bills: rows.length,
        grandTotal: round2(rows.reduce((s, r) => s + (r.grandTotal ?? 0), 0)),
      },
      from,
      to,
    };
  }

  if (reportType === "payments") {
    const rowsRaw = await db
      .select({
        date: payments.date,
        type: payments.type,
        category: payments.category,
        amount: payments.amount,
        mode: payments.paymentMode,
        customerName: customers.name,
        supplierName: suppliers.name,
        description: payments.description,
      })
      .from(payments)
      .leftJoin(customers, eq(payments.customerId, customers.id))
      .leftJoin(suppliers, eq(payments.supplierId, suppliers.id))
      .where(and(eq(payments.createdBy, userId), gte(payments.date, from), lte(payments.date, to)))
      .orderBy(asc(payments.date));
    const inWindow = rowsRaw;
    const rows = inWindow.map((r) => ({
      date: r.date,
      type: r.type,
      category: r.category ?? "",
      amount: r.amount,
      mode: r.mode ?? "",
      party: r.customerName ?? r.supplierName ?? r.description ?? "",
    }));
    return {
      columns: [
        { key: "date", header: "Date" },
        { key: "type", header: "Type" },
        { key: "category", header: "Category" },
        { key: "amount", header: "Amount" },
        { key: "mode", header: "Mode" },
        { key: "party", header: "Party" },
      ],
      rows,
      summary: {
        payments: rows.length,
        amount: round2(rows.reduce((s, r) => s + (r.amount ?? 0), 0)),
      },
      from,
      to,
    };
  }

  // party — customers carrying a positive balance (credit outstanding).
  const rowsRaw = await db
    .select({
      name: customers.name,
      phone: customers.phone,
      balance: customers.balance,
      lastPurchaseDate: customers.lastPurchaseDate,
    })
    .from(customers)
    .where(and(eq(customers.createdBy, userId), gt(customers.balance, 0)))
    .orderBy(desc(customers.balance), asc(customers.name));
  const rows = rowsRaw.map((r) => ({ ...r, phone: r.phone ?? "" }));
  return {
    columns: [
      { key: "name", header: "Customer" },
      { key: "phone", header: "Phone" },
      { key: "balance", header: "Balance" },
      { key: "lastPurchaseDate", header: "Last Purchase" },
    ],
    rows,
    summary: {
      customers: rows.length,
      balance: round2(rows.reduce((s, r) => s + (r.balance ?? 0), 0)),
    },
    from,
    to,
  };
}

// ---------------------------------------------------------------------------
// runReport
// ---------------------------------------------------------------------------

export interface Recipient {
  channel: MessageChannel;
  address: string;
}

export interface RunReportResult {
  run: ScheduledReportRun;
  rows: number;
  /** Recipients whose delivery row + outbox event were queued. */
  delivered: number;
  /** Recipients that failed to queue (the run itself still succeeds). */
  deliveryFailed: number;
}

const INLINE_CSV_LIMIT = 100 * 1024; // 100 KB — larger CSVs are file-only.

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : (parsed as T);
  } catch {
    return fallback;
  }
}

function safeFilename(name: string, runDate: Date): string {
  const base = (name || "report").replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return `${base || "report"}_${localDate(runDate)}.csv`;
}

function summaryLine(data: ReportData): string {
  const parts = Object.entries(data.summary).map(([k, v]) => `${k}: ${v}`);
  return parts.join(", ");
}

/**
 * Execute one scheduled report for `userId`:
 * generate CSV → store file → record run (running → done) → queue one message
 * per recipient → advance `next_run_at` when triggered by the schedule → audit.
 * A 404 is thrown for a foreign/unknown report; generation failures store a
 * `failed` run and rethrow with a statusCode for the route.
 */
export async function runReport(
  userId: string,
  reportId: string,
  trigger: "manual" | "schedule"
): Promise<RunReportResult> {
  const [report] = await db
    .select()
    .from(scheduledReports)
    .where(and(eq(scheduledReports.id, reportId), eq(scheduledReports.createdBy, userId)))
    .limit(1);
  if (!report) {
    throw new ComplianceError(404, "Scheduled report not found");
  }

  const filters = parseJson<{ daysBack?: number }>(report.filters, {});
  const daysBack = Math.min(365, Math.max(1, Number(filters.daysBack) || 30));
  const recipients = parseJson<Recipient[]>(report.recipients, []);
  const schedule = parseSchedule(report.schedule);

  const now = new Date();
  const runId = generateId();
  await db.insert(scheduledReportRuns).values({
    id: runId,
    scheduledReportId: report.id,
    createdBy: userId,
    startedAt: now,
    status: "running",
    createdAt: now,
  });

  try {
    const data = await buildReportData(userId, report.reportType, now, daysBack);
    const csv = buildCsv(data.columns, data.rows);
    const file = await fileStorage.put({
      ownerId: userId,
      purpose: "scheduled-report",
      filename: safeFilename(report.name, now),
      contentType: "text/csv",
      bytes: Buffer.from(csv, "utf8"),
    });

    // --- delivery (best effort; messaging failures never fail the run) ---
    let delivered = 0;
    let deliveryFailed = 0;
    let firstEventId: string | null = null;
    const inline = Buffer.byteLength(csv, "utf8") <= INLINE_CSV_LIMIT;
    const body =
      `${report.name} — ${report.reportType} report, ${data.from} to ${data.to} ` +
      `(${data.rows.length} rows). ${summaryLine(data)}.\n\n` +
      (inline ? csv : "(CSV saved — open Scheduled Reports to download the file)");

    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      if (!recipient?.address || !recipient.channel) continue;
      try {
        const queued = await queueMessage(userId, {
          channel: recipient.channel,
          recipient: recipient.address,
          template: "custom",
          variables: { body },
          aggregateType: "scheduled_report",
          aggregateId: runId,
          idempotencyKey: `sr:${runId}:${recipient.channel}:${i}`,
        });
        delivered++;
        if (!firstEventId && queued.outboxEventId) firstEventId = queued.outboxEventId;
      } catch (err) {
        deliveryFailed++;
        console.error(
          "[scheduled-reports] delivery queue failed:",
          err instanceof Error ? err.message : err
        );
      }
    }

    const messageStatus =
      recipients.length === 0
        ? "none"
        : deliveryFailed === 0
          ? "queued"
          : delivered > 0
            ? "partial"
            : "failed";

    const finishedAt = new Date();
    const [run] = await db
      .update(scheduledReportRuns)
      .set({
        finishedAt,
        status: "done",
        rowCount: data.rows.length,
        fileId: file.id,
        outboxEventId: firstEventId,
        messageStatus,
      })
      .where(eq(scheduledReportRuns.id, runId))
      .returning();

    const lastRunAt = now.toISOString();
    if (trigger === "schedule") {
      // Advance from `now` so the next tick fires strictly in the future —
      // even when this run failed (failures must not hot-loop the worker).
      await db
        .update(scheduledReports)
        .set({
          lastRunAt,
          nextRunAt: schedule ? computeNextRun(now, schedule) : report.nextRunAt,
          updatedAt: new Date(),
        })
        .where(eq(scheduledReports.id, report.id));
    } else {
      await db
        .update(scheduledReports)
        .set({ lastRunAt, updatedAt: new Date() })
        .where(eq(scheduledReports.id, report.id));
    }

    await auditEvents.record({
      actorId: userId,
      action: "report.scheduled_run",
      entity: "scheduled_report",
      entityId: report.id,
      metadata: {
        runId,
        trigger,
        reportType: report.reportType,
        rows: data.rows.length,
        delivered,
        deliveryFailed,
      },
    });

    return { run, rows: data.rows.length, delivered, deliveryFailed };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(scheduledReportRuns)
      .set({ finishedAt: new Date(), status: "failed", error: message.slice(0, 500) })
      .where(eq(scheduledReportRuns.id, runId));

    if (trigger === "schedule" && schedule) {
      // Keep the schedule moving even after a failure (documented above).
      await db
        .update(scheduledReports)
        .set({
          lastRunAt: now.toISOString(),
          nextRunAt: computeNextRun(now, schedule),
          updatedAt: new Date(),
        })
        .where(eq(scheduledReports.id, report.id));
    }

    if (err instanceof ComplianceError) throw err;
    throw new ComplianceError(500, `Report run failed: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Due tick (worker)
// ---------------------------------------------------------------------------

export interface TickResult {
  due: number;
  ran: number;
  failed: number;
}

/**
 * Run every ENABLED report whose `next_run_at` <= now (limit 50). Errors are
 * caught per report — one bad report never crashes the tick (and runReport
 * already advanced its next_run_at on failure, so it won't hot-loop).
 */
export async function tickDueScheduledReports(now: Date = new Date()): Promise<TickResult> {
  const stamp = localStamp(now);
  const due = await db
    .select({ id: scheduledReports.id, createdBy: scheduledReports.createdBy })
    .from(scheduledReports)
    .where(
      and(
        eq(scheduledReports.enabled, true),
        isNotNull(scheduledReports.nextRunAt),
        lte(scheduledReports.nextRunAt, stamp)
      )
    )
    .orderBy(asc(scheduledReports.nextRunAt))
    .limit(50);

  let ran = 0;
  let failed = 0;
  for (const row of due) {
    try {
      await runReport(row.createdBy, row.id, "schedule");
      ran++;
    } catch (err) {
      failed++;
      console.error(
        `[scheduled-reports] tick run failed for ${row.id}:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  return { due: due.length, ran, failed };
}

/** Convenience loader for routes (tenant-scoped). */
export async function getReport(userId: string, reportId: string): Promise<ScheduledReport | null> {
  const [row] = await db
    .select()
    .from(scheduledReports)
    .where(and(eq(scheduledReports.id, reportId), eq(scheduledReports.createdBy, userId)))
    .limit(1);
  return row ?? null;
}
