import { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  salesReturns,
  salesReturnItems,
  invoices,
  invoiceItems,
  customers,
  batches,
  inventoryTransactions,
  activityLog,
  creditAccounts,
} from "../db/schema/index.js";
import { eq, and, desc } from "drizzle-orm";
import { authGuard } from "../plugins/auth.js";
import { generateId, INVENTORY_TRANSACTION_TYPES } from "../db/schema/index.js";
import { postSafely, salesReturnJournalLines } from "../services/accounting.js";
import { nextDocumentNumber } from "../services/numbering.js";

/**
 * Adds money the store owes the customer onto their running credit balance,
 * creating the credit account row on first use.
 */
async function upsertCustomerCredit(
  customerId: string,
  amount: number,
  date: string,
  userId: string
): Promise<void> {
  if (!(amount > 0)) return;
  const now = new Date();
  const [existing] = await db
    .select()
    .from(creditAccounts)
    .where(and(eq(creditAccounts.customerId, customerId), eq(creditAccounts.type, "customer")))
    .limit(1);

  if (existing) {
    await db
      .update(creditAccounts)
      .set({
        balance: (existing.balance ?? 0) + amount,
        lastTransactionDate: date,
        updatedAt: now,
      })
      .where(eq(creditAccounts.id, existing.id));
    return;
  }

  await db.insert(creditAccounts).values({
    id: generateId(),
    customerId,
    supplierId: null,
    type: "customer",
    balance: amount,
    lastTransactionDate: date,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  });
}

const returnItemSchema = z.object({
  invoiceItemId: z.string().optional(),
  medicineId: z.string().optional(),
  medicineName: z.string(),
  batchId: z.string().optional(),
  batchNo: z.string().optional(),
  hsnCode: z.string().optional(),
  quantity: z.number().int().min(1),
  unit: z.string().optional(),
  rate: z.number().min(0),
  amount: z.number().min(0),
  gstRate: z.enum(["0", "5", "12", "18", "28"]).default("12"),
  gstAmount: z.number().min(0).default(0),
  cgst: z.number().min(0).default(0),
  sgst: z.number().min(0).default(0),
  refundAmount: z.number().min(0).default(0),
  reason: z.string().optional(),
});

const createReturnSchema = z.object({
  invoiceId: z.string(),
  customerId: z.string().optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  reason: z.string().optional(),
  refundMode: z.enum(["cash", "card", "upi", "credit", "other"]).optional(),
  items: z.array(returnItemSchema).min(1),
  subtotal: z.number().min(0),
  totalGst: z.number().min(0),
  cgst: z.number().min(0).default(0),
  sgst: z.number().min(0).default(0),
  igst: z.number().min(0).default(0),
  grandTotal: z.number().min(0),
  refundAmount: z.number().min(0).default(0),
});

