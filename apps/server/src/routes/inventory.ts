import { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/index.js";
import { batches, medicines, inventoryTransactions } from "../db/schema/index.js";
import { eq, and, gt, lt, asc, sql, or } from "drizzle-orm";
import { foldText, searchPattern, MIN_SUBSEQUENCE_LEN } from "../lib/normalizeSearch.js";
import { authGuard } from "../plugins/auth.js";
import { generateId, INVENTORY_TRANSACTION_TYPES } from "../db/schema/index.js";
import { getPolicy, getUserRole, evaluateLineItems } from "../services/expiryPolicy.js";

// FEFO batch selection. Synchronous — better-sqlite3 executes queries
// inline, so this can run inside a db.transaction() callback (which is
// required to be synchronous).
export function selectBatchesFEFO(
  medicineId: string,
  requiredQty: number
): { batchId: string; quantity: number; rate: number }[] {
  const today = new Date().toISOString().split("T")[0];
  const availableBatches = db
    .select()
    .from(batches)
    .where(
      and(
        eq(batches.medicineId, medicineId),
        eq(batches.isActive, true),
        gt(batches.expiryDate, today),
        gt(batches.quantity, 0)
      )
    )
    .orderBy(asc(batches.expiryDate))
    .all();

  const selected: { batchId: string; quantity: number; rate: number }[] = [];
  let remaining = requiredQty;

  for (const batch of availableBatches) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantity ?? 0, remaining);
    selected.push({ batchId: batch.id, quantity: take, rate: batch.sellingPrice });
    remaining -= take;
  }
  return selected;
}

// FIFO batch selection — oldest-received (createdAt) first, non-expired and
// in-stock only. Same synchronous contract as selectBatchesFEFO so it can
// run inside a db.transaction() callback.
export function selectBatchesFIFO(
  medicineId: string,
  requiredQty: number
): { batchId: string; quantity: number; rate: number }[] {
  const today = new Date().toISOString().split("T")[0];
  const availableBatches = db
    .select()
    .from(batches)
    .where(
      and(
        eq(batches.medicineId, medicineId),
        eq(batches.isActive, true),
        gt(batches.expiryDate, today),
        gt(batches.quantity, 0)
      )
    )
    .orderBy(asc(batches.createdAt))
    .all();

  const selected: { batchId: string; quantity: number; rate: number }[] = [];
  let remaining = requiredQty;

  for (const batch of availableBatches) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantity ?? 0, remaining);
    selected.push({ batchId: batch.id, quantity: take, rate: batch.sellingPrice });
    remaining -= take;
  }
  return selected;
}

const createBatchSchema = z.object({
  medicineId: z.string().min(1),
  batchNo: z.string().min(1),
  expiryDate: z.string().min(1),
  mrp: z.number().min(0),
  purchasePrice: z.number().min(0),
  sellingPrice: z.number().min(0),
  quantity: z.number().int().min(0).default(0),
  freeQuantity: z.number().int().min(0).default(0),
  supplierId: z.string().optional(),
});

const updateBatchSchema = z.object({
  expiryDate: z.string().optional(),
  mrp: z.number().min(0).optional(),
  purchasePrice: z.number().min(0).optional(),
  sellingPrice: z.number().min(0).optional(),
});

const adjustmentSchema = z.object({
  batchId: z.string().min(1),
  reason: z.string().min(1),
  newQuantity: z.number().int().min(0),
  notes: z.string().optional(),
});

