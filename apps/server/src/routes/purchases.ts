import { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  purchaseBills, purchaseBillItems, batches, medicines, inventoryTransactions, suppliers, payments, activityLog,
} from "../db/schema/index.js";
import { eq, and, desc, or, like, sql, inArray } from "drizzle-orm";
import { authGuard } from "../plugins/auth.js";
import { generateId, INVENTORY_TRANSACTION_TYPES } from "../db/schema/index.js";
import { getPolicy, getUserRole, evaluateLineItems } from "../services/expiryPolicy.js";
import { auditEvents } from "../services/audit.js";
import { postSafely, purchaseJournalLines } from "../services/accounting.js";

const purchaseItemSchema = z.object({
  medicineId: z.string().optional(),
  medicineName: z.string().min(1),
  batchId: z.string().optional(),
  batchNo: z.string().optional(),
  expiryDate: z.string().optional(),
  hsnCode: z.string().optional(),
  quantity: z.number().int().min(1),
  freeQuantity: z.number().int().min(0).default(0),
  unit: z.string().optional(),
  rate: z.number().min(0),
  amount: z.number().min(0),
  gstRate: z.enum(["0", "5", "12", "18", "28"]).default("12"),
  gstAmount: z.number().min(0).default(0),
  cgst: z.number().min(0).default(0),
  sgst: z.number().min(0).default(0),
  discountAmount: z.number().min(0).default(0),
  mrp: z.number().min(0).optional(),
});

const createPurchaseSchema = z.object({
  supplierId: z.string().optional(),
  supplierName: z.string().optional(),
  billNo: z.string().min(1),
  billDate: z.string().optional(),
  dueDate: z.string().optional(),
  items: z.array(purchaseItemSchema).min(1),
  subtotal: z.number().min(0),
  totalGst: z.number().min(0),
  discountAmount: z.number().min(0).default(0),
  grandTotal: z.number().min(0),
  amountPaid: z.number().min(0).default(0),
  paymentMode: z.enum(["cash", "card", "upi", "credit", "other"]).optional(),
  notes: z.string().optional(),
  // Expiry Safety Policy (Task 5): blocked incoming expiry may be overridden
  // by an allowed role with an explicit reason (audited).
  overrideExpiry: z.boolean().optional().default(false),
  overrideReason: z.string().optional(),
});

