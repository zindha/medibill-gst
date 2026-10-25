import { z } from "zod";
import { statSync } from "fs";
import { and, asc, eq, gt, or, sql } from "drizzle-orm";
import { db, DB_PATH } from "../db/index.js";
import {
  backupHistory,
  customers,
  generateId,
  medicines,
  settings,
  suppliers,
  syncOperations,
  SYNC_ENTITIES,
  type SyncOperationStatus,
} from "../db/schema/index.js";

/**
 * Task 15 — offline sync: idempotent push, cursor pull, version conflicts.
 *
 * Scope (deliberate):
 *  - Sync entities: medicine, customer, supplier, setting — the only rows with
 *    an `updatedAt` version we can compare against a client `baseVersion`.
 *    Refill reminders are excluded (append-ish, no `updatedAt` column).
 *  - Invoices / journals / orders are NEVER sync entities: they are
 *    server-authoritative and flow through their normal APIs (a client that
 *    needs one while offline must wait for connectivity). Pushing them returns
 *    per-op `status: "error"` / "unsupported entity".
 *  - Conflict policy: a stale `baseVersion` yields `status: "conflict"` with the
 *    server row in `conflict` — the row is NOT modified. Resolution is manual:
 *    re-push the same operation WITHOUT `baseVersion` to force-overwrite.
 *  - No audit events on push (high volume); the sync_operations journal itself
 *    is the record of every applied/conflicting/failed operation.
 */

// Mirrors routes/medicines.ts createMedicineSchema (that schema is module-
// private, so it is duplicated here field-for-field).
const medicineCreateSchema = z.object({
  name: z.string().min(1),
  genericName: z.string().optional(),
  brand: z.string().optional(),
  category: z.string().optional(),
  composition: z.string().optional(),
  hsnCode: z.string().optional(),
  gstRate: z.enum(["0", "5", "12", "18", "28"]).default("12"),
  schedule: z.string().optional(),
  dosageForm: z.string().optional(),
  strength: z.string().optional(),
  unit: z.string().default("unit"),
  packSize: z.string().optional(),
  unitsPerPack: z.number().min(0).optional(),
  barcode: z.string().optional(),
  rackLocation: z.string().optional(),
  minQuantity: z.number().int().min(0).default(10),
  reorderLevel: z.number().int().min(0).default(20),
  maxQuantity: z.number().int().min(0).default(0),
  reorderPointDays: z.number().int().min(0).default(0),
  demandPeriodDays: z.number().int().min(0).default(30),
  seasonal: z.boolean().optional().default(false),
  purchasePrice: z.number().min(0).default(0),
  sellingPrice: z.number().min(0).default(0),
  mrp: z.number().min(0).optional(),
});
const medicineUpdateSchema = medicineCreateSchema.partial();

const customerUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  gstin: z.string().optional(),
  creditLimit: z.number().optional(),
  openingBalance: z.number().optional(),
  notes: z.string().optional(),
});

const supplierUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  gstin: z.string().optional(),
  paymentTerms: z.string().optional(),
  creditLimit: z.number().optional(),
  openingBalance: z.number().optional(),
  drugLicenseNo: z.string().optional(),
  gstinVerified: z.boolean().optional(),
});

const settingUpsertSchema = z.object({
  key: z.string().min(1).max(120),
  value: z.unknown(),
});

// `entity` / `action` are plain strings here on purpose — unknown entities must
// surface as a per-operation "unsupported entity" error, not a request 400.
export const pushOperationSchema = z.object({
  operationId: z.string().min(1).max(64),
  entity: z.string().min(1),
  action: z.string().min(1),
  payload: z.unknown().optional(),
  baseVersion: z.string().optional(),
});

export const pushSchema = z.object({
  operations: z.array(pushOperationSchema).min(1).max(100),
});

export type PushOperation = z.infer<typeof pushOperationSchema>;

export interface PushResult {
  operationId: string;
  status: SyncOperationStatus;
  entityId?: string;
  appliedVersion?: string;
  conflict?: unknown;
  error?: string;
}

export interface PushOutcome {
  results: PushResult[];
  applied: number;
  conflicts: number;
  duplicates: number;
  errors: number;
}

const ENTITY_LABELS: Record<string, string> = {
  medicine: "Medicine",
  customer: "Customer",
  supplier: "Supplier",
};