export default async function returnsRoutes(fastify: FastifyInstance) {
  // List returns
  fastify.get("/", { preHandler: [authGuard] }, async (request, reply) => {
    const { date, from, to, invoiceId, page = "1", limit = "50" } = request.query as {
      date?: string; from?: string; to?: string; invoiceId?: string; page?: string; limit?: string;
    };

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

    let results = await db
      .select()
      .from(salesReturns)
      .where(eq(salesReturns.createdBy, request.userId!))
      .orderBy(desc(salesReturns.createdAt))
      .limit(200); // fetch enough, filter in memory

    // Apply filters in memory
    if (date) results = results.filter((r) => r.date === date);
    if (invoiceId) results = results.filter((r) => r.invoiceId === invoiceId);
    if (from) results = results.filter((r) => r.date >= from);
    if (to) results = results.filter((r) => r.date <= to);

    const total = results.length;
    const offset = (pageNum - 1) * limitNum;
    const paginated = results.slice(offset, offset + limitNum);

    return reply.send({ success: true, data: paginated, total, page: pageNum, limit: limitNum });
  });

  // Get single return with items
  fastify.get("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [ret] = await db
      .select()
      .from(salesReturns)
      .where(and(eq(salesReturns.id, id), eq(salesReturns.createdBy, request.userId!)))
      .limit(1);

    if (!ret) return reply.status(404).send({ success: false, error: "Return not found" });

    const items = await db
      .select()
      .from(salesReturnItems)
      .where(eq(salesReturnItems.returnId, id));

    return reply.send({ success: true, data: { ...ret, items } });
  });

  // Create sales return
  fastify.post("/", { preHandler: [authGuard] }, async (request, reply) => {
    const data = createReturnSchema.parse(request.body);

    // Verify invoice exists
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, data.invoiceId), eq(invoices.createdBy, request.userId!)))
      .limit(1);

    if (!invoice) {
      return reply.status(404).send({ success: false, error: "Invoice not found" });
    }

    const now = new Date();

    try {
      // Generate return number
      const returnNo = (await nextDocumentNumber("saleReturn")).number;

      // Create return record
      const [ret] = await db
        .insert(salesReturns)
        .values({
          id: generateId(),
          returnNo,
          invoiceId: data.invoiceId,
          customerName: data.customerName,
          date: new Date().toISOString().split("T")[0],
          reason: data.reason,
          subtotal: data.subtotal,
          totalGst: data.totalGst,
          cgst: data.cgst,
          sgst: data.sgst,
          igst: data.igst,
          grandTotal: data.grandTotal,
          refundAmount: data.refundAmount,
          refundMode: data.refundMode,
          status: "completed",
          createdBy: request.userId!,
          createdAt: now,
        })
        .returning();

      // Process each return item
      for (const item of data.items) {
        // Create return item record
        await db.insert(salesReturnItems).values({
          id: generateId(),
          returnId: ret.id,
          medicineId: item.medicineId,
          medicineName: item.medicineName,
          batchId: item.batchId,
          batchNo: item.batchNo,
          hsnCode: item.hsnCode,
          quantity: item.quantity,
          unit: item.unit,
          rate: item.rate,
          amount: item.amount,
          gstRate: item.gstRate as any,
          gstAmount: item.gstAmount,
          cgst: item.cgst,
          sgst: item.sgst,
          refundAmount: item.refundAmount,
          createdAt: now,
        });

        // Restore stock to the original batch. Expiry Safety Policy does NOT
        // apply here: policy blocks SELLING expired stock, so returning stock
        // back into its original (even expired) batch stays allowed.
        if (item.batchId && item.medicineId) {
          const [batch] = await db
            .select()
            .from(batches)
            .where(and(eq(batches.id, item.batchId), eq(batches.createdBy, request.userId!), eq(batches.isActive, true)))
            .limit(1);

          if (batch) {
            const newQty = (batch.quantity ?? 0) + item.quantity;
            await db
              .update(batches)
              .set({ quantity: newQty, updatedAt: now })
              .where(eq(batches.id, item.batchId));

            // Log inventory transaction
            await db.insert(inventoryTransactions).values({
              id: generateId(),
              medicineId: item.medicineId,
              batchId: item.batchId,
              type: INVENTORY_TRANSACTION_TYPES.SALES_RETURN,
              quantity: item.quantity,
              balanceAfter: newQty,
              rate: item.rate,
              reference: returnNo,
              reason: item.reason ?? "Sales return",
              createdBy: request.userId!,
              createdAt: now,
            });
          }
        }
      }

      // A refund is money the store now OWES the customer, so it is tracked as
      // a customer credit (credit_accounts.balance), never added to
      // customers.balance — that column is what the customer owes us, and the
      // journal above already credits accounts receivable for this amount.
      // Adding both places credited the customer twice for one return.
      if (invoice.customerId && data.refundMode === "credit") {
        await upsertCustomerCredit(invoice.customerId, data.refundAmount, ret.date, request.userId!);
      }

      // Log activity
      await db.insert(activityLog).values({
        id: generateId(),
        userId: request.userId!,
        action: "CREATE",
        entity: "sales_return",
        entityId: ret.id,
        details: `Sales return ${returnNo} created for ₹${data.refundAmount}`,
        createdAt: now,
      });

      // Task 11: post the return to the double-entry ledger (best-effort — a
      // ledger failure is audited and never blocks the refund).
      await postSafely(
        request.userId!,
        {
          date: ret.date,
          sourceType: "sales_return",
          sourceId: ret.id,
          description: returnNo,
          lines: salesReturnJournalLines({
            refundAmount: data.refundAmount,
            totalGst: data.totalGst,
            grandTotal: data.grandTotal,
            refundMode: data.refundMode,
            customerId: data.customerId ?? invoice.customerId,
          }),
        },
        { entity: "sales_return", entityId: ret.id }
      );

      const returnItems = await db
        .select()
        .from(salesReturnItems)
        .where(eq(salesReturnItems.returnId, ret.id));

      return reply.status(201).send({ success: true, data: { ...ret, items: returnItems } });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: `Unable to process return: ${error.message}` });
    }
  });
}
