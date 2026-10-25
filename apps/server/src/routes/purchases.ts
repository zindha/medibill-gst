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
  // The line amount is derived server-side (quantity × rate × markup −
  // discount), so a client-supplied amount is informational only.
  amount: z.number().min(0).optional(),
  // Percentage uplift on the unit rate (e.g. 10 → +10 %).
  markup: z.number().min(0).default(0),
  // Omitted → taken from the medicine master.
  gstRate: z.enum(["0", "5", "12", "18", "28"]).optional(),
  gstAmount: z.number().min(0).default(0),
  cgst: z.number().min(0).default(0),
  sgst: z.number().min(0).default(0),
  discountAmount: z.number().min(0).default(0),
  mrp: z.number().min(0).optional(),
});

const createPurchaseSchema = z.object({
  supplierId: z.string().optional(),
  supplierName: z.string().optional(),
  // The supplier's own invoice number — unique per supplier.
  supplierInvoiceNo: z.string().min(1).max(64).optional(),
  billNo: z.string().min(1),
  billDate: z.string().optional(),
  dueDate: z.string().optional(),
  items: z.array(purchaseItemSchema).min(1),
  // Totals are recomputed server-side from the lines; client values are ignored.
  subtotal: z.number().min(0).optional(),
  totalGst: z.number().min(0).optional(),
  discountAmount: z.number().min(0).default(0),
  grandTotal: z.number().min(0).optional(),
  amountPaid: z.number().min(0).default(0),
  paymentMode: z.enum(["cash", "card", "upi", "credit", "other", "bank_transfer", "cheque"]).optional(),
  // Goods outside the GST regime (exempt / non-GST supply): every line's
  // tax is zeroed and the bill total carries no GST.
  outsideGst: z.boolean().optional().default(false),
  notes: z.string().optional(),
  // Expiry Safety Policy (Task 5): blocked incoming expiry may be overridden
  // by an allowed role with an explicit reason (audited).
  overrideExpiry: z.boolean().optional().default(false),
  overrideReason: z.string().optional(),
});

