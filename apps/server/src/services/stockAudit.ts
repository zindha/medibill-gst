import { db } from "../db/index.js";
import {
  stockAudits,
  stockAuditCounts,
  batches,
  medicines,
  inventoryTransactions,
  INVENTORY_TRANSACTION_TYPES,
  STOCK_AUDIT_STATUSES,
  type StockAudit,
  type StockAuditCount,
  type StockAuditStatus,
} from "../db/schema/index.js";
import { and, asc, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { auditEvents } from "./audit.js";
import { getUserRole } from "./expiryPolicy.js";

/** Domain error with an HTTP status the route layer maps straight to a reply. */
export class StockAuditError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status = 400, details?: unknown) {
    super(message);
    this.name = "StockAuditError";
    this.status = status;
    this.details = details;
  }
}

const APPROVER_ROLES = ["admin", "pharmacist"];

export interface StockAuditSummary {
  /** Active batches in this tenant's inventory — the progress denominator. */
  totalRows: number;
  /** Batches counted so far in this audit. */
  counted: number;
  /** Count rows whose variance is non-zero. */
  varianceRows: number;
  /** Signed sum of delta x batch purchase price (only computed from joined rows). */
  totalVarianceValue?: number;
}

export interface StockAuditRow {
  id: string;
  auditId: string;
  medicineId: string;
  batchId: string;
  medicineName: string;
  medicineBrand: string | null;
  batchNo: string;
  expiryDate: string;
  expectedQuantity: number;
  countedQuantity: number;
  variance: number;
  currentBatchQuantity: number;
  purchasePrice: number;
  countedAt: Date | string;
}

export interface StockAuditListRow extends StockAudit {
  summary: StockAuditSummary;
}

export interface StockAuditDetail {
  audit: StockAudit;
  rows: StockAuditRow[];
  uncounted: Array<{
    id: string;
    medicineId: string;
    medicineName: string;
    medicineBrand: string | null;
    batchNo: string;
    expiryDate: string;
    currentQuantity: number;
    purchasePrice: number;
  }>;
  summary: StockAuditSummary;
}

async function loadAudit(userId: string, id: string): Promise<StockAudit> {
  const [row] = await db
    .select()
    .from(stockAudits)
    .where(and(eq(stockAudits.id, id), eq(stockAudits.createdBy, userId)))
    .limit(1);
  if (!row) throw new StockAuditError("Stock audit not found", 404);
  return row;
}

async function assertApprover(userId: string): Promise<void> {
  const role = await getUserRole(userId);
  if (!APPROVER_ROLES.includes(role)) {
    throw new StockAuditError("Only admin or pharmacist can approve or cancel a stock audit", 403);
  }
}

async function totalActiveBatches(userId: string): Promise<number> {
  const [row] = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(batches)
    .where(and(eq(batches.createdBy, userId), eq(batches.isActive, true)));
  return Number(row?.c ?? 0);
}

export async function createAudit(
  userId: string,
  input: { note?: string }
): Promise<StockAudit> {
  const now = new Date();
  const [row] = await db
    .insert(stockAudits)
    .values({
      createdBy: userId,
      status: STOCK_AUDIT_STATUSES.OPEN,
      note: input.note ?? null,
      startedAt: now,
      createdAt: now,
    })
    .returning();
  return row;
}

