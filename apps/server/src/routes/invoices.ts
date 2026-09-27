import { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  invoices, invoiceItems, invoiceBatchAllocations, customers, inventoryTransactions, batches, activityLog, payments, users,
  medicines, prescriptions, MESSAGE_CHANNELS, type Prescription,
} from "../db/schema/index.js";
import { eq, and, desc, asc, sql, inArray } from "drizzle-orm";
import { authGuard } from "../plugins/auth.js";
import { generateId, INVENTORY_TRANSACTION_TYPES } from "../db/schema/index.js";
import { selectBatchesFEFO, selectBatchesFIFO } from "./inventory.js";
import { getPolicy, getUserRole, evaluateLineItems } from "../services/expiryPolicy.js";
import { scheduleRequiresPrescription } from "../services/prescriptions.js";
import { auditEvents } from "../services/audit.js";
import { queueMessage, readSettingString } from "../services/messaging.js";
import {
  evaluateOffer,
  getLoyaltySettings,
  loyaltyBalance,
  loyaltyEarn,
  loyaltyRedeem,
} from "../services/customerEngagement.js";
import { postSync, reverseSafely, saleJournalLines } from "../services/accounting.js";

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const normalizePaymentMode = (value?: string) => value?.toLowerCase() as "cash" | "card" | "upi" | "credit" | "other" | undefined;

const invoiceItemSchema = z.object({
  medicineId: z.string().optional(),
  medicineName: z.string().min(1),
  batchId: z.string().optional(),
  batchNo: z.string().optional(),
  expiryDate: z.string().optional(),
  hsnCode: z.string().optional(),
  // quantity is in pack units (e.g. strips); allow fractions so loose
  // tablets can be cut from a pack (e.g. 0.13 strip for 2/15 tabs).
  quantity: z.number().positive(),
  unit: z.string().optional(),
  unitsPerPack: z.number().min(0).optional(),
  mrp: z.number().min(0).default(0),
  rate: z.number().min(0),
  amount: z.number().min(0),
  gstRate: z.enum(["0", "5", "12", "18", "28"]).default("12"),
  gstAmount: z.number().min(0).default(0),
  cgst: z.number().min(0).default(0),
  sgst: z.number().min(0).default(0),
  discountAmount: z.number().min(0).default(0),
});

const createInvoiceSchema = z.object({
  customerId: z.string().optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  customerAddress: z.string().optional(),
  customerGstin: z.string().optional(),
  doctorId: z.string().optional(),
  doctorName: z.string().optional(),
  date: z.string().optional(),
  items: z.array(invoiceItemSchema).min(1),
  subtotal: z.number().min(0),
  totalGst: z.number().min(0),
  cgst: z.number().min(0).default(0),
  sgst: z.number().min(0).default(0),
  igst: z.number().min(0).default(0),
  discountAmount: z.number().min(0).default(0),
  grandTotal: z.number().min(0),
  amountPaid: z.number().min(0).default(0),
  paymentMode: z.enum(["cash", "card", "upi", "credit", "other"]).optional(),
  notes: z.string().optional(),
  status: z.enum(["paid", "unpaid", "hold", "cancelled"]).optional().default("paid"),
  // Batch issue order for stock deduction: fefo (default) or fifo.
  batchOrder: z.enum(["fefo", "fifo"]).optional().default("fefo"),
  // Expiry Safety Policy (Task 5): an allowed role may override a blocked
  // expiry result with an explicit reason — recorded as an audit event.
  overrideExpiry: z.boolean().optional().default(false),
  overrideReason: z.string().optional(),
  // Task 6: link this sale to a prescription. Scheduled drugs (H/H1/X) require
  // either a prescriptionId or prescriptionOverride=true from admin/pharmacist.
  prescriptionId: z.string().optional(),
  prescriptionOverride: z.boolean().optional().default(false),
  // Task 10: optional offer discount and loyalty point redemption — both fold
  // into the bill-level discountAmount (see the evaluation block below).
  offerId: z.string().optional(),
  loyaltyRedeemPoints: z.number().int().min(0).optional(),
});

const shareSchema = z.object({
  channels: z.array(z.enum(MESSAGE_CHANNELS)).min(1),
  customerId: z.string().min(1).optional(),
});

async function generateInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `MB-${year}-`;

  const lastInvoice = await db
    .select({ invoiceNo: invoices.invoiceNo })
    .from(invoices)
    .where(sql`${invoices.invoiceNo} LIKE ${prefix + "%"}`)
    .orderBy(desc(invoices.invoiceNo))
    .limit(1);

  let nextNum = 1;
  if (lastInvoice.length > 0) {
    const lastNum = parseInt(lastInvoice[0].invoiceNo.replace(prefix, ""), 10);
    nextNum = lastNum + 1;
  }
  return `${prefix}${String(nextNum).padStart(6, "0")}`;
}