export default async function purchaseRoutes(fastify: FastifyInstance) {
  // List purchase bills
  fastify.get("/", { preHandler: [authGuard] }, async (request, reply) => {
    const { supplierId, from, to, search, page = "1", limit = "50" } = request.query as {
      supplierId?: string; from?: string; to?: string; search?: string; page?: string; limit?: string;
    };

    const conds = [eq(purchaseBills.createdBy, request.userId!)];
    if (supplierId) conds.push(eq(purchaseBills.supplierId, supplierId));
    if (search) {
      const pat = `%${search}%`;
      conds.push(or(like(purchaseBills.billNo, pat), like(purchaseBills.supplierName, pat))!);
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    const whereClause = conds.length > 0 ? and(...conds) : undefined;
    const [results, totalRows] = await Promise.all([
      db.select().from(purchaseBills)
        .where(whereClause)
        .orderBy(desc(purchaseBills.createdAt))
        .limit(limitNum).offset(offset),
      db.select({ value: sql<number>`count(*)`.mapWith(Number) }).from(purchaseBills).where(whereClause),
    ]);
    const total = totalRows[0]?.value ?? 0;
    const list = [...results];

    // `from`/`to` are applied post-query (rarely used); adjust the total accordingly.
    const filtered = from || to ? list.filter(p => (!from || p.billDate >= from) && (!to || p.billDate <= to)) : list;

    return reply.send({ success: true, data: filtered, pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.max(1, Math.ceil(total / limitNum)) } });
  });

  // Get single purchase bill
  fastify.get("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [bill] = await db.select().from(purchaseBills)
      .where(and(eq(purchaseBills.id, id), eq(purchaseBills.createdBy, request.userId!))).limit(1);
    if (!bill) return reply.status(404).send({ success: false, error: "Purchase bill not found" });

    const items = await db.select().from(purchaseBillItems).where(eq(purchaseBillItems.purchaseBillId, id));
    return reply.send({ success: true, data: { ...bill, items } });
  });

  // Create purchase bill
  fastify.post("/", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = createPurchaseSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });

    const data = parsed.data;
    const now = new Date();
    const billDate = data.billDate ?? now.toISOString().split("T")[0];

    // Expiry Safety Policy (Task 5): incoming batch expiry is decided here,
    // so reject the whole bill before writing anything when a line is blocked
    // (expired per blockExpiredPurchase, or inside the blockWithinDays window).
    const policy = await getPolicy(request.userId!);
    const callerRole = await getUserRole(request.userId!);
    const evaluation = await evaluateLineItems(
      request.userId!,
      data.items.map((item) => ({ batchNo: item.batchNo, expiryDate: item.expiryDate })),
      "purchase",
      callerRole,
      policy,
    );
    if (!evaluation.ok) {
      const roleAllowed = policy.allowOverrideRoles.includes(callerRole);
      const overrideReason = data.overrideReason?.trim();
      if (data.overrideExpiry && roleAllowed && overrideReason) {
        await auditEvents.record({
          actorId: request.userId!,
          action: "purchase.expiry_override",
          entity: "purchase_bill",
          metadata: {
            billNo: data.billNo,
            overrideReason,
            items: evaluation.blocked.map((b) => ({ batchNo: b.batchNo, expiryDate: b.expiryDate, reason: b.reason })),
          },
        });
      } else if (data.overrideExpiry && roleAllowed) {
        return reply.status(400).send({
          success: false,
          error: "overrideReason is required to override the expiry policy",
          blocked: evaluation.blocked,
        });
      } else {
        return reply.status(400).send({
          success: false,
          error: "Expired/near-expiry batch blocked by policy",
          blocked: evaluation.blocked,
        });
      }
    }

    const medicineIds = [...new Set(data.items.map((i) => i.medicineId).filter(Boolean))] as string[];
    if (medicineIds.length > 0) {
      const owned = await db.select({ id: medicines.id }).from(medicines)
        .where(and(inArray(medicines.id, medicineIds), eq(medicines.createdBy, request.userId!)));
      if (owned.length !== medicineIds.length) {
        return reply.status(400).send({ success: false, error: "Medicine not found" });
      }
    }
    if (data.supplierId) {
      const [supplier] = await db.select({ id: suppliers.id }).from(suppliers)
        .where(and(eq(suppliers.id, data.supplierId), eq(suppliers.createdBy, request.userId!))).limit(1);
      if (!supplier) return reply.status(400).send({ success: false, error: "Supplier not found" });
    }

    try {
      const [bill] = await db.insert(purchaseBills).values({
        billNo: data.billNo,
        supplierId: data.supplierId,
        supplierName: data.supplierName,
        billDate,
        dueDate: data.dueDate,
        subtotal: data.subtotal,
        totalGst: data.totalGst,
        discountAmount: data.discountAmount,
        grandTotal: data.grandTotal,
        amountPaid: data.amountPaid,
        paymentMode: data.paymentMode,
        paymentStatus: data.amountPaid >= data.grandTotal ? "paid" : data.amountPaid > 0 ? "partial" : "unpaid",
        notes: data.notes,
        createdBy: request.userId!,
        createdAt: now,
        updatedAt: now,
      }).returning();

      for (const item of data.items) {
        await db.insert(purchaseBillItems).values({
          purchaseBillId: bill.id,
          medicineId: item.medicineId,
          medicineName: item.medicineName,
          batchId: item.batchId,
          batchNo: item.batchNo,
          expiryDate: item.expiryDate,
          hsnCode: item.hsnCode,
          quantity: item.quantity,
          freeQuantity: item.freeQuantity,
          unit: item.unit,
          rate: item.rate,
          amount: item.amount,
          gstRate: item.gstRate as any,
          gstAmount: item.gstAmount,
          cgst: item.cgst,
          sgst: item.sgst,
          discountAmount: item.discountAmount,
          mrp: item.mrp,
          createdAt: now,
        }).returning();

        // Add stock to batch
        if (item.batchId) {
          const [batch] = await db.select().from(batches)
            .where(and(eq(batches.id, item.batchId), eq(batches.createdBy, request.userId!))).limit(1);
          if (batch) {
            const newQty = (batch.quantity ?? 0) + item.quantity + item.freeQuantity;
            await db.update(batches).set({ quantity: newQty, updatedAt: now })
              .where(and(eq(batches.id, item.batchId), eq(batches.createdBy, request.userId!)));

            await db.insert(inventoryTransactions).values({
              id: generateId(),
              medicineId: batch.medicineId,
              batchId: batch.id,
              type: INVENTORY_TRANSACTION_TYPES.PURCHASE,
              quantity: item.quantity + item.freeQuantity,
              balanceAfter: newQty,
              rate: item.rate,
              reference: data.billNo,
              createdBy: request.userId!,
              createdAt: now,
            });
          }
        } else if (item.medicineId && item.batchNo && item.expiryDate) {
          const [newBatch] = await db.insert(batches).values({
            medicineId: item.medicineId,
            batchNo: item.batchNo,
            expiryDate: item.expiryDate,
            mrp: item.mrp ?? item.rate * 2,
            purchasePrice: item.rate,
            sellingPrice: item.mrp ?? item.rate * 2,
            quantity: item.quantity + item.freeQuantity,
            initialQuantity: item.quantity + item.freeQuantity,
            freeQuantity: item.freeQuantity,
            supplierId: data.supplierId,
            purchaseBillId: bill.id,
            createdBy: request.userId!,
            createdAt: now,
            updatedAt: now,
          }).returning();

          await db.insert(inventoryTransactions).values({
            id: generateId(),
            medicineId: item.medicineId,
            batchId: newBatch.id,
            type: INVENTORY_TRANSACTION_TYPES.PURCHASE,
            quantity: item.quantity + item.freeQuantity,
            balanceAfter: item.quantity + item.freeQuantity,
            rate: item.rate,
            reference: data.billNo,
            createdBy: request.userId!,
            createdAt: now,
          });
        }
      }

      if (data.amountPaid > 0) {
        await db.insert(payments).values({
          id: generateId(),
          date: billDate,
          type: "paid",
          amount: data.amountPaid,
          supplierId: data.supplierId,
          reference: data.billNo,
          description: `Payment for purchase bill ${data.billNo}`,
          paymentMode: data.paymentMode,
          createdBy: request.userId!,
          createdAt: now,
        });
      }

      if (data.supplierId) {
        const [supplier] = await db.select().from(suppliers)
          .where(and(eq(suppliers.id, data.supplierId), eq(suppliers.createdBy, request.userId!))).limit(1);
        if (supplier) {
          await db.update(suppliers).set({
            balance: (supplier.balance ?? 0) + (data.grandTotal - data.amountPaid),
            updatedAt: now,
          }).where(and(eq(suppliers.id, data.supplierId), eq(suppliers.createdBy, request.userId!)));
        }
      }

      await db.insert(activityLog).values({
        id: generateId(),
        userId: request.userId!,
        action: "CREATE",
        entity: "purchase_bill",
        entityId: bill.id,
        details: `Purchase bill ${data.billNo} created for ₹${data.grandTotal}`,
        createdAt: now,
      });

      // Task 11: post the purchase to the double-entry ledger (best-effort —
      // a ledger failure is audited and never blocks the bill).
      await postSafely(
        request.userId!,
        {
          date: billDate,
          sourceType: "purchase",
          sourceId: bill.id,
          description: data.billNo,
          lines: purchaseJournalLines({
            grandTotal: data.grandTotal,
            totalGst: data.totalGst,
            paymentMode: data.paymentMode,
            supplierId: data.supplierId,
          }),
        },
        { entity: "purchase_bill", entityId: bill.id }
      );

      return reply.status(201).send({ success: true, data: bill, warnings: evaluation.warnings });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: `Unable to create purchase bill: ${error.message}` });
    }
  });
}