export async function listAudits(
  userId: string,
  opts: { status?: string; page?: number; limit?: number } = {}
): Promise<{ rows: StockAuditListRow[]; total: number; page: number; limit: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 20));

  const conds = [eq(stockAudits.createdBy, userId)];
  if (opts.status) conds.push(eq(stockAudits.status, opts.status as StockAuditStatus));

  const all = await db
    .select()
    .from(stockAudits)
    .where(and(...conds))
    .orderBy(desc(stockAudits.startedAt), desc(stockAudits.createdAt));

  const total = all.length;
  const rows = all.slice((page - 1) * limit, page * limit);
  if (rows.length === 0) return { rows: [], total, page, limit };

  const auditIds = rows.map((r) => r.id);
  const countRows = await countSummariesForAudits(auditIds);
  const batchesTotal = await totalActiveBatches(userId);

  const out: StockAuditListRow[] = rows.map((audit) => {
    const counts = countRows.filter((c) => c.auditId === audit.id);
    const varianceRows = counts.filter((c) => c.variance !== 0);
    const totalVarianceValue =
      varianceRows.length > 0
        ? Math.round(
            varianceRows.reduce((a, c) => a + c.variance * (c.purchasePrice ?? 0), 0) * 100
          ) / 100
        : 0;
    return {
      ...audit,
      summary: {
        totalRows: batchesTotal,
        counted: counts.length,
        varianceRows: varianceRows.length,
        totalVarianceValue,
      },
    };
  });

  return { rows: out, total, page, limit };
}

async function countSummariesForAudits(auditIds: string[]) {
  if (auditIds.length === 0) return [];
  const joined = await db
    .select({
      auditId: stockAuditCounts.auditId,
      expected: stockAuditCounts.expectedQuantity,
      counted: stockAuditCounts.countedQuantity,
      purchasePrice: batches.purchasePrice,
    })
    .from(stockAuditCounts)
    .innerJoin(batches, eq(stockAuditCounts.batchId, batches.id))
    .where(inArray(stockAuditCounts.auditId, auditIds));
  return joined.map((r) => ({
    auditId: r.auditId,
    variance: (r.counted ?? 0) - (r.expected ?? 0),
    purchasePrice: r.purchasePrice ?? 0,
  }));
}

export async function getAudit(userId: string, id: string): Promise<StockAuditDetail> {
  const audit = await loadAudit(userId, id);

  const joined = await db
    .select({
      id: stockAuditCounts.id,
      auditId: stockAuditCounts.auditId,
      medicineId: stockAuditCounts.medicineId,
      batchId: stockAuditCounts.batchId,
      expectedQuantity: stockAuditCounts.expectedQuantity,
      countedQuantity: stockAuditCounts.countedQuantity,
      countedAt: stockAuditCounts.countedAt,
      batchNo: batches.batchNo,
      expiryDate: batches.expiryDate,
      currentBatchQuantity: batches.quantity,
      purchasePrice: batches.purchasePrice,
      medicineName: medicines.name,
      medicineBrand: medicines.brand,
    })
    .from(stockAuditCounts)
    .innerJoin(batches, eq(stockAuditCounts.batchId, batches.id))
    .innerJoin(medicines, eq(stockAuditCounts.medicineId, medicines.id))
    .where(eq(stockAuditCounts.auditId, id))
    .orderBy(asc(medicines.name), asc(batches.expiryDate));

  const countedBatchIds = joined.map((r) => r.batchId);

  const uncountedJoined = await db
    .select({
      id: batches.id,
      medicineId: batches.medicineId,
      batchNo: batches.batchNo,
      expiryDate: batches.expiryDate,
      currentQuantity: batches.quantity,
      purchasePrice: batches.purchasePrice,
      medicineName: medicines.name,
      medicineBrand: medicines.brand,
    })
    .from(batches)
    .innerJoin(medicines, eq(batches.medicineId, medicines.id))
    .where(
      and(
        eq(batches.createdBy, userId),
        eq(batches.isActive, true),
        countedBatchIds.length > 0
          ? notInArray(batches.id, countedBatchIds)
          : sql`1 = 1`
      )
    )
    .orderBy(asc(medicines.name), asc(batches.expiryDate));

  const rows: StockAuditRow[] = joined.map((r) => ({
    id: r.id,
    auditId: r.auditId,
    medicineId: r.medicineId,
    batchId: r.batchId,
    medicineName: r.medicineName,
    medicineBrand: r.medicineBrand,
    batchNo: r.batchNo,
    expiryDate: r.expiryDate,
    expectedQuantity: r.expectedQuantity,
    countedQuantity: r.countedQuantity,
    variance: (r.countedQuantity ?? 0) - (r.expectedQuantity ?? 0),
    currentBatchQuantity: r.currentBatchQuantity ?? 0,
    purchasePrice: r.purchasePrice ?? 0,
    countedAt: r.countedAt,
  }));

  const variances = rows.filter((r) => r.variance !== 0);
  const totalVarianceValue =
    Math.round(variances.reduce((a, r) => a + r.variance * r.purchasePrice, 0) * 100) / 100;

  return {
    audit,
    rows,
    uncounted: uncountedJoined.map((r) => ({
      id: r.id,
      medicineId: r.medicineId,
      medicineName: r.medicineName,
      medicineBrand: r.medicineBrand,
      batchNo: r.batchNo,
      expiryDate: r.expiryDate,
      currentQuantity: r.currentQuantity ?? 0,
      purchasePrice: r.purchasePrice ?? 0,
    })),
    summary: {
      totalRows: rows.length + uncountedJoined.length,
      counted: rows.length,
      varianceRows: variances.length,
      totalVarianceValue,
    },
  };
}