export default async function inventoryRoutes(fastify: FastifyInstance) {
  // Get batches for a medicine
  fastify.get("/batches", { preHandler: [authGuard] }, async (request, reply) => {
    const { medicineId } = request.query as { medicineId?: string };
    if (!medicineId) return reply.status(400).send({ success: false, error: "medicineId required" });

    const medicineBatches = await db.select().from(batches)
      .where(and(eq(batches.medicineId, medicineId), eq(batches.isActive, true), eq(batches.createdBy, request.userId!)))
      .orderBy(asc(batches.expiryDate));

    return reply.send({ success: true, data: medicineBatches });
  });

  // Get available (non-expired, in-stock) batches.
  // order=fefo (default): earliest expiry first; order=fifo: oldest received first.
  fastify.get("/batches/available", { preHandler: [authGuard] }, async (request, reply) => {
    const { medicineId, order } = request.query as { medicineId?: string; order?: string };
    if (!medicineId) return reply.status(400).send({ success: false, error: "medicineId required" });

    const today = new Date().toISOString().split("T")[0];
    const availableBatches = await db.select().from(batches)
      .where(and(eq(batches.medicineId, medicineId), eq(batches.isActive, true), eq(batches.createdBy, request.userId!), gt(batches.expiryDate, today), gt(batches.quantity, 0)))
      .orderBy(order === "fifo" ? asc(batches.createdAt) : asc(batches.expiryDate));

    return reply.send({ success: true, data: availableBatches });
  });

  // Create a new batch
  fastify.post("/batches", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = createBatchSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });

    const now = new Date();
    const [existing] = await db.select().from(batches)
      .where(and(eq(batches.medicineId, parsed.data.medicineId), eq(batches.batchNo, parsed.data.batchNo))).limit(1);
    if (existing) return reply.status(409).send({ success: false, error: "Batch number already exists for this medicine" });

    // Expiry Safety Policy (Task 5): manual stock-in is incoming stock and is
    // evaluated like a purchase. No override for manual batch creation.
    const stockInCheck = await evaluateLineItems(
      request.userId!,
      [{ batchNo: parsed.data.batchNo, expiryDate: parsed.data.expiryDate }],
      "purchase"
    );
    if (!stockInCheck.ok) {
      return reply.status(400).send({ success: false, error: "Expiry policy blocked this batch", blocked: stockInCheck.blocked });
    }

    const [batch] = await db.insert(batches).values({
      medicineId: parsed.data.medicineId,
      batchNo: parsed.data.batchNo,
      expiryDate: parsed.data.expiryDate,
      mrp: parsed.data.mrp,
      purchasePrice: parsed.data.purchasePrice,
      sellingPrice: parsed.data.sellingPrice,
      quantity: parsed.data.quantity,
      initialQuantity: parsed.data.quantity,
      freeQuantity: parsed.data.freeQuantity,
      supplierId: parsed.data.supplierId,
      createdBy: request.userId!,
      createdAt: now,
      updatedAt: now,
    }).returning();

    return reply.status(201).send({ success: true, data: batch });
  });

  // Update batch
  fastify.put("/batches/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateBatchSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });

    const [existing] = await db.select().from(batches).where(eq(batches.id, id)).limit(1);
    if (!existing) return reply.status(404).send({ success: false, error: "Batch not found" });

    // Expiry Safety Policy (Task 5): changing a batch's expiry is evaluated
    // like incoming stock. No override for edits — blocked changes are refused.
    if (parsed.data.expiryDate && parsed.data.expiryDate !== existing.expiryDate) {
      const policy = await getPolicy(request.userId!);
      const role = await getUserRole(request.userId!);
      const evaluation = await evaluateLineItems(
        request.userId!,
        [{ batchNo: existing.batchNo, expiryDate: parsed.data.expiryDate }],
        "batch_edit",
        role,
        policy,
      );
      if (!evaluation.ok) {
        return reply.status(400).send({
          success: false,
          error: "Expired/near-expiry batch blocked by policy",
          blocked: evaluation.blocked,
        });
      }
    }

    const [updated] = await db.update(batches).set({ ...parsed.data, updatedAt: new Date() }).where(eq(batches.id, id)).returning();
    return reply.send({ success: true, data: updated });
  });

  // Inventory transaction history
  fastify.get("/transactions", { preHandler: [authGuard] }, async (request, reply) => {
    const { medicineId, batchId, type, page = "1", limit = "50" } = request.query as {
      medicineId?: string; batchId?: string; type?: string; page?: string; limit?: string;
    };

    const conds = [];
    conds.push(eq(inventoryTransactions.createdBy, request.userId!));
    if (medicineId) conds.push(eq(inventoryTransactions.medicineId, medicineId));
    if (batchId) conds.push(eq(inventoryTransactions.batchId, batchId));
    if (type) conds.push(eq(inventoryTransactions.type, type as any));

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    const results = await db.select().from(inventoryTransactions)
      .where(conds.length > 0 ? and(...conds) : undefined)
      .orderBy(asc(inventoryTransactions.createdAt))
      .limit(limitNum).offset(offset);

    // Attach pack size so the UI can render "N strips + M tabs".
    const medIds = [...new Set(results.map((r) => r.medicineId).filter(Boolean))] as string[];
    const medRows = medIds.length > 0
      ? await db.select({ id: medicines.id, unitsPerPack: medicines.unitsPerPack })
        .from(medicines).where(or(...medIds.map((id) => eq(medicines.id, id))))
      : [];
    const uppByMed = new Map(medRows.map((m) => [m.id, m.unitsPerPack ?? 1]));

    return reply.send({
      success: true,
      data: results.map((r) => ({ ...r, unitsPerPack: r.medicineId ? (uppByMed.get(r.medicineId) ?? 1) : 1 })),
      pagination: { page: pageNum, limit: limitNum },
    });
  });

  // Stock adjustment
  fastify.post("/adjust", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = adjustmentSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });

    const now = new Date();
    const [batch] = await db.select().from(batches).where(and(eq(batches.id, parsed.data.batchId), eq(batches.createdBy, request.userId!))).limit(1);
    if (!batch) return reply.status(404).send({ success: false, error: "Batch not found" });

    const difference = parsed.data.newQuantity - (batch.quantity ?? 0);

    await db.update(batches).set({ quantity: parsed.data.newQuantity, updatedAt: now }).where(eq(batches.id, parsed.data.batchId));

    await db.insert(inventoryTransactions).values({
      id: generateId(),
      medicineId: batch.medicineId,
      batchId: batch.id,
      type: INVENTORY_TRANSACTION_TYPES.ADJUSTMENT,
      quantity: difference,
      balanceAfter: parsed.data.newQuantity,
      rate: batch.purchasePrice,
      reason: parsed.data.reason,
      notes: parsed.data.notes,
      createdBy: request.userId!,
      createdAt: now,
    });

    return reply.send({ success: true, data: { previousQuantity: batch.quantity, newQuantity: parsed.data.newQuantity, difference } });
  });

  // Low stock report
  fastify.get("/low-stock", { preHandler: [authGuard] }, async (request, reply) => {
    const allMedicines = await db.select().from(medicines).where(and(eq(medicines.isActive, true), eq(medicines.createdBy, request.userId!)));
    const today = new Date().toISOString().split("T")[0];

    const lowStock: any[] = [];
    for (const med of allMedicines) {
      const [stockResult] = await db.select({ totalQty: sql<number>`COALESCE(SUM(${batches.quantity}), 0)` })
        .from(batches)      .where(and(eq(batches.medicineId, med.id), eq(batches.isActive, true), eq(batches.createdBy, request.userId!), gt(batches.expiryDate, today)));
      const totalQty = stockResult?.totalQty ?? 0;
      if (totalQty <= (med.minQuantity ?? 10)) {
        lowStock.push({ ...med, availableStock: totalQty, minQuantity: med.minQuantity });
      }
    }
    return reply.send({ success: true, data: lowStock });
  });

  // Expiry report
  fastify.get("/expiry", { preHandler: [authGuard] }, async (request, reply) => {
    const { status } = request.query as { status?: "expired" | "30" | "60" | "90" };
    const today = new Date();
    let cutoffDate: Date;

    if (status === "expired") {
      cutoffDate = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    } else if (status === "30") {
      cutoffDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    } else if (status === "60") {
      cutoffDate = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000);
    } else {
      cutoffDate = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
    }

    const cutoffStr = cutoffDate.toISOString().split("T")[0];
    const todayStr = today.toISOString().split("T")[0];

    const expiringBatches = await db.select().from(batches)
      .innerJoin(medicines, eq(batches.medicineId, medicines.id))
      .where(and(eq(batches.isActive, true), lt(batches.expiryDate, cutoffStr), gt(batches.quantity, 0)))
      .orderBy(asc(batches.expiryDate));

    return reply.send({ success: true, data: expiringBatches.map((r: any) => ({
      ...r.batches,
      medicineName: r.medicines.name,
      medicineBrand: r.medicines.brand,
    })) });
  });

  // Current stock report — all medicines with aggregated + per-batch data
  fastify.get("/stock", { preHandler: [authGuard] }, async (request, reply) => {
    const { category, search } = request.query as { category?: string; search?: string };
    const conds = [eq(medicines.isActive, true)];
    if (category) conds.push(eq(medicines.category, category));
    if (search) {
      const pat = searchPattern(search);
      const matches = [
        sql`fold(${medicines.name}) LIKE ${pat}`,
        sql`fold(${medicines.brand}) LIKE ${pat}`,
        sql`fold(${medicines.genericName}) LIKE ${pat}`,
        sql`fold(${medicines.composition}) LIKE ${pat}`,
        sql`fold(${medicines.barcode}) LIKE ${pat}`,
      ];
      // Abbreviations should surface via token-level (subsequence) matching too.
      if (foldText(search).length >= MIN_SUBSEQUENCE_LEN) {
        matches.push(
          sql`is_subseq(${search}, ${medicines.name})`,
          sql`is_subseq(${search}, ${medicines.genericName})`,
          sql`is_subseq(${search}, ${medicines.brand})`,
          sql`is_subseq(${search}, ${medicines.composition})`
        );
      }
      conds.push(or(...matches)!);
    }

    conds.push(eq(medicines.createdBy, request.userId!));
    const allMedicines = await db.select().from(medicines).where(and(...conds));
    const today = new Date().toISOString().split("T")[0];

    const stockData = await Promise.all(allMedicines.map(async (med) => {
      const [totalResult] = await db.select({
        totalQty: sql<number>`COALESCE(SUM(${batches.quantity}), 0)`,
        totalValue: sql<number>`COALESCE(SUM(${batches.quantity} * ${batches.purchasePrice}), 0)`,
      }).from(batches).where(and(eq(batches.medicineId, med.id), eq(batches.isActive, true), eq(batches.createdBy, request.userId!)));

      const [availableResult] = await db.select({
        availableQty: sql<number>`COALESCE(SUM(${batches.quantity}), 0)`,
      }).from(batches)      .where(and(eq(batches.medicineId, med.id), eq(batches.isActive, true), eq(batches.createdBy, request.userId!), gt(batches.expiryDate, today)));

      // Include active batches for this medicine
      const medBatches = await db.select().from(batches)
        .where(and(eq(batches.medicineId, med.id), eq(batches.isActive, true), eq(batches.createdBy, request.userId!)))
        .orderBy(asc(batches.expiryDate));

      return {
        ...med,
        totalStock: totalResult?.totalQty ?? 0,
        availableStock: availableResult?.availableQty ?? 0,
        stockValue: totalResult?.totalValue ?? 0,
        batches: medBatches,
      };
    }));

    return reply.send({ success: true, data: stockData });
  });
}
