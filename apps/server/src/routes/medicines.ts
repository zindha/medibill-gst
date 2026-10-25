import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { db } from "../db/index.js";
import { medicines, batches, inventoryTransactions } from "../db/schema/index.js";
import { eq, or, and, asc, desc, sql, gt } from "drizzle-orm";
import { authGuard } from "../plugins/auth.js";
import { generateId } from "../db/schema/index.js";
import { foldText, searchPattern, MIN_SUBSEQUENCE_LEN } from "../lib/normalizeSearch.js";

// Validation schemas — GST rate stored as string in DB
const createMedicineSchema = z.object({
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
  // Reorder policy: stock ceiling, supplier lead time (days), demand
  // averaging window (days) and a seasonal-demand flag.
  maxQuantity: z.number().int().min(0).default(0),
  reorderPointDays: z.number().int().min(0).default(0),
  demandPeriodDays: z.number().int().min(0).default(30),
  seasonal: z.boolean().optional().default(false),
  purchasePrice: z.number().min(0).default(0),
  sellingPrice: z.number().min(0).default(0),
  mrp: z.number().min(0).optional(),
});

const updateMedicineSchema = createMedicineSchema.partial();

export default async function medicineRoutes(fastify: FastifyInstance) {
  // Search/list medicines
  fastify.get("/", { preHandler: [authGuard] }, async (request, reply) => {
    const { search, category, page = "1", limit = "50" } = request.query as {
      search?: string; category?: string; page?: string; limit?: string;
    };

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    const conds = [eq(medicines.createdBy, request.userId!), eq(medicines.isActive, true)];
    if (search) {
      const pat = searchPattern(search);
      const matches = [
        sql`fold(${medicines.name}) LIKE ${pat}`,
        sql`fold(${medicines.genericName}) LIKE ${pat}`,
        sql`fold(${medicines.brand}) LIKE ${pat}`,
        sql`fold(${medicines.composition}) LIKE ${pat}`,
        sql`fold(${medicines.barcode}) LIKE ${pat}`,
      ];
      // Token-level (subsequence) matching over folded text, so abbreviations like
      // "pmol" still surface "paracetamol". Too-short queries stay substring-only.
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
    if (category) conds.push(eq(medicines.category, category));

    // Weak word-match ranking: exact brand/name matches sort above loose composition hits.
    let order = asc(medicines.name);
    if (search) {
      const q = foldText(search);
      order = desc(sql<number>`(
        CASE
          WHEN fold(${medicines.name}) = ${q} THEN 100
          WHEN fold(${medicines.brand}) = ${q} THEN 90
          WHEN fold(${medicines.name}) LIKE ${q + "%"} THEN 80
          WHEN fold(${medicines.brand}) LIKE ${q + "%"} THEN 70
          WHEN fold(${medicines.genericName}) = ${q} THEN 60
          WHEN fold(${medicines.name}) LIKE ${"% " + q + " %"} THEN 55
          WHEN fold(${medicines.brand}) LIKE ${"% " + q + " %"} THEN 50
          WHEN fold(${medicines.genericName}) LIKE ${q + "%"} THEN 40
          WHEN fold(${medicines.composition}) LIKE ${q + "%"} THEN 35
          WHEN fold(${medicines.composition}) LIKE ${"% " + q + " %"} THEN 30
          WHEN is_subseq(${search}, ${medicines.name}) THEN 24
          WHEN is_subseq(${search}, ${medicines.genericName}) THEN 22
          WHEN is_subseq(${search}, ${medicines.brand}) THEN 21
          WHEN is_subseq(${search}, ${medicines.composition}) THEN 20
          ELSE 10
        END
      )`);
    }

    const results = await db.select().from(medicines).where(and(...conds)).orderBy(order, asc(medicines.name)).limit(limitNum).offset(offset);

    const today = new Date().toISOString().split("T")[0];
    const withStock = await Promise.all(results.map(async (med) => {
      const br = await db.select({ totalQty: sql<number>`COALESCE(SUM(${batches.quantity}), 0)` })
        .from(batches).where(and(eq(batches.medicineId, med.id), eq(batches.isActive, true), gt(batches.expiryDate, today)));
      return { ...med, availableStock: br[0]?.totalQty ?? 0 };
    }));

    return reply.send({ success: true, data: withStock, pagination: { page: pageNum, limit: limitNum } });
  });

  // Get single medicine
  fastify.get("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [medicine] = await db.select().from(medicines)
      .where(and(eq(medicines.id, id), eq(medicines.createdBy, request.userId!), eq(medicines.isActive, true))).limit(1);
    if (!medicine) return reply.status(404).send({ success: false, error: "Medicine not found" });

    const medicineBatches = await db.select().from(batches)
      .where(and(eq(batches.medicineId, id), eq(batches.createdBy, request.userId!), eq(batches.isActive, true)))
      .orderBy(asc(batches.expiryDate));

    return reply.send({ success: true, data: { ...medicine, batches: medicineBatches } });
  });

  // Create medicine
  fastify.post("/", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = createMedicineSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });

    const now = new Date();
    const [medicine] = await db.insert(medicines).values({
      ...parsed.data,
      createdBy: request.userId!,
      createdAt: now,
      updatedAt: now,
    }).returning();

    await db.insert(inventoryTransactions).values({
      id: generateId(), medicineId: medicine.id, type: "stock_in", quantity: 0, balanceAfter: 0,
      reason: "Medicine created", createdBy: request.userId!, createdAt: now,
    });

    return reply.status(201).send({ success: true, data: medicine });
  });

  // Update medicine
  fastify.put("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateMedicineSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });

    const [existing] = await db.select().from(medicines)
      .where(and(eq(medicines.id, id), eq(medicines.createdBy, request.userId!), eq(medicines.isActive, true))).limit(1);
    if (!existing) return reply.status(404).send({ success: false, error: "Medicine not found" });

    const [updated] = await db.update(medicines).set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(medicines.id, id), eq(medicines.createdBy, request.userId!))).returning();
    return reply.send({ success: true, data: updated });
  });

  // Delete medicine (soft delete).
  // 0-stock, 0-batch catalog-seeded medicines are deletable. History-bearing
  // medicines (billed, purchased, or with stock) are blocked with 409.
  fastify.delete("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const [existing] = await db.select().from(medicines).where(and(eq(medicines.id, id), eq(medicines.isActive, true))).limit(1);
      if (!existing) return reply.status(404).send({ success: false, error: "Medicine not found" });

      if (existing.createdBy !== request.userId!) {
        return reply.status(404).send({ success: false, error: "Medicine not found" });
      }

      const invCountRow = await db.select({ c: sql<number>`COUNT(*)` }).from(inventoryTransactions)
        .where(and(eq(inventoryTransactions.medicineId, id), eq(inventoryTransactions.createdBy, request.userId!)));
      const invCount = Number((invCountRow[0] as any)?.c ?? 0);

      // More than the single "Medicine created" transaction => has stock/invoice history
      if (invCount > 1) {
        return reply.status(409).send({ success: false, error: "Cannot delete: invoiced or stocked" });
      }

      // Additional hard guards even when invCount is 1 (e.g. legacy rows)
      const stockRow = await db.select({ qty: sql<number>`COALESCE(SUM(${batches.quantity}), 0)` }).from(batches)
        .where(and(eq(batches.medicineId, id), eq(batches.isActive, true)));
      if (Number((stockRow[0] as any)?.qty ?? 0) > 0) {
        return reply.status(409).send({ success: false, error: "Cannot delete: still has stock" });
      }

      await db.update(medicines).set({ isActive: false, updatedAt: new Date() }).where(eq(medicines.id, id));
      await db.update(batches).set({ isActive: false, updatedAt: new Date() }).where(and(eq(batches.medicineId, id), eq(batches.isActive, true)));
      return reply.send({ success: true, data: { message: "Medicine deactivated successfully" } });
    } catch (err: any) {
      request.log.error({ err, msg: "DELETE /api/medicines/:id failed" });
      return reply.status(500).send({ success: false, error: err?.message ?? "Failed to delete medicine" });
    }
  });

  // Search by barcode
  fastify.get("/barcode/:barcode", { preHandler: [authGuard] }, async (request, reply) => {
    const { barcode } = request.params as { barcode: string };
    const [medicine] = await db.select().from(medicines)
      .where(and(eq(medicines.barcode, barcode), eq(medicines.createdBy, request.userId!), eq(medicines.isActive, true))).limit(1);
    if (!medicine) return reply.status(404).send({ success: false, error: "Medicine not found for this barcode" });

    const today = new Date().toISOString().split("T")[0];
    const medicineBatches = await db.select().from(batches)
      .where(and(eq(batches.medicineId, medicine.id), eq(batches.createdBy, request.userId!), eq(batches.isActive, true), gt(batches.expiryDate, today), gt(batches.quantity, 0)))
      .orderBy(asc(batches.expiryDate));

    return reply.send({ success: true, data: { ...medicine, batches: medicineBatches } });
  });
}