export interface UpsertCountResult {
  row: StockAuditCount;
  created: boolean;
}

export async function upsertCount(
  userId: string,
  auditId: string,
  input: { medicineId: string; batchId: string; countedQuantity: number }
): Promise<UpsertCountResult> {
  const audit = await loadAudit(userId, auditId);
  if (audit.status !== STOCK_AUDIT_STATUSES.OPEN) {
    throw new StockAuditError(`Stock audit is ${audit.status}`, 409);
  }
  if (!(input.countedQuantity >= 0)) {
    throw new StockAuditError("countedQuantity must be >= 0", 400);
  }

  const [batch] = await db
    .select()
    .from(batches)
    .where(and(eq(batches.id, input.batchId), eq(batches.createdBy, userId)))
    .limit(1);
  if (!batch) throw new StockAuditError("Batch not found", 400);
  if (batch.medicineId !== input.medicineId) {
    throw new StockAuditError("medicineId does not match the batch", 400);
  }

  const now = new Date();
  const [existing] = await db
    .select()
    .from(stockAuditCounts)
    .where(and(eq(stockAuditCounts.auditId, auditId), eq(stockAuditCounts.batchId, input.batchId)))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(stockAuditCounts)
      .set({
        countedQuantity: input.countedQuantity,
        recount: input.countedQuantity,
        countedAt: now,
      })
      .where(eq(stockAuditCounts.id, existing.id))
      .returning();
    return { row: updated, created: false };
  }

  const [row] = await db
    .insert(stockAuditCounts)
    .values({
      auditId,
      createdBy: userId,
      medicineId: input.medicineId,
      batchId: input.batchId,
      expectedQuantity: batch.quantity ?? 0,
      countedQuantity: input.countedQuantity,
      recount: null,
      countedAt: now,
      createdAt: now,
    })
    .returning();
  return { row, created: true };
}

export async function updateCount(
  userId: string,
  countId: string,
  input: { countedQuantity: number }
): Promise<StockAuditCount> {
  const [count] = await db
    .select()
    .from(stockAuditCounts)
    .where(eq(stockAuditCounts.id, countId))
    .limit(1);
  if (!count) throw new StockAuditError("Stock audit count not found", 404);

  const audit = await loadAudit(userId, count.auditId);
  if (audit.status !== STOCK_AUDIT_STATUSES.OPEN) {
    throw new StockAuditError(`Stock audit is ${audit.status}`, 409);
  }
  if (!(input.countedQuantity >= 0)) {
    throw new StockAuditError("countedQuantity must be >= 0", 400);
  }

  const now = new Date();
  const [updated] = await db
    .update(stockAuditCounts)
    .set({
      countedQuantity: input.countedQuantity,
      recount: input.countedQuantity,
      countedAt: now,
    })
    .where(eq(stockAuditCounts.id, count.id))
    .returning();
  return updated;
}

