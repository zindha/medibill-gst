import { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  purchaseReturns,
  purchaseReturnItems,
  purchaseBills,
  suppliers,
  medicines,
  batches,
  inventoryTransactions,
  activityLog,
} from "../db/schema/index.js";
import { eq, and, desc, sql } from "drizzle-orm";
import { authGuard } from "../plugins/auth.js";
import { generateId, INVENTORY_TRANSACTION_TYPES } from "../db/schema/index.js";
import { getUserRole } from "../services/expiryPolicy.js";
import { auditEvents } from "../services/audit.js";
import { postSync, purchaseReturnJournalLines } from "../services/accounting.js";
import { nextDocumentNumber } from "../services/numbering.js";

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const returnItemSchema = z.object({
  medicineId: z.string().min(1),
  batchId: z.string().optional(),
  batchNo: z.string().optional(),
  hsnCode: z.string().optional(),
  quantity: z.number().int().min(1),
  rate: z.number().positive(),
  gstRate: z.enum(["0", "5", "12", "18", "28"]).optional(),
  mrp: z.number().min(0).optional(),
  reason: z.string().optional(),
});

const createReturnSchema = z.object({
  purchaseBillId: z.string().optional(),
  supplierId: z.string().optional(),
  supplierName: z.string().optional(),
  date: z.string().min(1),
  reason: z.string().optional(),
  refundAmount: z.number().min(0).optional(),
  refundMode: z.enum(["cash", "card", "upi", "credit", "other"]).optional(),
  items: z.array(returnItemSchema).min(1),
});