export default async function invoiceRoutes(fastify: FastifyInstance) {
  // List/search invoices
  fastify.get("/", { preHandler: [authGuard] }, async (request, reply) => {
    const { date, from, to, customerId, status, search, page = "1", limit = "50" } = request.query as {
      date?: string; from?: string; to?: string; customerId?: string; status?: string; search?: string; page?: string; limit?: string;
    };

    const conds = [eq(invoices.createdBy, request.userId!)];
    if (date) conds.push(eq(invoices.date, date));
    if (customerId) conds.push(eq(invoices.customerId, customerId));
    if (status) conds.push(eq(invoices.status, status as any));

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    let results = await db.select().from(invoices)
      .where(conds.length > 0 ? and(...conds) : undefined)
      .orderBy(desc(invoices.createdAt))
      .limit(200); // fetch enough for search filtering

    if (from) results = results.filter(i => i.date >= from);
    if (to) results = results.filter(i => i.date <= to);
    if (search) {
      const q = search.toLowerCase();
      results = results.filter(i =>
        (i.invoiceNo?.toLowerCase().includes(q)) ||
        (i.customerName?.toLowerCase().includes(q)) ||
        (i.customerPhone?.includes(q))
      );
    }

    // Enrich with creator username (left join users on createdBy) — non-blocking for parity
    let usernameById: Map<string, string> = new Map();
    try {
      const ids = [...new Set(results.map((r: any) => r.createdBy).filter(Boolean))] as string[];
      if (ids.length) {
        const rows: any[] = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids));
        for (const u of rows) if (u.name) usernameById.set(u.id, u.name);
      }
    } catch { /* users table may not be populated in some test dbs */ }

    const enriched = results.map((r: any) => ({
      ...r,
      username: usernameById.get(r.createdBy) ?? null,
      createdByName: usernameById.get(r.createdBy) ?? null,
    }));

    const total = enriched.length;
    const paginated = enriched.slice(offset, offset + limitNum);

    return reply.send({ success: true, data: paginated, total, pagination: { page: pageNum, limit: limitNum } });
  });

  // Get single invoice
  fastify.get("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [invoice] = await db.select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.createdBy, request.userId!))).limit(1);
    if (!invoice) return reply.status(404).send({ success: false, error: "Invoice not found" });

    const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id));
    return reply.send({ success: true, data: { ...invoice, items } });
  });

  // Get by invoice number. Tenant-scoped: invoice numbers are a globally
  // sequential, guessable series (MB-YYYY-NNNNNN), so without the createdBy
  // filter any authenticated staff member could read another tenant's full
  // invoice + items by number (cross-tenant leak — fixed in Task 18).
  fastify.get("/number/:invoiceNo", { preHandler: [authGuard] }, async (request, reply) => {
    const { invoiceNo } = request.params as { invoiceNo: string };
    const [invoice] = await db.select().from(invoices)
      .where(and(eq(invoices.invoiceNo, invoiceNo), eq(invoices.createdBy, request.userId!)))
      .limit(1);
    if (!invoice) return reply.status(404).send({ success: false, error: "Invoice not found" });

    const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoice.id));
    return reply.send({ success: true, data: { ...invoice, items } });
  });

  // Preview of the number the NEXT create will use (same generator as POST /,
  // install-wide sequence). The stored invoice is always authoritative — this
  // exists so the header preview matches what the server will actually assign
  // instead of guessing from the tenant's own list.
  fastify.get("/next-number", { preHandler: [authGuard] }, async (_request, reply) => {
    return reply.send({ success: true, data: { invoiceNo: await generateInvoiceNumber() } });
  });

  // Create invoice (complete sale)
  fastify.post("/", { preHandler: [authGuard] }, async (request, reply) => {
    const raw = (request.body ?? {}) as Record<string, unknown>;
    const normalized = {
      ...raw,
      paymentMode: normalizePaymentMode(typeof raw.paymentMode === "string" ? raw.paymentMode : undefined),
      discountAmount: raw.discountAmount ?? raw.discount ?? 0,
    };
    const parsed = createInvoiceSchema.safeParse(normalized);
    if (!parsed.success) return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });

    const data = parsed.data;
    const now = new Date();
    const invoiceDate = data.date ?? now.toISOString().split("T")[0];
    const invoiceNo = await generateInvoiceNumber();

    // Recompute totals on the server; client totals are display hints only.
    const calculatedItems = data.items.map((item) => {
      const rate = roundMoney(item.rate);
      const amount = roundMoney(rate * item.quantity);
      const gstRate = Number(item.gstRate);
      const base = roundMoney(amount / (1 + gstRate / 100));
      const gstAmount = roundMoney(amount - base);
      return { ...item, rate, amount, gstAmount, cgst: roundMoney(gstAmount / 2), sgst: roundMoney(gstAmount / 2) };
    });
    const subtotal = roundMoney(calculatedItems.reduce((sum, item) => sum + item.amount - item.gstAmount, 0));
    const totalGst = roundMoney(calculatedItems.reduce((sum, item) => sum + item.gstAmount, 0));
    const cgst = roundMoney(calculatedItems.reduce((sum, item) => sum + item.cgst, 0));
    const sgst = roundMoney(calculatedItems.reduce((sum, item) => sum + item.sgst, 0));
    const baseDiscount = roundMoney(data.discountAmount);

    // ── Task 10: offer + loyalty, folded into the bill discount ─────────────
    // The offer is evaluated against the server's computed subtotal (line
    // amounts net of GST) BEFORE any bill-level discount. An offer that does
    // not apply (inactive / outside its window / below min_amount / missing
    // medicine) fails the sale with a stable 400 carrying the reason.
    const offerMedicineIds = [
      ...new Set(calculatedItems.map((item) => item.medicineId).filter((id): id is string => !!id)),
    ];
    let offerDiscount = 0;
    let loyaltyRedeemPointsUsed = 0;
    let loyaltyValue = 0;
    const loyaltySettings = await getLoyaltySettings(request.userId!);
    if (data.offerId) {
      const offerEvaluation = await evaluateOffer(
        request.userId!,
        data.offerId,
        subtotal,
        offerMedicineIds
      );
      if (!offerEvaluation.applies) {
        return reply
          .status(400)
          .send({ success: false, error: offerEvaluation.reason ?? "Offer does not apply" });
      }
      offerDiscount = offerEvaluation.discount;
    }
    if (data.loyaltyRedeemPoints && data.loyaltyRedeemPoints > 0) {
      if (!data.customerId) {
        return reply
          .status(400)
          .send({ success: false, error: "loyaltyRedeemPoints requires a customer on the bill" });
      }
      // Balance is validated BEFORE the transaction; the negative ledger row is
      // written after commit (documented eventual consistency — see the
      // customerEngagement service header).
      const balance = await loyaltyBalance(request.userId!, data.customerId);
      if (data.loyaltyRedeemPoints > balance) {
        return reply.status(400).send({ success: false, error: "insufficient balance" });
      }
      loyaltyRedeemPointsUsed = data.loyaltyRedeemPoints;
      loyaltyValue = roundMoney(loyaltyRedeemPointsUsed * loyaltySettings.rupeePerPoint);
    }

    const extraDiscount = roundMoney(offerDiscount + loyaltyValue);
    // When an offer/loyalty discount is present the combined discount is
    // clamped to the bill (subtotal + GST). Without one the client-supplied
    // discount passes through untouched so legacy totals stay identical.
    const maxDiscount = roundMoney(subtotal + totalGst);
    const discountAmount =
      extraDiscount > 0 ? roundMoney(Math.min(baseDiscount + extraDiscount, maxDiscount)) : baseDiscount;
    const grandTotal = roundMoney(Math.max(0, subtotal + totalGst - discountAmount));
    // The client sends amountPaid equal to its own grandTotal, which can differ
    // from the server's recomputed total by a paisa due to rounding. Clamp to
    // the authoritative total instead of rejecting a legitimate sale.
    const amountPaid = roundMoney(Math.min(data.amountPaid, grandTotal));

    const selectBatches = data.batchOrder === "fifo" ? selectBatchesFIFO : selectBatchesFEFO;
    const stockRequirements = new Map<string, number>();
    for (const item of calculatedItems) {
      if (item.medicineId) stockRequirements.set(item.medicineId, (stockRequirements.get(item.medicineId) ?? 0) + item.quantity);
    }
    const preSelections = new Map<string, { batchId: string; quantity: number; rate: number }[]>();
    for (const [medicineId, quantity] of stockRequirements) {
      const selections = await selectBatches(medicineId, quantity, request.userId!);
      preSelections.set(medicineId, selections);
      const available = selections.reduce((sum, selection) => sum + selection.quantity, 0);
      if (available < quantity) return reply.status(409).send({ success: false, error: `Insufficient stock for ${calculatedItems.find((item) => item.medicineId === medicineId)?.medicineName ?? "medicine"}` });
    }

    // Expiry Safety Policy (Task 5): evaluate every expiry this sale touches —
    // the stock batches FEFO/FIFO will deduct from plus any expiry the client
    // declared on a line — before anything is written. Blocked rows return a
    // stable 400 payload for the frontend unless an allowed role sends
    // overrideExpiry + overrideReason (recorded as an audit event).
    const policy = await getPolicy(request.userId!);
    const callerRole = await getUserRole(request.userId!);
    const expiryLines: { expiryDate?: string; batchNo?: string }[] = [];
    for (const selections of preSelections.values()) {
      for (const sel of selections) {
        const [batch] = await db.select().from(batches)
          .where(and(eq(batches.id, sel.batchId), eq(batches.createdBy, request.userId!))).limit(1);
        if (batch) expiryLines.push({ batchNo: batch.batchNo, expiryDate: batch.expiryDate });
      }
    }
    for (const item of calculatedItems) {
      if (item.expiryDate) expiryLines.push({ batchNo: item.batchNo, expiryDate: item.expiryDate });
    }
    const evaluation = await evaluateLineItems(request.userId!, expiryLines, "sale", callerRole, policy);
    if (!evaluation.ok) {
      const roleAllowed = policy.allowOverrideRoles.includes(callerRole);
      const overrideReason = data.overrideReason?.trim();
      if (data.overrideExpiry && roleAllowed && overrideReason) {
        await auditEvents.record({
          actorId: request.userId!,
          action: "invoice.expiry_override",
          entity: "invoice",
          metadata: {
            invoiceNo,
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

    // Prescription enforcement (Task 6): line items whose medicine carries a
    // scheduled-drug flag (H/H1/X) need a linked prescription. Admins and
    // pharmacists may explicitly override with prescriptionOverride=true
    // (audited as "invoice.prescription_override"); any other role is refused.
    const medicineIds = [...new Set(
      calculatedItems.map((item) => item.medicineId).filter((id): id is string => !!id)
    )];
    const scheduleById = new Map<string, string | null>();
    if (medicineIds.length > 0) {
      const medRows = await db
        .select({ id: medicines.id, schedule: medicines.schedule })
        .from(medicines)
        .where(and(inArray(medicines.id, medicineIds), eq(medicines.createdBy, request.userId!)));
      for (const m of medRows) scheduleById.set(m.id, m.schedule);
    }
    const scheduledItems = calculatedItems.filter((item) =>
      item.medicineId !== undefined && item.medicineId !== null &&
      scheduleRequiresPrescription(scheduleById.get(item.medicineId))
    );
    const overridePrescription =
      data.prescriptionOverride && (callerRole === "admin" || callerRole === "pharmacist");
    if (scheduledItems.length > 0 && !data.prescriptionId && !overridePrescription) {
      return reply.status(400).send({
        success: false,
        error: "Prescription required for scheduled drugs (H/H1/X)",
        items: scheduledItems.map((item) => item.medicineName),
      });
    }

    // Optional prescription link: must belong to this tenant and still be
    // billable (pending/verified — dispensed/rejected cannot be reused).
    let linkedPrescription: Prescription | null = null;
    if (data.prescriptionId) {
      const [rx] = await db
        .select()
        .from(prescriptions)
        .where(and(eq(prescriptions.id, data.prescriptionId), eq(prescriptions.createdBy, request.userId!)))
        .limit(1);
      if (!rx || (rx.status !== "pending" && rx.status !== "verified")) {
        return reply.status(400).send({ success: false, error: "Prescription not verifiable or foreign" });
      }
      linkedPrescription = rx;
    }

    // The transaction body must be synchronous: better-sqlite3's
    // db.transaction() rejects a callback that returns a promise. Drizzle's
    // better-sqlite3 query builders execute inline via .all()/.get()/.run().
    // Task 11: a ledger failure must never block the sale — capture it here
    // and audit after the transaction commits.
    let accountingFailure: unknown = null;
    try {
      const invoice = db.transaction((tx) => {
        const [createdInvoice] = tx.insert(invoices).values({
          invoiceNo,
          customerId: data.customerId,
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          customerAddress: data.customerAddress,
          customerGstin: data.customerGstin,
          doctorId: data.doctorId,
          doctorName: data.doctorName,
          date: invoiceDate,
          subtotal,
          totalGst,
          cgst,
          sgst,
          igst: roundMoney(data.igst),
          discountAmount,
          grandTotal,
          amountPaid,
          paymentMode: data.paymentMode,
          status: amountPaid >= grandTotal ? "paid" : amountPaid > 0 ? "partial" : "unpaid",
          prescriptionId: linkedPrescription?.id,
          prescriptionStatus: linkedPrescription?.status,
          notes: data.notes,
          createdBy: request.userId!,
          createdAt: now,
          updatedAt: now,
        }).returning().all();

        const invoiceId = createdInvoice.id;

        // Create items and deduct stock
        for (const item of calculatedItems) {
          const invoiceItemId = generateId();
          tx.insert(invoiceItems).values({
            id: invoiceItemId,
            invoiceId,
            medicineId: item.medicineId,
            medicineName: item.medicineName,
            batchId: item.batchId,
            batchNo: item.batchNo,
            expiryDate: item.expiryDate,
            hsnCode: item.hsnCode,
            quantity: item.quantity,
            unit: item.unit,
            unitsPerPack: item.unitsPerPack ?? 1,
            mrp: item.mrp ?? 0,
            rate: item.rate,
            amount: item.amount,
            gstRate: item.gstRate as any,
            gstAmount: item.gstAmount,
            cgst: item.cgst,
            sgst: item.sgst,
            discountAmount: item.discountAmount,
            createdAt: now,
          }).run();

          // Deduct stock in the requested batch order (fefo default)
          if (item.medicineId) {
            const selections = selectBatches(item.medicineId, item.quantity, request.userId!);
            if (selections.reduce((sum, selection) => sum + selection.quantity, 0) < item.quantity) {
              throw new Error(`Insufficient stock for ${item.medicineName}`);
            }
            for (const sel of selections) {
              const [batch] = tx
                .select()
                .from(batches)
                .where(and(eq(batches.id, sel.batchId), eq(batches.createdBy, request.userId!)))
                .limit(1)
                .all();
              if (!batch) continue;

              const newQty = (batch.quantity ?? 0) - sel.quantity;
              tx.update(batches)
                .set({ quantity: newQty, updatedAt: now })
                .where(eq(batches.id, sel.batchId))
                .run();

              tx.insert(invoiceBatchAllocations).values({
                id: generateId(),
                invoiceId,
                invoiceItemId,
                medicineId: item.medicineId,
                batchId: sel.batchId,
                quantity: sel.quantity,
                rate: sel.rate,
                createdBy: request.userId!,
                createdAt: now,
              }).run();

              tx.insert(inventoryTransactions).values({
                medicineId: item.medicineId,
                batchId: sel.batchId,
                type: INVENTORY_TRANSACTION_TYPES.SALES,
                quantity: -sel.quantity,
                balanceAfter: newQty,
                rate: item.rate,
                invoiceId,
                reference: invoiceNo,
                createdBy: request.userId!,
                createdAt: now,
              }).run();
            }
          }
        }

        // Record payment. NOTE (Fix 3 — double-post guard): this receipt row
        // is written directly inside the sale transaction and never passes
        // through POST /api/payments, so it is deliberately NOT journal-posted
        // (`sourceType = "payment"` entries only ever come from the payments
        // route). The sale entry above already carries the cash leg split by
        // amountPaid — posting this row too would double-count cash.
        if (data.amountPaid > 0) {
          tx.insert(payments).values({
            id: generateId(),
            date: invoiceDate,
            type: "received",
            amount: amountPaid,
            invoiceId,
            customerId: data.customerId,
            reference: invoiceNo,
            description: `Payment for invoice ${invoiceNo}`,
            paymentMode: data.paymentMode,
            createdBy: request.userId!,
            createdAt: now,
          }).run();
        }

        // Update customer balance
        if (data.customerId) {
          const [customer] = tx
            .select()
            .from(customers)
            .where(and(eq(customers.id, data.customerId), eq(customers.createdBy, request.userId!)))
            .limit(1)
            .all();
          if (customer) {
            const balanceDue = grandTotal - amountPaid;
            tx.update(customers)
              .set({
                balance: (customer.balance ?? 0) + balanceDue,
                totalPurchases: (customer.totalPurchases ?? 0) + grandTotal,
                lastPurchaseDate: invoiceDate,
                updatedAt: now,
              })
              .where(and(eq(customers.id, data.customerId), eq(customers.createdBy, request.userId!)))
              .run();
          }
        }

        tx.insert(activityLog).values({
          id: generateId(),
          userId: request.userId!,
          action: "CREATE",
          entity: "invoice",
          entityId: invoiceId,
          details: `Invoice ${invoiceNo} created for ₹${grandTotal}`,
          createdAt: now,
        }).run();

        // Task 11: post the sale to the double-entry ledger inside the SAME
        // transaction so the ledger can never drift from the books. Validation
        // failures (unbalanced/closed period/unknown code) are caught here so
        // the sale still commits; the gap is audited post-commit below.
        try {
          postSync(tx, request.userId!, {
            date: invoiceDate,
            sourceType: "invoice",
            sourceId: invoiceId,
            description: invoiceNo,
            lines: saleJournalLines({
              invoiceId,
              invoiceNo,
              grandTotal,
              totalGst,
              paymentMode: data.paymentMode,
              customerId: data.customerId,
              amountPaid,
            }),
          });
        } catch (err) {
          accountingFailure = err;
        }

        return createdInvoice;
      });

      if (accountingFailure) {
        fastify.log.error(accountingFailure as Error);
        await auditEvents.record({
          actorId: request.userId!,
          action: "accounting.post_failed",
          entity: "invoice",
          entityId: invoice.id,
          metadata: {
            invoiceNo,
            error:
              accountingFailure instanceof Error ? accountingFailure.message : String(accountingFailure),
          },
        });
      }

      if (linkedPrescription) {
        await auditEvents.record({
          actorId: request.userId!,
          action: "invoice.link_prescription",
          entity: "invoice",
          entityId: invoice.id,
          metadata: {
            invoiceNo,
            prescriptionId: linkedPrescription.id,
            prescriptionStatus: linkedPrescription.status,
          },
        });
      }
      if (scheduledItems.length > 0 && overridePrescription && !data.prescriptionId) {
        await auditEvents.record({
          actorId: request.userId!,
          action: "invoice.prescription_override",
          entity: "invoice",
          entityId: invoice.id,
          metadata: {
            invoiceNo,
            role: callerRole,
            items: scheduledItems.map((item) => item.medicineName),
          },
        });
      }

      // Task 10 — offer audit + loyalty ledger writes run POST-COMMIT. The
      // sale is already durable; a ledger failure is logged + audited
      // (`loyalty.post_failed`) and never rolls it back. Idempotency keys
      // `redeem:<invoiceId>` / `sale:<invoiceId>` make retries safe.
      if (data.offerId) {
        await auditEvents.record({
          actorId: request.userId!,
          action: "invoice.offer_applied",
          entity: "invoice",
          entityId: invoice.id,
          metadata: { invoiceNo, offerId: data.offerId, discount: offerDiscount },
        });
      }
      if (loyaltyRedeemPointsUsed > 0 && data.customerId) {
        try {
          await loyaltyRedeem(request.userId!, data.customerId, {
            points: loyaltyRedeemPointsUsed,
            reason: `Redeemed on invoice ${invoiceNo}`,
            invoiceId: invoice.id,
            idempotencyKey: `redeem:${invoice.id}`,
          });
        } catch (err) {
          fastify.log.error(err);
          await auditEvents.record({
            actorId: request.userId!,
            action: "loyalty.post_failed",
            entity: "invoice",
            entityId: invoice.id,
            metadata: { invoiceNo, op: "redeem", error: err instanceof Error ? err.message : String(err) },
          });
        }
      }
      if (loyaltySettings.enabled && data.customerId) {
        const earned = Math.round((Number(grandTotal) / 100) * loyaltySettings.pointsPer100Rupee);
        if (earned > 0) {
          try {
            await loyaltyEarn(request.userId!, data.customerId, {
              points: earned,
              reason: `Earned on invoice ${invoiceNo}`,
              invoiceId: invoice.id,
              idempotencyKey: `sale:${invoice.id}`,
            });
          } catch (err) {
            fastify.log.error(err);
            await auditEvents.record({
              actorId: request.userId!,
              action: "loyalty.post_failed",
              entity: "invoice",
              entityId: invoice.id,
              metadata: { invoiceNo, op: "earn", error: err instanceof Error ? err.message : String(err) },
            });
          }
        }
      }

      return reply.status(201).send({ success: true, data: invoice, warnings: evaluation.warnings });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: `Unable to complete this sale: ${error.message}` });
    }
  });

    // Shared synchronous reversal for both cancel and delete. Runs inside a
  // better-sqlite3 transaction so stock restore + balance + status all commit
  // (or roll back) together.
  const reverseInvoice = (
    invoice: typeof invoices.$inferSelect,
    userId: string,
    action: "CANCEL" | "DELETE",
    reason: string,
  ) => {
    const now = new Date();
    db.transaction((tx) => {
      const allocations = tx
        .select()
        .from(invoiceBatchAllocations)
        .where(
          and(
            eq(invoiceBatchAllocations.invoiceId, invoice.id),
            eq(invoiceBatchAllocations.createdBy, userId)
          )
        )
        .all();

      for (const allocation of allocations) {
        const [batch] = tx
          .select()
          .from(batches)
          .where(
            and(eq(batches.id, allocation.batchId), eq(batches.createdBy, userId))
          )
          .limit(1)
          .all();
        if (!batch) continue;

        const newQty = (batch.quantity ?? 0) + allocation.quantity;
        tx.update(batches)
          .set({ quantity: newQty, updatedAt: now })
          .where(and(eq(batches.id, allocation.batchId), eq(batches.createdBy, userId)))
          .run();

        tx.insert(inventoryTransactions)
          .values({
            id: generateId(),
            medicineId: allocation.medicineId,
            batchId: allocation.batchId,
            type: INVENTORY_TRANSACTION_TYPES.SALES_RETURN,
            quantity: allocation.quantity,
            balanceAfter: newQty,
            rate: allocation.rate,
            invoiceId: invoice.id,
            reference: invoice.invoiceNo,
            reason,
            createdBy: userId,
            createdAt: now,
          })
          .run();
      }

      // The original received payments stay as history; record a matching
      // paid-out refund row so the cash book explicitly nets to zero.
      // Fix 3: this refund row is deliberately NOT journal-posted — its cash
      // effect is already modeled by reversing the sale entry (cash leg) and
      // every posted settlement entry, so the journal nets to zero on its own
      // while the payments table shows the matching payout.
      const received = collectReceivedPayments(tx, invoice.id, userId);
      const refundTotal = received.sumReceived;
      if (refundTotal > 0) {
        tx.insert(payments)
          .values({
            id: generateId(),
            date: invoice.date,
            type: "paid",
            category: "Refund",
            amount: refundTotal,
            reference: invoice.invoiceNo,
            invoiceId: invoice.id,
            customerId: invoice.customerId,
            description: `Refund for cancelled invoice ${invoice.invoiceNo}`,
            paymentMode: invoice.paymentMode ?? "cash",
            createdBy: userId,
            createdAt: now,
          })
          .run();
      }

      if (invoice.customerId) {
        const [customer] = tx
          .select()
          .from(customers)
          .where(and(eq(customers.id, invoice.customerId), eq(customers.createdBy, userId)))
          .limit(1)
          .all();
        if (customer) {
          tx.update(customers)
            .set({
              // Remove the invoice's liability, then give back the money that
              // had been received against it (matched by the refund payout).
              balance: Math.max(0, (customer.balance ?? 0) - invoice.grandTotal + refundTotal),
              updatedAt: now,
            })
            .where(and(eq(customers.id, invoice.customerId), eq(customers.createdBy, userId)))
            .run();
        }
      }

      tx.update(invoices)
        .set({ status: "cancelled", amountPaid: 0, cancelledAt: now, cancelledBy: userId, updatedAt: now })
        .where(and(eq(invoices.id, invoice.id), eq(invoices.createdBy, userId)))
        .run();

      tx.insert(activityLog)
        .values({
          id: generateId(),
          userId,
          action,
          entity: "invoice",
          entityId: invoice.id,
          details: `Invoice ${invoice.invoiceNo} ${action.toLowerCase()}`,
          createdAt: now,
        })
        .run();
    });
  };

  // Never refund the same invoice twice: if a paid-out refund already exists
  // against it, refuse to reverse again.
  const hasRefundPayout = (invoiceId: string, userId: string): boolean => {
    const rows = db
      .select({ id: payments.id })
      .from(payments)
      .where(
        and(
          eq(payments.invoiceId, invoiceId),
          eq(payments.createdBy, userId),
          eq(payments.type, "paid"),
          eq(payments.voided, false)
        )
      )
      .limit(1)
      .all();
    return rows.length > 0;
  };

  /**
   * Fix 3 — cancel/delete must reverse EVERY journal entry tied to this
   * invoice, not just the sale entry: settlements recorded through
   * POST /api/payments post `sourceType = "payment"` entries (Dr CASH/BANK /
   * Cr AR) that would otherwise keep AR/CASH permanently open after the
   * invoice is gone. Each payment row of this invoice is offered to
   * `reverseSafely`:
   * - invoice-created receipt rows and the refund payout row written by
   *   `reverseInvoice` are never journal-posted → `found: false` no-op;
   * - an already-reversed settlement stays reversed (reverse is idempotent).
   * Every actual reversal is audited with `{ invoiceNo, kind: "settlement" }`.
   */
  const reverseSettlements = async (
    invoice: typeof invoices.$inferSelect,
    userId: string,
    reason: string
  ): Promise<void> => {
    const rows = db
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.invoiceId, invoice.id), eq(payments.createdBy, userId)))
      .all();
    const today = new Date().toISOString().split("T")[0];
    for (const row of rows) {
      const result = await reverseSafely(
        userId,
        { sourceType: "payment", sourceId: row.id, date: today, reason },
        { entity: "payment", entityId: row.id }
      );
      if (result?.found) {
        await auditEvents.record({
          actorId: userId,
          action: "accounting.reversed",
          entity: "payment",
          entityId: row.id,
          metadata: {
            invoiceNo: invoice.invoiceNo,
            kind: "settlement",
            alreadyReversed: result.alreadyReversed,
          },
        });
      }
    }
  };

  // Cancel invoice
  fastify.post("/:id/cancel", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [invoice] = await db.select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.createdBy, request.userId!))).limit(1);
    if (!invoice) return reply.status(404).send({ success: false, error: "Invoice not found" });
    if (invoice.status === "cancelled") return reply.status(400).send({ success: false, error: "Invoice already cancelled" });
    if (hasRefundPayout(id, request.userId!)) return reply.status(409).send({ success: false, error: "Refund already recorded for this invoice" });

    try {
      reverseInvoice(invoice, request.userId!, "CANCEL", "Invoice cancelled");
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: `Unable to cancel invoice: ${error.message}` });
    }

    // Task 11 / Fix 3: mirror the ledger — settlements FIRST (each payment
    // row of this invoice that posted a `payment` entry), then the sale entry
    // itself. Both are idempotent no-ops when nothing was posted. Best-effort:
    // a ledger failure never blocks the cancellation.
    await reverseSettlements(invoice, request.userId!, "Invoice cancelled");
    const saleReversal = await reverseSafely(
      request.userId!,
      {
        sourceType: "invoice",
        sourceId: invoice.id,
        date: new Date().toISOString().split("T")[0],
        reason: "Invoice cancelled",
      },
      { entity: "invoice", entityId: invoice.id }
    );
    if (saleReversal?.found) {
      await auditEvents.record({
        actorId: request.userId!,
        action: "accounting.reversed",
        entity: "invoice",
        entityId: invoice.id,
        metadata: {
          invoiceNo: invoice.invoiceNo,
          kind: "invoice",
          alreadyReversed: saleReversal.alreadyReversed,
        },
      });
    }

    return reply.send({ success: true, data: { message: "Invoice cancelled successfully" } });
  });

  /**
   * Sum the received payments still active against an invoice, so the caller
   * can record a matching paid-out refund. Read-only — the receipts remain
   * as history and the refund row balances them in the cash book.
   */
  const collectReceivedPayments = (
    tx: any,
    invoiceId: string,
    userId: string
  ): { sumReceived: number; count: number } => {
    const linked = tx
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.invoiceId, invoiceId),
          eq(payments.createdBy, userId),
          eq(payments.type, "received"),
          eq(payments.voided, false)
        )
      )
      .all() as Array<{ amount: number }>;

    return {
      sumReceived: linked.reduce((sum, p) => sum + (p.amount ?? 0), 0),
      count: linked.length,
    };
  };

  // Hold invoice
  fastify.post("/:id/hold", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [invoice] = await db.select({ id: invoices.id }).from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.createdBy, request.userId!))).limit(1);
    if (!invoice) return reply.status(404).send({ success: false, error: "Invoice not found" });
    await db.update(invoices).set({ hold: true, updatedAt: new Date() }).where(and(eq(invoices.id, id), eq(invoices.createdBy, request.userId!)));
    return reply.send({ success: true, data: { message: "Invoice put on hold" } });
  });

  // Recall invoice
  fastify.post("/:id/recall", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [invoice] = await db.select({ id: invoices.id }).from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.createdBy, request.userId!))).limit(1);
    if (!invoice) return reply.status(404).send({ success: false, error: "Invoice not found" });
    await db.update(invoices).set({ hold: false, updatedAt: new Date() }).where(and(eq(invoices.id, id), eq(invoices.createdBy, request.userId!)));
    return reply.send({ success: true, data: { message: "Invoice recalled" } });
  });

  // Share invoice over WhatsApp / SMS / email — queues one delivery per channel.
  fastify.post("/:id/share", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = shareSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    const { id } = request.params as { id: string };
    const [invoice] = await db.select().from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.createdBy, request.userId!))).limit(1);
    if (!invoice) return reply.status(404).send({ success: false, error: "Invoice not found" });

    const customerId = parsed.data.customerId ?? invoice.customerId ?? undefined;
    const storeName = (await readSettingString("store_name")) ?? "";
    const appBaseUrl = ((await readSettingString("app_base_url")) || "http://localhost:5173").replace(/\/+$/, "");
    const amount = Number(invoice.grandTotal ?? 0).toFixed(2);
    const variables = {
      customerName: invoice.customerName || "there",
      invoiceNo: invoice.invoiceNo,
      amount,
      storeName,
      invoiceUrl: `${appBaseUrl}/dashboard/invoices/${invoice.id}`,
    };

    // Resolve a destination per channel: phone for whatsapp/sms, email for email.
    let customer: { phone: string | null; email: string | null } | null = null;
    if (customerId) {
      const rows = await db.select({ phone: customers.phone, email: customers.email })
        .from(customers)
        .where(and(eq(customers.id, customerId), eq(customers.createdBy, request.userId!))).limit(1);
      customer = rows[0] ?? null;
      if (!customer) return reply.status(404).send({ success: false, error: "Customer not found" });
    }

    const deliveries: any[] = [];
    const skipped: Array<{ channel: string; reason: string }> = [];
    for (const channel of parsed.data.channels) {
      const recipient =
        channel === "email"
          ? (customer?.email ?? "").trim()
          : (customer?.phone ?? "").trim() || (invoice.customerPhone ?? "").trim();
      if (!recipient) {
        skipped.push({ channel, reason: channel === "email" ? "No email address" : "No phone number" });
        continue;
      }
      const result = await queueMessage(request.userId!, {
        channel,
        recipient,
        customerId,
        template: "invoice_share",
        variables,
        aggregateType: "invoice",
        aggregateId: invoice.id,
      });
      deliveries.push(result.delivery);
    }

    await auditEvents.record({
      actorId: request.userId!,
      action: "invoice.shared",
      entity: "invoice",
      entityId: invoice.id,
      metadata: { channels: parsed.data.channels, queued: deliveries.length },
    });

    if (deliveries.length === 0) {
      return reply.status(400).send({
        success: false,
        error: "No destination available for the selected channels",
        details: skipped,
      });
    }
    return reply.send({ success: true, data: { deliveries, skipped } });
  });

  // Delete (cancel) invoice
  fastify.delete("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [invoice] = await db.select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.createdBy, request.userId!))).limit(1);
    if (!invoice) return reply.status(404).send({ success: false, error: "Invoice not found" });
    if (invoice.status === "cancelled") return reply.status(400).send({ success: false, error: "Invoice already cancelled" });
    if (hasRefundPayout(id, request.userId!)) return reply.status(409).send({ success: false, error: "Refund already recorded for this invoice" });

    try {
      reverseInvoice(invoice, request.userId!, "DELETE", "Invoice deleted");
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: `Unable to delete invoice: ${error.message}` });
    }

    // Task 11 / Fix 3: mirror the sale's journal entry (deletes cancel, never
    // erase) — settlements first, then the sale entry (see reverseSettlements).
    await reverseSettlements(invoice, request.userId!, "Invoice deleted");
    const deleteReversal = await reverseSafely(
      request.userId!,
      {
        sourceType: "invoice",
        sourceId: invoice.id,
        date: new Date().toISOString().split("T")[0],
        reason: "Invoice deleted",
      },
      { entity: "invoice", entityId: invoice.id }
    );
    if (deleteReversal?.found) {
      await auditEvents.record({
        actorId: request.userId!,
        action: "accounting.reversed",
        entity: "invoice",
        entityId: invoice.id,
        metadata: {
          invoiceNo: invoice.invoiceNo,
          kind: "invoice",
          alreadyReversed: deleteReversal.alreadyReversed,
        },
      });
    }

    return reply.send({ success: true, data: { message: "Invoice deleted" } });
  });
}