export interface ApproveResult {
  audit: StockAudit;
  adjustments: Array<{
    batchId: string;
    medicineId: string;
    delta: number;
    previousQuantity: number;
    newQuantity: number;
  }>;
}

export async function approveAudit(
  userId: string,
  auditId: string,
  input: { reason: string }
): Promise<ApproveResult> {
  await assertApprover(userId);
  const audit = await loadAudit(userId, auditId);
  if (audit.status !== STOCK_AUDIT_STATUSES.OPEN) {
    throw new StockAuditError(`Stock audit is ${audit.status}`, 409);
  }

  const now = new Date();
  const notes = input.reason ?? audit.note ?? null;

  const adjustments = db.transaction((tx): ApproveResult["adjustments"] => {
    const counts = tx
      .select()
      .from(stockAuditCounts)
      .where(eq(stockAuditCounts.auditId, auditId))
      .all();

    const applied: ApproveResult["adjustments"] = [];
    for (const count of counts) {
      const delta = (count.countedQuantity ?? 0) - (count.expectedQuantity ?? 0);
      if (delta === 0) continue;

      const [batch] = tx
        .select()
        .from(batches)
        .where(eq(batches.id, count.batchId))
        .limit(1)
        .all();
      if (!batch) continue;

      const previousQuantity = batch.quantity ?? 0;
      const newQuantity = Math.max(0, previousQuantity + delta);

      tx.insert(inventoryTransactions)
        .values({
          medicineId: batch.medicineId,
          batchId: batch.id,
          type: INVENTORY_TRANSACTION_TYPES.ADJUSTMENT,
          quantity: delta,
          balanceAfter: newQuantity,
          rate: batch.purchasePrice,
          reason: `Stock audit ${auditId}`,
          notes,
          createdBy: userId,
          createdAt: now,
        })
        .run();

      tx.update(batches)
        .set({ quantity: newQuantity, updatedAt: now })
        .where(eq(batches.id, batch.id))
        .run();

      applied.push({
        batchId: batch.id,
        medicineId: batch.medicineId,
        delta,
        previousQuantity,
        newQuantity,
      });
    }

    tx.update(stockAudits)
      .set({
        status: STOCK_AUDIT_STATUSES.APPROVED,
        approvedAt: now,
        approvedBy: userId,
      })
      .where(eq(stockAudits.id, auditId))
      .run();

    return applied;
  });

  await auditEvents.record({
    actorId: userId,
    action: "stock_audit.approve",
    entity: "stock_audit",
    entityId: auditId,
    metadata: {
      auditId,
      adjustments: adjustments.length,
      deltas: adjustments.map((a) => ({
        batchId: a.batchId,
        medicineId: a.medicineId,
        delta: a.delta,
      })),
      reason: input.reason,
    },
  });

  const [approved] = await db
    .select()
    .from(stockAudits)
    .where(eq(stockAudits.id, auditId))
    .limit(1);

  return { audit: approved ?? { ...audit, status: STOCK_AUDIT_STATUSES.APPROVED }, adjustments };
}

export async function cancelAudit(
  userId: string,
  auditId: string,
  reason?: string
): Promise<StockAudit> {
  await assertApprover(userId);
  const audit = await loadAudit(userId, auditId);
  if (audit.status !== STOCK_AUDIT_STATUSES.OPEN) {
    throw new StockAuditError(`Stock audit is ${audit.status}`, 409);
  }

  const [cancelled] = await db
    .update(stockAudits)
    .set({ status: STOCK_AUDIT_STATUSES.CANCELLED })
    .where(eq(stockAudits.id, auditId))
    .returning();

  await auditEvents.record({
    actorId: userId,
    action: "stock_audit.cancel",
    entity: "stock_audit",
    entityId: auditId,
    metadata: { auditId, reason: reason ?? null },
  });

  return cancelled;
}
