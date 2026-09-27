import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { db } from "../db/index.js";
import { payments, customers, suppliers, activityLog, invoices } from "../db/schema/index.js";
import { eq, and, desc, sql } from "drizzle-orm";
import { authGuard } from "../plugins/auth.js";
import { generateId } from "../db/schema/index.js";
import {
  auditSkipped,
  cashOrBankAccount,
  postSafely,
  reverseSafely,
  type JournalLineInput,
} from "../services/accounting.js";

const createPaymentSchema = z.object({
  date: z.string().optional(),
  type: z.enum(["received", "paid", "expense"]),
  category: z.string().optional(),
  amount: z.number().min(0),
  reference: z.string().optional(),
  invoiceId: z.string().optional(),
  customerId: z.string().optional(),
  supplierId: z.string().optional(),
  description: z.string().optional(),
  paymentMode: z.enum(["cash", "card", "upi", "credit", "other", "bank_transfer", "cheque"]).optional(),
});

export default async function paymentRoutes(fastify: FastifyInstance) {
  // List payments
  fastify.get(
    "/",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { type, from, to, invoiceId, page = "1", limit = "50" } = request.query as {
        type?: string;
        from?: string;
        to?: string;
        invoiceId?: string;
        page?: string;
        limit?: string;
      };

      // Return all payments — including voided ones (shown as refunds in the UI).
      const conditions = [];
      if (type) conditions.push(eq(payments.type, type as any));
      if (invoiceId) conditions.push(eq(payments.invoiceId, invoiceId));

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
      const offset = (pageNum - 1) * limitNum;

      const results = await db
        .select()
        .from(payments)
        .where(and(eq(payments.createdBy, request.userId!), ...(conditions.length > 0 ? conditions : [])))
        .orderBy(desc(payments.date))
        .limit(limitNum)
        .offset(offset);

      let filtered = results;
      if (from) filtered = filtered.filter((p) => p.date >= from);
      if (to) filtered = filtered.filter((p) => p.date <= to);

      return reply.send({
        success: true,
        data: filtered,
        pagination: { page: pageNum, limit: limitNum },
      });
    }
  );

  // Create payment
  fastify.post(
    "/",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = createPaymentSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: "Validation error",
          details: parsed.error.flatten(),
        });
      }

      const data = parsed.data;
      const now = new Date();

      if (data.invoiceId && data.type === "received") {
        const [invoice] = await db.select().from(invoices).where(and(eq(invoices.id, data.invoiceId), eq(invoices.createdBy, request.userId!))).limit(1);
        if (!invoice) return reply.status(404).send({ success: false, error: "Invoice not found" });
        if (!data.customerId && invoice.customerId) data.customerId = invoice.customerId;
        if (invoice.status === "cancelled") return reply.status(409).send({ success: false, error: "Cannot pay a cancelled invoice" });
        const outstanding = Math.max(0, invoice.grandTotal - (invoice.amountPaid ?? 0));
        if (data.amount > outstanding) return reply.status(400).send({ success: false, error: `Payment exceeds the outstanding balance of ₹${outstanding.toFixed(2)}` });
      }
      const paymentDate = data.date ?? now.toISOString().split("T")[0];

      try {
        const [payment] = await db
          .insert(payments)
          .values({
            date: paymentDate,
            type: data.type,
            category: data.category,
            amount: data.amount,
            reference: data.reference,
            invoiceId: data.invoiceId,
            customerId: data.customerId,
            supplierId: data.supplierId,
            description: data.description,
            paymentMode: data.paymentMode,
            createdBy: request.userId!,
            createdAt: now,
          })
          .returning();

        if (data.type === "received" && data.invoiceId) {
          const [invoice] = await db.select().from(invoices).where(and(eq(invoices.id, data.invoiceId), eq(invoices.createdBy, request.userId!))).limit(1);
          if (invoice) {
            const amountPaid = Math.min(invoice.grandTotal, (invoice.amountPaid ?? 0) + data.amount);
            await db.update(invoices).set({ amountPaid, status: amountPaid >= invoice.grandTotal ? "paid" : "partial", updatedAt: now }).where(eq(invoices.id, invoice.id));
          }
        }

        // Update customer balance for received payments
        if (data.type === "received" && data.customerId) {
          const customer = await db.query.customers.findFirst({
            where: and(eq(customers.id, data.customerId), eq(customers.createdBy, request.userId!)),
          });
          if (customer) {
            await db
              .update(customers)
              .set({
                balance: Math.max(0, (customer.balance ?? 0) - data.amount),
                updatedAt: now,
              })
              .where(eq(customers.id, data.customerId));
          }
        }

        // Update supplier balance for paid payments
        if (data.type === "paid" && data.supplierId) {
          const supplier = await db.query.suppliers.findFirst({
            where: and(eq(suppliers.id, data.supplierId), eq(suppliers.createdBy, request.userId!)),
          });
          if (supplier) {
            await db
              .update(suppliers)
              .set({
                balance: Math.max(0, (supplier.balance ?? 0) - data.amount),
                updatedAt: now,
              })
              .where(eq(suppliers.id, data.supplierId));
          }
        }

        // Task 11: double-entry posting (best-effort — never blocks the payment).
        // received  → Dr CASH|BANK / Cr AR (only when a customer party resolves)
        // paid      → Dr AP (supplier party) | Dr EXPENSE fallback / Cr CASH|BANK
        // expense   → Dr EXPENSE (memo = category) / Cr CASH|BANK
        // credit mode and party-less receipts are skipped + audited.
        const mode = data.paymentMode ?? "cash";
        const lines: JournalLineInput[] = [];
        if (data.amount > 0) {
          if (mode === "credit") {
            await auditSkipped(request.userId!, "accounting.skipped_credit_mode", {
              entity: "payment",
              entityId: payment.id,
              reason: "Credit-mode payments carry no cash/bank leg",
            });
          } else if (data.type === "received") {
            if (!data.customerId) {
              await auditSkipped(request.userId!, "accounting.skipped_no_party", {
                entity: "payment",
                entityId: payment.id,
                reason: "Received payment has no customer or invoice to settle",
              });
            } else {
              lines.push({ code: cashOrBankAccount(mode), debit: data.amount });
              lines.push({
                code: "AR",
                credit: data.amount,
                partyType: "customer",
                partyId: data.customerId,
              });
            }
          } else if (data.type === "paid" && data.supplierId) {
            lines.push({
              code: "AP",
              debit: data.amount,
              partyType: "supplier",
              partyId: data.supplierId,
            });
            lines.push({ code: cashOrBankAccount(mode), credit: data.amount });
          } else {
            // expense, or a paid row with no supplier — book it as an expense
            lines.push({
              code: "EXPENSE",
              debit: data.amount,
              memo: data.category ?? data.description ?? (data.type === "paid" ? "Payment" : "Expense"),
            });
            lines.push({ code: cashOrBankAccount(mode), credit: data.amount });
          }
        }
        if (lines.length > 0) {
          await postSafely(
            request.userId!,
            {
              date: paymentDate,
              sourceType: "payment",
              sourceId: payment.id,
              description: data.description ?? data.reference,
              lines,
            },
            { entity: "payment", entityId: payment.id }
          );
        }

        await db.insert(activityLog).values({
          id: generateId(),
          userId: request.userId!,
          action: "CREATE",
          entity: "payment",
          entityId: payment.id,
          details: `${data.type} payment of ₹${data.amount}`,
          createdAt: now,
        });

        return reply.status(201).send({
          success: true,
          data: payment,
        });
      } catch (error: any) {
        fastify.log.error(error);
        return reply.status(500).send({
          success: false,
          error: `Unable to record payment: ${error.message}`,
        });
      }
    }
  );

  // Delete payment
  fastify.delete("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [existing] = await db.select().from(payments).where(and(eq(payments.id, id), eq(payments.createdBy, request.userId!))).limit(1);
    if (!existing) return reply.status(404).send({ success: false, error: "Payment not found" });
    if (existing.voided) return reply.status(400).send({ success: false, error: "Payment was already voided when its invoice was cancelled" });

    await db.delete(payments).where(and(eq(payments.id, id), eq(payments.createdBy, request.userId!)));
    if (existing.type === "received" && existing.invoiceId) {        const [invoice] = await db.select().from(invoices).where(and(eq(invoices.id, existing.invoiceId), eq(invoices.createdBy, request.userId!))).limit(1);
      if (invoice) {
        const amountPaid = Math.max(0, (invoice.amountPaid ?? 0) - existing.amount);
        await db.update(invoices).set({ amountPaid, status: amountPaid >= invoice.grandTotal ? "paid" : amountPaid > 0 ? "partial" : invoice.paymentMode === "credit" ? "unpaid" : "paid", updatedAt: new Date() }).where(eq(invoices.id, invoice.id));
      }
    }
    if (existing.type === "received" && existing.customerId) {
      const [customer] = await db.select().from(customers).where(and(eq(customers.id, existing.customerId), eq(customers.createdBy, request.userId!))).limit(1);
      if (customer) await db.update(customers).set({ balance: (customer.balance ?? 0) + existing.amount, updatedAt: new Date() }).where(eq(customers.id, customer.id));
    }

    // Task 11: voiding/deleting a payment reverses its journal entry (no-op
    // when the payment never posted, e.g. receipts written by invoice create).
    await reverseSafely(
      request.userId!,
      {
        sourceType: "payment",
        sourceId: existing.id,
        date: new Date().toISOString().split("T")[0],
        reason: "Payment deleted",
      },
      { entity: "payment", entityId: existing.id }
    );

    return reply.send({ success: true, data: existing });
  });

  // Get totals summary
  fastify.get("/summary", { preHandler: [authGuard] }, async (request, reply) => {
    const all = await db.select().from(payments).where(eq(payments.createdBy, request.userId!)).orderBy(desc(payments.date));
    const active = all.filter(p => !p.voided);

    const received = active.filter(p => p.type === "received").reduce((s, p) => s + p.amount, 0);
    const paid = active.filter(p => p.type === "paid").reduce((s, p) => s + p.amount, 0);
    const expenses = active.filter(p => p.type === "expense").reduce((s, p) => s + p.amount, 0);
    const net = received - paid;

    // Outstanding = sum of unpaid/partial invoices grandTotal - amountPaid
    const invoicesResult = await db.select().from(invoices).where(and(eq(invoices.createdBy, request.userId!), sql`${invoices.status} IN ('unpaid', 'partial')`));
    const outstanding = invoicesResult.reduce((s, inv) => s + Math.max(0, inv.grandTotal - (inv.amountPaid ?? 0)), 0);

    return reply.send({ success: true, data: { received, paid, expenses, net, outstanding } });
  });
}