export default async function purchaseReturnRoutes(fastify: FastifyInstance) {
  // List purchase returns (tenant-scoped, date/supplier filters, paginated)
  fastify.get("/", { preHandler: [authGuard] }, async (request, reply) => {
    const { date, from, to, supplierId, page = "1", limit = "50" } = request.query as {
      date?: string;
      from?: string;
      to?: string;
      supplierId?: string;
      page?: string;
      limit?: string;
    };

    const conds = [eq(purchaseReturns.createdBy, request.userId!)];
    if (date) conds.push(eq(purchaseReturns.date, date));
    if (supplierId) conds.push(eq(purchaseReturns.supplierId, supplierId));
    if (from) conds.push(sql`${purchaseReturns.date} >= ${from}`);
    if (to) conds.push(sql`${purchaseReturns.date} <= ${to}`);
    const where = and(...conds);

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    const [results, totalRows] = await Promise.all([
      db
        .select()
        .from(purchaseReturns)
        .where(where)
        .orderBy(desc(purchaseReturns.date), desc(purchaseReturns.createdAt))
        .limit(limitNum)
        .offset(offset),
      db.select({ value: sql<number>`count(*)`.mapWith(Number) }).from(purchaseReturns).where(where),
    ]);

    return reply.send({
      success: true,
      data: results,
      total: totalRows[0]?.value ?? 0,
      page: pageNum,
      limit: limitNum,
    });
  });

  // Get a single purchase return with its items (tenant-scoped → 404 foreign)
  fastify.get("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [ret] = await db
      .select()
      .from(purchaseReturns)
      .where(and(eq(purchaseReturns.id, id), eq(purchaseReturns.createdBy, request.userId!)))
      .limit(1);

    if (!ret) return reply.status(404).send({ success: false, error: "Purchase return not found" });

    const items = await db
      .select()
      .from(purchaseReturnItems)
      .where(eq(purchaseReturnItems.returnId, id));

    return reply.send({ success: true, data: { ...ret, items } });
  });

  // Create purchase return (admin | pharmacist — cashier → 403)
  fastify.post("/", { preHandler: [authGuard] }, async (request, reply) => {
    const userId = request.userId!;
    const role = await getUserRole(userId);
    if (role !== "admin" && role !== "pharmacist") {
      return reply.status(403).send({ success: false, error: "Insufficient permissions" });
    }

    const parsed = createReturnSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    const data = parsed.data;
    const refundMode = data.refundMode ?? "cash";
    const now = new Date();

    // ── Purchase bill (optional): must exist + belong to this tenant. ──────
    let supplierId = data.supplierId;
    let supplierName = data.supplierName;
    if (data.purchaseBillId) {
      const [bill] = await db
        .select()
        .from(purchaseBills)
        .where(
          and(
            eq(purchaseBills.id, data.purchaseBillId),
            eq(purchaseBills.createdBy, userId)
          )
        )
        .limit(1);
      if (!bill) {
        return reply.status(404).send({ success: false, error: "Purchase bill not found" });
      }
      supplierId = supplierId ?? bill.supplierId ?? undefined;
      supplierName = supplierName ?? bill.supplierName ?? undefined;
    }

    // ── Supplier (optional): tenant-owned when referenced. ─────────────────
    if (supplierId) {
      const [supplier] = await db
        .select()
        .from(suppliers)
        .where(and(eq(suppliers.id, supplierId), eq(suppliers.createdBy, userId)))
        .limit(1);
      if (!supplier) {
        return reply.status(400).send({ success: false, error: "Supplier not found" });
      }
      supplierName = supplierName ?? supplier.name;
    }

    // ── Resolve items: medicine ownership + target batch + money math. ─────
    interface ResolvedItem {
      input: (typeof data.items)[number];
      medicine: typeof medicines.$inferSelect;
      batch: typeof batches.$inferSelect;
      gstRate: number;
      amount: number;
      gstAmount: number;
      cgst: number;
      sgst: number;
    }
    const resolved: ResolvedItem[] = [];
    const batchDemand = new Map<string, number>();

    for (const item of data.items) {
      const [medicine] = await db
        .select()
        .from(medicines)
        .where(and(eq(medicines.id, item.medicineId), eq(medicines.createdBy, userId)))
        .limit(1);
      if (!medicine) {
        return reply.status(400).send({ success: false, error: "Medicine not found" });
      }

      // Purchase returns target a SPECIFIC batch: an explicit batchId must
      // belong to this tenant AND to this medicine. Without one, a medicine
      // with exactly one active batch auto-resolves to it; zero or multiple
      // batches are refused so the caller always knows which lot leaves stock.
      let batch: typeof batches.$inferSelect | undefined;
      if (item.batchId) {
        const [explicit] = await db
          .select()
          .from(batches)
          .where(and(eq(batches.id, item.batchId), eq(batches.createdBy, userId)))
          .limit(1);
        if (!explicit) {
          return reply.status(400).send({ success: false, error: "Batch not found" });
        }
        if (explicit.medicineId !== item.medicineId) {
          return reply
            .status(400)
            .send({ success: false, error: "Batch does not belong to this medicine" });
        }
        batch = explicit;
      } else {
        const candidates = await db
          .select()
          .from(batches)
          .where(
            and(
              eq(batches.medicineId, item.medicineId),
              eq(batches.createdBy, userId),
              eq(batches.isActive, true)
            )
          );
        if (candidates.length === 1) {
          batch = candidates[0];
        } else if (candidates.length === 0) {
          return reply
            .status(400)
            .send({ success: false, error: `No stock batch found for ${medicine.name}` });
        } else {
          return reply.status(400).send({
            success: false,
            error: `Multiple batches for ${medicine.name} — batchId is required`,
          });
        }
      }

      // Money math mirrors invoice create: amount = rate × qty (GST-inclusive),
      // gstAmount = amount − amount / (1 + gstRate/100), cgst/sgst split.
      const gstRate = Number(item.gstRate ?? medicine.gstRate ?? 12);
      const amount = round2(item.rate * item.quantity);
      const base = round2(amount / (1 + gstRate / 100));
      const gstAmount = round2(amount - base);

      resolved.push({
        input: item,
        medicine,
        batch,
        gstRate,
        amount,
        gstAmount,
        cgst: round2(gstAmount / 2),
        sgst: round2(gstAmount / 2),
      });
      batchDemand.set(batch.id, (batchDemand.get(batch.id) ?? 0) + item.quantity);
    }

    // ── Stock guard (cumulative across items sharing a batch). ─────────────
    for (const [batchId, demand] of batchDemand) {
      const [batch] = await db.select().from(batches).where(eq(batches.id, batchId)).limit(1);
      const available = batch?.quantity ?? 0;
      if (available < demand) {
        return reply.status(400).send({
          success: false,
          error: `Insufficient stock in batch ${batch?.batchNo ?? batchId}, available ${available}`,
        });
      }
    }

    // ── Totals. grandTotal = Σ amount; refundAmount defaults to it. ────────
    const totalGst = round2(resolved.reduce((sum, r) => sum + r.gstAmount, 0));
    const grandTotal = round2(resolved.reduce((sum, r) => sum + r.amount, 0));
    const subtotal = round2(grandTotal - totalGst);
    const refundAmount = round2(data.refundAmount ?? grandTotal);
    const returnNo = (await nextDocumentNumber("purchaseReturn")).number;

    // ── ONE transaction: return + items + stock out + balance + journal. ───
    let accountingFailure: unknown = null;
    try {
      const created = db.transaction((tx) => {
        const [ret] = tx
          .insert(purchaseReturns)
          .values({
            id: generateId(),
            returnNo,
            purchaseBillId: data.purchaseBillId,
            supplierId,
            supplierName,
            date: data.date,
            reason: data.reason,
            subtotal,
            totalGst,
            grandTotal,
            refundAmount,
            refundMode: refundMode as any,
            status: "completed",
            createdBy: userId,
            createdAt: now,
          })
          .returning()
          .all();

        for (const r of resolved) {
          tx.insert(purchaseReturnItems).values({
            id: generateId(),
            returnId: ret.id,
            medicineId: r.medicine.id,
            medicineName: r.medicine.name,
            batchId: r.batch.id,
            batchNo: r.batch.batchNo,
            hsnCode: r.input.hsnCode ?? r.medicine.hsnCode ?? null,
            quantity: r.input.quantity,
            unit: r.medicine.unit,
            rate: r.input.rate,
            amount: r.amount,
            gstRate: (r.input.gstRate ?? r.medicine.gstRate ?? "12") as any,
            gstAmount: r.gstAmount,
            cgst: r.cgst,
            sgst: r.sgst,
            refundAmount: r.amount,
            createdAt: now,
          }).run();

          // Goods leave stock: re-read inside the transaction, then deduct
          // (validated above, so the batch always covers the demand).
          const [batch] = tx
            .select()
            .from(batches)
            .where(and(eq(batches.id, r.batch.id), eq(batches.createdBy, userId)))
            .limit(1)
            .all();
          if (!batch) throw new Error("Batch not found while deducting stock");

          const newQty = (batch.quantity ?? 0) - r.input.quantity;
          tx.update(batches)
            .set({ quantity: newQty, updatedAt: now })
            .where(eq(batches.id, batch.id))
            .run();

          tx.insert(inventoryTransactions)
            .values({
              id: generateId(),
              medicineId: r.medicine.id,
              batchId: batch.id,
              type: INVENTORY_TRANSACTION_TYPES.PURCHASE_RETURN,
              quantity: -r.input.quantity,
              balanceAfter: newQty,
              rate: r.input.rate,
              reference: returnNo,
              reason: r.input.reason ?? data.reason ?? "Purchase return",
              createdBy: userId,
              createdAt: now,
            })
            .run();
        }

        // Supplier balance rule (mirrors purchases.ts, which only adds the
        // UNPAID portion to the balance): a credit refund settles against our
        // dues → balance −= refundAmount; a cash/card/upi/other refund changes
        // hands without touching outstanding dues → balance unchanged.
        if (supplierId && refundMode === "credit") {
          const [supplier] = tx
            .select()
            .from(suppliers)
            .where(and(eq(suppliers.id, supplierId), eq(suppliers.createdBy, userId)))
            .limit(1)
            .all();
          if (supplier) {
            tx.update(suppliers)
              .set({
                balance: (supplier.balance ?? 0) - refundAmount,
                updatedAt: now,
              })
              .where(eq(suppliers.id, supplierId))
              .run();
          }
        }

        tx.insert(activityLog)
          .values({
            id: generateId(),
            userId,
            action: "CREATE",
            entity: "purchase_return",
            entityId: ret.id,
            details: `Purchase return ${returnNo} created for ₹${refundAmount}`,
            createdAt: now,
          })
          .run();

        // Task 11: post inside the same transaction so the ledger can never
        // drift from the books. Validation failures (unbalanced/closed period)
        // are caught so the return still commits; the gap is audited below.
        try {
          postSync(tx, userId, {
            date: data.date,
            sourceType: "purchase_return",
            sourceId: ret.id,
            description: returnNo,
            lines: purchaseReturnJournalLines({
              refundAmount,
              totalGst,
              grandTotal,
              refundMode,
              supplierId,
            }),
          });
        } catch (err) {
          accountingFailure = err;
        }

        return ret;
      });

      if (accountingFailure) {
        fastify.log.error(accountingFailure as Error);
        await auditEvents.record({
          actorId: userId,
          action: "accounting.post_failed",
          entity: "purchase_return",
          entityId: created.id,
          metadata: {
            returnNo,
            error:
              accountingFailure instanceof Error
                ? accountingFailure.message
                : String(accountingFailure),
          },
        });
      }

      await auditEvents.record({
        actorId: userId,
        action: "purchase_return.create",
        entity: "purchase_return",
        entityId: created.id,
        metadata: { returnNo, refundAmount, refundMode, supplierId: supplierId ?? null },
      });

      const items = await db
        .select()
        .from(purchaseReturnItems)
        .where(eq(purchaseReturnItems.returnId, created.id));

      return reply.status(201).send({ success: true, data: { ...created, items } });
    } catch (error: any) {
      fastify.log.error(error);
      return reply
        .status(500)
        .send({ success: false, error: `Unable to process purchase return: ${error.message}` });
    }
  });
}