const settleSchema = z.object({
  amount: z.number().positive(),
  mode: z.enum(["cash", "card", "upi", "credit", "other", "bank_transfer", "cheque"]).optional(),
});

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

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

    // Medicine ownership + master data (HSN, GST rate) in one query.
    const medicineIds = [...new Set(data.items.map((i) => i.medicineId).filter(Boolean))] as string[];
    const masterById = new Map<string, { id: string; hsnCode: string | null; gstRate: string | null }>();
    if (medicineIds.length > 0) {
      const owned = await db.select({ id: medicines.id, hsnCode: medicines.hsnCode, gstRate: medicines.gstRate }).from(medicines)
        .where(and(inArray(medicines.id, medicineIds), eq(medicines.createdBy, request.userId!)));
      if (owned.length !== medicineIds.length) {
        return reply.status(400).send({ success: false, error: "Medicine not found" });
      }
      for (const m of owned) masterById.set(m.id, m);
    }
    if (data.supplierId) {
      const [supplier] = await db.select({ id: suppliers.id }).from(suppliers)
        .where(and(eq(suppliers.id, data.supplierId), eq(suppliers.createdBy, request.userId!))).limit(1);
      if (!supplier) return reply.status(400).send({ success: false, error: "Supplier not found" });
    }

    // A supplier invoice may be booked once per supplier (partial unique index
    // `purchase_bills_supplier_invoice_unique` enforces the same rule).
    if (data.supplierId && data.supplierInvoiceNo) {
      const [duplicate] = await db.select({ id: purchaseBills.id }).from(purchaseBills)
        .where(and(
          eq(purchaseBills.supplierId, data.supplierId),
          eq(purchaseBills.supplierInvoiceNo, data.supplierInvoiceNo),
        ))
        .limit(1);
      if (duplicate) {
        return reply.status(409).send({
          success: false,
          error: `A purchase bill with supplier invoice number ${data.supplierInvoiceNo} already exists for this supplier`,
        });
      }
    }

    // Line math: markup lifts the unit cost, the line discount comes off the
    // line total. HSN / GST rate fall back to the medicine master, and a bill
    // outside the GST regime zeroes every tax amount.
    const outsideGst = data.outsideGst === true;
    const lines = data.items.map((item) => {
      const master = item.medicineId ? masterById.get(item.medicineId) : undefined;
      const markup = item.markup ?? 0;
      const unitCost = round2(item.rate * (1 + markup / 100));
      const lineAmount = Math.max(0, round2(item.quantity * unitCost) - (item.discountAmount ?? 0));
      return {
        ...item,
        hsnCode: item.hsnCode ?? master?.hsnCode ?? null,
        gstRate: outsideGst ? "0" : (item.gstRate ?? master?.gstRate ?? "12"),
        markup,
        unitCost,
        lineAmount,
        gstAmount: outsideGst ? 0 : (item.gstAmount ?? 0),
        cgst: outsideGst ? 0 : (item.cgst ?? 0),
        sgst: outsideGst ? 0 : (item.sgst ?? 0),
      };
    });

    const subtotal = round2(lines.reduce((sum, line) => sum + line.lineAmount, 0));
    const totalGst = round2(lines.reduce((sum, line) => sum + line.gstAmount, 0));
    const grandTotal = round2(Math.max(0, subtotal + totalGst - (data.discountAmount ?? 0)));
    const amountPaid = round2(data.amountPaid);
    if (amountPaid > grandTotal + 0.001) {
      return reply.status(400).send({
        success: false,
        error: `amountPaid cannot be greater than the bill total (${grandTotal})`,
      });
    }
    const paymentStatus = amountPaid >= grandTotal ? "paid" : amountPaid > 0 ? "partial" : "unpaid";

    try {
      const [bill] = await db.insert(purchaseBills).values({
        billNo: data.billNo,
        supplierId: data.supplierId,
        supplierName: data.supplierName,
        supplierInvoiceNo: data.supplierInvoiceNo ?? null,
        outsideGst,
        billDate,
        dueDate: data.dueDate,
        subtotal,
        totalGst,
        discountAmount: data.discountAmount,
        grandTotal,
        amountPaid,
        paymentMode: data.paymentMode,
        paymentStatus,
        notes: data.notes,
        createdBy: request.userId!,
        createdAt: now,
        updatedAt: now,
      }).returning();

      for (const item of lines) {
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
          amount: item.lineAmount,
          markup: item.markup,
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
              rate: item.unitCost,
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
            mrp: item.mrp ?? item.unitCost * 2,
            purchasePrice: item.unitCost,
            sellingPrice: item.mrp ?? item.unitCost * 2,
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
            rate: item.unitCost,
            reference: data.billNo,
            createdBy: request.userId!,
            createdAt: now,
          });
        }
      }

      if (amountPaid > 0) {
        await db.insert(payments).values({
          id: generateId(),
          date: billDate,
          type: "paid",
          amount: amountPaid,
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
            balance: (supplier.balance ?? 0) + (grandTotal - amountPaid),
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
        details: `Purchase bill ${data.billNo} created for ₹${grandTotal}`,
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
            grandTotal,
            totalGst,
            paymentMode: data.paymentMode,
            supplierId: data.supplierId,
          }),
        },
        { entity: "purchase_bill", entityId: bill.id }
      );

      return reply.status(201).send({ success: true, data: bill, warnings: evaluation.warnings });
    } catch (error: any) {
      fastify.log.error(error);
      const message = String(error?.message ?? "");
      // The partial unique index is the race-safe backstop for the duplicate
      // check above.
      if (message.includes("purchase_bills.supplier_invoice_no")) {
        return reply.status(409).send({
          success: false,
          error: `A purchase bill with supplier invoice number ${data.supplierInvoiceNo} already exists for this supplier`,
        });
      }
      if (message.includes("purchase_bills.bill_no")) {
        return reply.status(409).send({
          success: false,
          error: `A purchase bill with bill number ${data.billNo} already exists`,
        });
      }
      return reply.status(500).send({ success: false, error: `Unable to create purchase bill: ${error.message}` });
    }
  });

  // Settle a purchase bill: record a payment against the outstanding amount.
  fastify.post("/:id/settle", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = settleSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });

    const [bill] = await db.select().from(purchaseBills)
      .where(and(eq(purchaseBills.id, id), eq(purchaseBills.createdBy, request.userId!))).limit(1);
    if (!bill) return reply.status(404).send({ success: false, error: "Purchase bill not found" });

    const now = new Date();
    const amount = round2(parsed.data.amount);
    const grandTotal = round2(bill.grandTotal ?? 0);
    const alreadyPaid = round2(bill.amountPaid ?? 0);
    const outstanding = round2(Math.max(0, grandTotal - alreadyPaid));
    if (amount > outstanding + 0.001) {
      return reply.status(400).send({
        success: false,
        error: `Settlement amount exceeds the outstanding balance of ${outstanding}`,
        outstanding,
      });
    }

    const amountPaid = round2(alreadyPaid + amount);
    const paymentStatus = amountPaid >= grandTotal ? "paid" : amountPaid > 0 ? "partial" : "unpaid";
    const [updated] = await db.update(purchaseBills)
      .set({ amountPaid, paymentStatus, updatedAt: now })
      .where(and(eq(purchaseBills.id, id), eq(purchaseBills.createdBy, request.userId!)))
      .returning();

    await db.insert(payments).values({
      id: generateId(),
      date: now.toISOString().split("T")[0],
      type: "paid",
      amount,
      supplierId: bill.supplierId,
      reference: bill.billNo,
      description: `Settlement for purchase bill ${bill.billNo}`,
      paymentMode: parsed.data.mode ?? bill.paymentMode ?? "cash",
      createdBy: request.userId!,
      createdAt: now,
    });

    if (bill.supplierId) {
      const [supplier] = await db.select().from(suppliers)
        .where(and(eq(suppliers.id, bill.supplierId), eq(suppliers.createdBy, request.userId!))).limit(1);
      if (supplier) {
        await db.update(suppliers)
          .set({ balance: Math.max(0, round2((supplier.balance ?? 0) - amount)), updatedAt: now })
          .where(and(eq(suppliers.id, bill.supplierId), eq(suppliers.createdBy, request.userId!)));
      }
    }

    await db.insert(activityLog).values({
      id: generateId(),
      userId: request.userId!,
      action: "UPDATE",
      entity: "purchase_bill",
      entityId: bill.id,
      details: `Purchase bill ${bill.billNo} settled by ₹${amount}`,
      createdAt: now,
    });

    return reply.send({ success: true, data: updated });
  });
}