function pickDefined(values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/**
 * Entity columns store `updatedAt` at SECOND granularity (drizzle
 * `mode: "timestamp"`), so a write inside the same second would otherwise keep
 * the identical version. Sync versions must change on every successful write —
 * bump at least one second past the previous value to keep them strictly
 * monotonic (documented in API.md).
 */
function nextVersion(previous: Date | null | undefined): Date {
  // SQLite timestamps are second-granular, so comparing/flooring at seconds is
  // what guarantees the value actually CHANGES after a write — a same-second
  // update would otherwise store an identical value and look like a no-op.
  const nowSec = Math.floor(Date.now() / 1000) * 1000;
  if (!previous) return new Date(nowSec);
  const prev = Math.floor(previous.getTime() / 1000) * 1000;
  return new Date(nowSec > prev ? nowSec : prev + 1000);
}

async function recordOperation(input: {
  createdBy: string;
  operationId: string;
  deviceToken?: string | null;
  entity: string;
  action: string;
  payload: unknown;
  entityId?: string | null;
  baseVersion?: string | null;
  appliedVersion?: string | null;
  status: SyncOperationStatus;
  conflict?: unknown;
  error?: string | null;
}): Promise<void> {
  await db.insert(syncOperations).values({
    id: generateId(),
    createdBy: input.createdBy,
    operationId: input.operationId,
    deviceToken: input.deviceToken ?? null,
    entity: input.entity,
    action: input.action,
    payload: JSON.stringify(input.payload ?? null),
    entityId: input.entityId ?? null,
    baseVersion: input.baseVersion ?? null,
    appliedVersion: input.appliedVersion ?? null,
    status: input.status,
    conflictJson: input.conflict === undefined ? null : JSON.stringify(input.conflict),
    error: input.error ?? null,
    appliedAt: new Date(),
    createdAt: new Date(),
  });
}

/**
 * Apply one operation. Idempotency: an existing (createdBy, operationId) row
 * short-circuits to `duplicate` without touching data.
 */
async function applyOperation(
  userId: string,
  op: PushOperation,
  deviceToken?: string | null
): Promise<PushResult> {
  const seen = await db.query.syncOperations.findFirst({
    where: and(
      eq(syncOperations.createdBy, userId),
      eq(syncOperations.operationId, op.operationId)
    ),
  });
  if (seen) {
    return { operationId: op.operationId, status: "duplicate" };
  }

  const base = {
    createdBy: userId,
    operationId: op.operationId,
    deviceToken: deviceToken ?? null,
    entity: op.entity,
    action: op.action,
    payload: op.payload ?? null,
    baseVersion: op.baseVersion ?? null,
  };

  // ---- Unsupported entity (invoices / journals / orders / …) -------------
  if (!(SYNC_ENTITIES as readonly string[]).includes(op.entity)) {
    const error = "unsupported entity";
    await recordOperation({ ...base, status: "error", error });
    return { operationId: op.operationId, status: "error", error };
  }

  // ---- Medicine create ---------------------------------------------------
  if (op.entity === "medicine" && op.action === "create") {
    const parsed = medicineCreateSchema.safeParse(op.payload ?? {});
    if (!parsed.success) {
      const error = `Validation error: ${parsed.error.issues
        .map((i) => `${i.path.join(".") || "payload"}: ${i.message}`)
        .join("; ")}`;
      await recordOperation({ ...base, status: "error", error });
      return { operationId: op.operationId, status: "error", error };
    }
    const now = new Date();
    const [row] = await db
      .insert(medicines)
      .values({ ...parsed.data, createdBy: userId, createdAt: now, updatedAt: now })
      .returning();
    const appliedVersion = row.updatedAt.toISOString();
    await recordOperation({
      ...base,
      status: "applied",
      entityId: row.id,
      appliedVersion,
    });
    return { operationId: op.operationId, status: "applied", entityId: row.id, appliedVersion };
  }

  // ---- Setting upsert ----------------------------------------------------
  if (op.entity === "setting") {
    if (op.action !== "create" && op.action !== "update") {
      const error = "unsupported action";
      await recordOperation({ ...base, status: "error", error });
      return { operationId: op.operationId, status: "error", error };
    }
    const parsed = settingUpsertSchema.safeParse(op.payload ?? {});
    if (!parsed.success) {
      const error = `Validation error: ${parsed.error.issues
        .map((i) => `${i.path.join(".") || "payload"}: ${i.message}`)
        .join("; ")}`;
      await recordOperation({ ...base, status: "error", error });
      return { operationId: op.operationId, status: "error", error };
    }
    const { key, value } = parsed.data;
    const [existing] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
    const now = nextVersion(existing?.updatedAt);
    if (existing && op.baseVersion && existing.updatedAt.toISOString() !== op.baseVersion) {
      const conflict = JSON.parse(JSON.stringify(existing));
      await recordOperation({ ...base, status: "conflict", entityId: existing.id, conflict });
      return { operationId: op.operationId, status: "conflict", conflict };
    }
    const valueStr = typeof value === "string" ? value : JSON.stringify(value ?? null);
    let rowId: string;
    let updatedAt: Date;
    if (existing) {
      await db
        .update(settings)
        .set({ value: valueStr, updatedAt: now })
        .where(eq(settings.key, key));
      const [updated] = await db
        .select()
        .from(settings)
        .where(eq(settings.key, key))
        .limit(1);
      rowId = updated!.id;
      updatedAt = updated!.updatedAt;
    } else {
      const [inserted] = await db
        .insert(settings)
        .values({ id: generateId(), key, value: valueStr, updatedAt: now })
        .returning();
      rowId = inserted.id;
      updatedAt = inserted.updatedAt;
    }
    const appliedVersion = updatedAt.toISOString();
    await recordOperation({
      ...base,
      status: "applied",
      entityId: rowId,
      appliedVersion,
    });
    return { operationId: op.operationId, status: "applied", entityId: rowId, appliedVersion };
  }

  // ---- Medicine / customer / supplier update -----------------------------
  if (op.action !== "update") {
    const error = "unsupported action";
    await recordOperation({ ...base, status: "error", error });
    return { operationId: op.operationId, status: "error", error };
  }

  const entityId =
    typeof (op.payload as any)?.id === "string"
      ? ((op.payload as any).id as string)
      : typeof (op.payload as any)?.entityId === "string"
        ? ((op.payload as any).entityId as string)
        : undefined;
  if (!entityId) {
    const error = "entityId is required for update";
    await recordOperation({ ...base, status: "error", error });
    return { operationId: op.operationId, status: "error", error };
  }

  const table =
    op.entity === "medicine" ? medicines : op.entity === "customer" ? customers : suppliers;
  const label = ENTITY_LABELS[op.entity] ?? op.entity;

  // Tenant safety: only the pushing user's own rows are visible/updateable.
  const [row] = await db
    .select()
    .from(table)
    .where(and(eq(table.id, entityId), eq((table as any).createdBy, userId)))
    .limit(1);
  if (!row) {
    const error = `${label} not found`;
    await recordOperation({ ...base, status: "error", error, entityId });
    return { operationId: op.operationId, status: "error", error };
  }

  if (op.baseVersion && (row as any).updatedAt.toISOString() !== op.baseVersion) {
    const conflict = JSON.parse(JSON.stringify(row));
    await recordOperation({ ...base, status: "conflict", entityId, conflict });
    return { operationId: op.operationId, status: "conflict", conflict };
  }

  const schema =
    op.entity === "medicine"
      ? medicineUpdateSchema
      : op.entity === "customer"
        ? customerUpdateSchema
        : supplierUpdateSchema;
  const parsed = schema.safeParse((op.payload as any) ?? {});
  if (!parsed.success) {
    const error = `Validation error: ${parsed.error.issues
      .map((i) => `${i.path.join(".") || "payload"}: ${i.message}`)
      .join("; ")}`;
    await recordOperation({ ...base, status: "error", error, entityId });
    return { operationId: op.operationId, status: "error", error };
  }

  const clean = pickDefined(parsed.data as Record<string, unknown>);
  const now = nextVersion((row as any).updatedAt);
  await db
    .update(table)
    .set({ ...clean, updatedAt: now } as any)
    .where(eq(table.id, entityId));
  const [updated] = await db.select().from(table).where(eq(table.id, entityId)).limit(1);
  const appliedVersion = (updated as any).updatedAt.toISOString();
  await recordOperation({
    ...base,
    status: "applied",
    entityId,
    appliedVersion,
  });
  return { operationId: op.operationId, status: "applied", entityId, appliedVersion };
}

/** Apply a batch (≤100 ops) sequentially so in-batch duplicates collapse too. */
export async function pushOperations(
  userId: string,
  operations: PushOperation[],
  deviceToken?: string | null
): Promise<PushOutcome> {
  const results: PushResult[] = [];
  let applied = 0;
  let conflicts = 0;
  let duplicates = 0;
  let errors = 0;

  for (const op of operations) {
    const result = await applyOperation(userId, op, deviceToken);
    results.push(result);
    if (result.status === "applied") applied++;
    else if (result.status === "conflict") conflicts++;
    else if (result.status === "duplicate") duplicates++;
    else errors++;
  }

  return { results, applied, conflicts, duplicates, errors };
}

export interface PullOp {
  operationId: string;
  entity: string | null;
  action: string | null;
  payload: unknown;
  entityId: string | null;
  appliedVersion: string | null;
  appliedAt: string;
  status: SyncOperationStatus;
}

export interface PullOutcome {
  ops: PullOp[];
  nextCursor: string | null;
  hasMore: boolean;
}

function encodeCursor(appliedAt: Date, id: string): string {
  return `${appliedAt.toISOString()}|${id}`;
}

/**
 * Cursor feed of the caller's own operations (applied + conflict — clients need
 * conflicts to reconcile; duplicates and errors are omitted). Ordered by
 * (applied_at, id) ascending; the cursor is `"<ISO ts>|<row id>"`.
 */
export async function pullOperations(
  userId: string,
  cursor: string | null | undefined,
  limit?: number
): Promise<PullOutcome> {
  const limitNum = Math.min(500, Math.max(1, Number(limit) || 100));
  const conds: any[] = [
    eq(syncOperations.createdBy, userId),
    sql`${syncOperations.status} IN ('applied', 'conflict')`,
  ];

  if (cursor) {
    const [ts, id] = cursor.split("|");
    const date = new Date(ts ?? "");
    if (isNaN(date.getTime()) || !id) {
      const err = new Error("Invalid cursor") as Error & { statusCode?: number };
      err.statusCode = 400;
      throw err;
    }
    conds.push(
      or(
        gt(syncOperations.appliedAt, date),
        and(eq(syncOperations.appliedAt, date), gt(syncOperations.id, id))
      )
    );
  }

  const rows = await db
    .select()
    .from(syncOperations)
    .where(and(...conds))
    .orderBy(asc(syncOperations.appliedAt), asc(syncOperations.id))
    .limit(limitNum + 1);

  const hasMore = rows.length > limitNum;
  const page = rows.slice(0, limitNum);
  const last = page[page.length - 1];

  return {
    ops: page.map((r) => ({
      operationId: r.operationId,
      entity: r.entity,
      action: r.action,
      payload: safeJson(r.payload),
      entityId: r.entityId,
      appliedVersion: r.appliedVersion,
      appliedAt: new Date(r.appliedAt).toISOString(),
      status: r.status,
    })),
    nextCursor: hasMore && last ? encodeCursor(new Date(last.appliedAt), last.id) : null,
    hasMore,
  };
}

function safeJson(value: string | null): unknown {
  if (value == null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export interface SyncStatus {
  opsCount: number;
  dbSizeBytes: number;
  lastBackupAt: string | null;
  serverTime: string;
}

/** Ops journal size + install health for the Sync tab (best-effort stats). */
export async function syncStatus(userId: string): Promise<SyncStatus> {
  const [ops] = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(syncOperations)
    .where(eq(syncOperations.createdBy, userId));

  let dbSizeBytes = 0;
  try {
    dbSizeBytes = statSync(DB_PATH).size;
  } catch {
    dbSizeBytes = 0;
  }

  const [lastBackup] = await db
    .select({ createdAt: backupHistory.createdAt })
    .from(backupHistory)
    .where(eq(backupHistory.status, "success"))
    .orderBy(sql`created_at DESC`)
    .limit(1);

  return {
    opsCount: Number(ops?.c ?? 0),
    dbSizeBytes,
    lastBackupAt: lastBackup ? new Date(lastBackup.createdAt).toISOString() : null,
    serverTime: new Date().toISOString(),
  };
}
