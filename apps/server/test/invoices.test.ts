import { beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  applySchema,
  countFor,
  dbPath,
  getBatchQuantity,
  makeApp,
  seedCustomer,
  seedMedicine,
  seedUser,
  type SeededUser,
  type SeededMedicine,
  type SeededCustomer,
} from "./helpers.js";
import { db } from "../src/db/index.js";
import { invoices, payments, customers, inventoryTransactions } from "../src/db/schema/index.js";
import { eq, and } from "drizzle-orm";

let app: FastifyInstance;

const PAYLOAD_ITEM = (med: SeededMedicine) => ({
  medicineId: med.medicineId,
  medicineName: "Test Med",
  quantity: 1,
  unit: "Strip",
  mrp: 100,
  rate: 95.24,
  amount: 95.24,
  gstRate: "5",
  gstAmount: 4.76,
  cgst: 2.38,
  sgst: 2.38,
});

function baseBody(items: unknown[]) {
  return {
    date: "2099-01-01",
    subtotal: items.length * 95.24,
    totalGst: items.length * 4.76,
    cgst: items.length * 2.38,
    sgst: items.length * 2.38,
    grandTotal: items.length * 100,
    amountPaid: items.length * 100,
    paymentMode: "cash",
    status: "paid",
    discount: 0,
    discountAmount: 0,
    items,
  };
}

async function postInvoice(med: SeededMedicine, ctx: SeededUser, qty = 1) {
  const item = PAYLOAD_ITEM(med);
  return app.inject({
    method: "POST",
    url: "/api/invoices",
    headers: { authorization: `Bearer ${ctx.token}` },
    payload: { ...baseBody([item]), items: [{ ...item, quantity: qty }] },
  });
}

async function cancelInvoice(id: string, ctx: SeededUser) {
  return app.inject({
    method: "POST",
    url: `/api/invoices/${id}/cancel`,
    headers: { authorization: `Bearer ${ctx.token}` },
  });
}

async function deleteInvoice(id: string, ctx: SeededUser) {
  return app.inject({
    method: "DELETE",
    url: `/api/invoices/${id}`,
    headers: { authorization: `Bearer ${ctx.token}` },
  });
}

interface CreatedInvoice {
  id: string;
  invoiceNo: string;
  ctx: SeededUser;
  med: SeededMedicine;
  soldQty: number;
  stockBefore: number;
}

beforeAll(async () => {
  applySchema();
  app = await makeApp();
});

describe("invoice creation", () => {
  it("persists the full sale atomically for a cash invoice", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { quantity: 10 });

    const res = await postInvoice(med, ctx);
    expect(res.statusCode).toBe(201);

    const body = res.json();
    expect(body.success).toBe(true);
    const inv = body.data;
    expect(inv.status).toBe("paid");
    // Server recomputes totals from the item rate (GST-exclusive base + GST),
    // and clamps amountPaid to that authoritative total.
    expect(inv.grandTotal).toBeCloseTo(95.24);
    expect(inv.amountPaid).toBeCloseTo(95.24);

    // Invoice row written
    expect(countFor("invoices", ctx.id)).toBe(1);
    // Stock deducted 10 -> 9
    expect(getBatchQuantity(med.batchId)).toBe(9);
  });

  it("rejects when stock is insufficient and leaves NO partial writes", async () => {
    const ctx = seedUser();
    // Only 2 units on the shelf.
    const med = seedMedicine(ctx.id, { quantity: 2 });

    const res = await postInvoice(med, ctx, 5);
    expect(res.statusCode).toBe(409);
    expect(res.json().success).toBe(false);

    // Atomicity: nothing was written — no invoice, no payment, no allocation,
    // no inventory transaction; stock unchanged.
    expect(countFor("invoices", ctx.id)).toBe(0);
    expect(countFor("payments", ctx.id)).toBe(0);
    expect(countFor("invoice_batch_allocations", ctx.id)).toBe(0);
    expect(getBatchQuantity(med.batchId)).toBe(2);
  });

  it("rolls back every write when a mid-transaction step fails", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { quantity: 10 });

    // Force selectBatchesFEFO to succeed on the pre-check but report nothing
    // available inside the transaction, causing an in-transaction throw after
    // the invoice + items have already been inserted.
    const inventory = await import("../src/routes/inventory.js");
    const spy = vi
      .spyOn(inventory, "selectBatchesFEFO")
      .mockImplementationOnce((_medicineId: string, _qty: number) => [
        { batchId: med.batchId, quantity: 10, rate: 100 },
      ])
      .mockImplementationOnce((_medicineId: string, _qty: number) => []);

    const res = await postInvoice(med, ctx, 5);
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
    spy.mockRestore();

    // Atomicity under true failure: all rows rolled back, stock untouched.
    expect(countFor("invoices", ctx.id)).toBe(0);
    expect(countFor("payments", ctx.id)).toBe(0);
    expect(countFor("invoice_batch_allocations", ctx.id)).toBe(0);
    expect(countFor("activity_log", ctx.id)).toBe(0);
    expect(getBatchQuantity(med.batchId)).toBe(10);
  });

  it("sells loose tablets by deducting a fractional pack from stock", async () => {
    const ctx = seedUser();
    // 10 whole strips on the shelf, each strip holds 15 tablets.
    const med = seedMedicine(ctx.id, { quantity: 10, unitsPerPack: 15 });

    // Customer buys 2 tablets instead of a strip -> quantity sent is 2/15 strip.
    const res = await postInvoice(med, ctx, 2 / 15);
    expect(res.statusCode).toBe(201);
    expect(res.json().success).toBe(true);

    // Stock drops by 2/15 of a strip (not by a whole strip).
    expect(getBatchQuantity(med.batchId)).toBeCloseTo(10 - 2 / 15, 6);
    // A single fractional batch allocation was written.
    expect(countFor("invoice_batch_allocations", ctx.id)).toBe(1);
  });
});

describe("invoice reversal (cancel / delete)", () => {
  async function createSoldInvoice(ctx: SeededUser, med: SeededMedicine, qty = 2) {
    const res = await postInvoice(med, ctx, qty);
    expect(res.statusCode).toBe(201);
    const inv = res.json().data;
    expect(getBatchQuantity(med.batchId)).toBe(med.quantity - qty);
    return inv;
  }

  it("cancel restores stock and marks the invoice cancelled (atomic)", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { quantity: 10 });
    const inv = await createSoldInvoice(ctx, med, 3);

    const res = await cancelInvoice(inv.id, ctx);
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    // Stock fully restored: 7 -> 10
    expect(getBatchQuantity(med.batchId)).toBe(10);
    // Invoice marked cancelled (not deleted)
    const rows = countFor("invoices", ctx.id);
    expect(rows).toBe(1);
    const [saved] = db.select().from(invoices).where(eq(invoices.id, inv.id)).all();
    expect(saved.status).toBe("cancelled");
    expect(Number(saved.cancelledAt)).toBeGreaterThan(0);
    // Activity log recorded a CREATE (original) + CANCEL
    expect(countFor("activity_log", ctx.id)).toBe(2);
  });

  it("delete restores stock via the same atomic reversal", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { quantity: 8 });
    const inv = await createSoldInvoice(ctx, med, 2);
    expect(getBatchQuantity(med.batchId)).toBe(6);

    const res = await deleteInvoice(inv.id, ctx);
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    expect(getBatchQuantity(med.batchId)).toBe(8);
    const [saved] = db.select().from(invoices).where(eq(invoices.id, inv.id)).all();
    expect(saved.status).toBe("cancelled");
  });

  it("cancel of an already-cancelled invoice is rejected and changes nothing", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { quantity: 5 });
    const inv = await createSoldInvoice(ctx, med, 1);
    expect(getBatchQuantity(med.batchId)).toBe(4);

    const first = await cancelInvoice(inv.id, ctx);
    expect(first.statusCode).toBe(200);
    expect(getBatchQuantity(med.batchId)).toBe(5);

    // Second cancel: rejected, no additional restock
    const second = await cancelInvoice(inv.id, ctx);
    expect(second.statusCode).toBe(400);
    expect(second.json().success).toBe(false);
    expect(getBatchQuantity(med.batchId)).toBe(5);
    expect(countFor("activity_log", ctx.id)).toBe(2); // CREATE + CANCEL only
  });

  it("cancelling a paid invoice records a matching paid-out refund and resets amountPaid atomically", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { quantity: 10 });
    const cust = seedCustomer(ctx.id);

    // Cash, fully-paid invoice for a known customer.
    const item = PAYLOAD_ITEM(med);
    const pay = app.inject({
      method: "POST",
      url: "/api/invoices",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: {
        ...baseBody([item]),
        customerId: cust.id,
        status: "paid",
      },
    });
    const inv = (await pay).json().data;
    expect(inv.status).toBe("paid");
    // A cash sale writes its receipt at invoice creation.
    expect(countFor("payments", ctx.id)).toBe(1);

    // Cancel the invoice.
    const canc = await cancelInvoice(inv.id, ctx);
    expect(canc.statusCode).toBe(200);

    // Stock restored.
    expect(getBatchQuantity(med.batchId)).toBe(10);

    // The original receipt stays as history (not voided)...
    const linked = db.select().from(payments).where(eq(payments.invoiceId, inv.id)).all();
    const received = linked.filter((p) => p.type === "received");
    const refunds = linked.filter((p) => p.type === "paid");
    expect(received.length).toBe(1);
    expect(received[0].voided).toBe(false);
    expect(received[0].amount).toBeCloseTo(95.24, 2);
    // ...and a matching paid-out refund row balances it in the cash book.
    expect(refunds.length).toBe(1);
    expect(refunds[0].category).toBe("Refund");
    expect(refunds[0].amount).toBeCloseTo(received[0].amount, 2);
    expect(refunds[0].voided).toBe(false);

    // Invoice amountPaid no longer lingers.
    const [saved] = db.select().from(invoices).where(eq(invoices.id, inv.id)).all();
    expect(saved.status).toBe("cancelled");
    expect(saved.amountPaid).toBe(0);
  });

  it("records a matching refund payout and nets the customer balance to zero", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { quantity: 10 });
    const cust = seedCustomer(ctx.id);

    // Unpaid (credit) invoice -> customer owes the full grand total (~95.24).
    const item = PAYLOAD_ITEM(med);
    const pay = await app.inject({
      method: "POST",
      url: "/api/invoices",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: {
        ...baseBody([item]),
        customerId: cust.id,
        status: "unpaid",
        paymentMode: "credit",
        amountPaid: 0,
        grandTotal: 95.24,
      },
    });
    const inv = (pay).json().data;

    // Customer settles a partial ₹50 against it.
    const addPay = await app.inject({
      method: "POST",
      url: "/api/payments",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: { type: "received", amount: 50, invoiceId: inv.id, customerId: cust.id, paymentMode: "cash" },
    });
    expect(addPay.statusCode).toBe(201);

    // Customer owes ₹45.24 after the ₹50 payment.
    const before = db.select({ balance: customers.balance }).from(customers).where(eq(customers.id, cust.id)).all();
    expect(before[0].balance).toBeCloseTo(95.24 - 50, 2);

    const canc = await cancelInvoice(inv.id, ctx);
    expect(canc.statusCode).toBe(200);

    // The ₹50 receipt stays as history; a matching ₹50 refund payout is recorded.
    const linked = db.select().from(payments).where(eq(payments.invoiceId, inv.id)).all();
    const received = linked.filter((p) => p.type === "received");
    const refunds = linked.filter((p) => p.type === "paid");
    expect(received.length).toBe(1);
    expect(received[0].amount).toBeCloseTo(50, 2);
    expect(received[0].voided).toBe(false);
    expect(refunds.length).toBe(1);
    expect(refunds[0].amount).toBeCloseTo(50, 2);
    expect(refunds[0].category).toBe("Refund");

    // Liability and the partial ₹50 both net out => balance 0.
    const after = db.select({ balance: customers.balance }).from(customers).where(eq(customers.id, cust.id)).all();
    expect(after[0].balance).toBeCloseTo(0, 2);
  });

  it("cancel restores every batch when a sale spans multiple FEFO batches", async () => {
    const ctx = seedUser();
    // Three lots of the same medicine: A (10, expiring soonest), B (8), C (5).
    const med = seedMedicine(ctx.id, {
      quantity: 10,
      expiry: "2027-01-01",
      batches: [
        { quantity: 8, expiry: "2027-06-01" },
        { quantity: 5, expiry: "2027-12-01" },
      ],
    });
    const [batchA, batchB, batchC] = med.batchIds;

    // Sell 12 strips: FEFO exhausts A (10), then takes 2 from B; C is untouched.
    const res = await postInvoice(med, ctx, 12);
    expect(res.statusCode).toBe(201);
    expect(getBatchQuantity(batchA)).toBe(0);
    expect(getBatchQuantity(batchB)).toBe(6);
    expect(getBatchQuantity(batchC)).toBe(5);
    // Two batch allocations recorded for the FEFO split.
    expect(countFor("invoice_batch_allocations", ctx.id)).toBe(2);

    const inv = res.json().data;
    const canc = await cancelInvoice(inv.id, ctx);
    expect(canc.statusCode).toBe(200);

    // Every batch is restored to its original quantity, C never touched.
    expect(getBatchQuantity(batchA)).toBe(10);
    expect(getBatchQuantity(batchB)).toBe(8);
    expect(getBatchQuantity(batchC)).toBe(5);
  });

  it("cancel writes one sales_return inventory transaction per restored batch allocation", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, {
      quantity: 10,
      expiry: "2027-01-01",
      batches: [
        { quantity: 8, expiry: "2027-06-01" },
        { quantity: 5, expiry: "2027-12-01" },
      ],
    });
    const [batchA, batchB, batchC] = med.batchIds;

    // Sell 12 strips -> FEFO splits across A (10) and B (2): 2 allocations.
    const res = await postInvoice(med, ctx, 12);
    expect(res.statusCode).toBe(201);
    const inv = res.json().data;
    expect(countFor("invoice_batch_allocations", ctx.id)).toBe(2);

    const canc = await cancelInvoice(inv.id, ctx);
    expect(canc.statusCode).toBe(200);

    // One sales_return transaction per restored allocation, both linked to
    // this invoice, with quantities matching the FEFO split.
    const returns = db
      .select()
      .from(inventoryTransactions)
      .where(
        and(
          eq(inventoryTransactions.invoiceId, inv.id),
          eq(inventoryTransactions.type, "sales_return")
        )
      )
      .all();
    expect(returns.length).toBe(2);

    const byBatch = new Map(returns.map((r) => [r.batchId, r.quantity]));
    expect(byBatch.get(batchA)).toBeCloseTo(10, 6);
    expect(byBatch.get(batchB)).toBeCloseTo(2, 6);
    expect(byBatch.has(batchC)).toBe(false);
  });

  it("rejects cancellation when a refund payout already exists (no double refund)", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { quantity: 10 });
    const cust = seedCustomer(ctx.id);

    const item = PAYLOAD_ITEM(med);
    const pay = await app.inject({
      method: "POST",
      url: "/api/invoices",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: { ...baseBody([item]), customerId: cust.id, status: "paid" },
    });
    const inv = pay.json().data;
    expect(pay.statusCode).toBe(201);
    expect(getBatchQuantity(med.batchId)).toBe(9);

    // Simulate a refund payout that was already issued against this invoice.
    await db.insert(payments).values({
      date: inv.date,
      type: "paid",
      category: "Refund",
      amount: 95.24,
      reference: inv.invoiceNo,
      invoiceId: inv.id,
      customerId: cust.id,
      description: "Refund for cancelled invoice " + inv.invoiceNo,
      paymentMode: "cash",
      createdBy: ctx.id,
    });

    const canc = await cancelInvoice(inv.id, ctx);
    expect(canc.statusCode).toBe(409);
    expect(canc.json().success).toBe(false);
    expect(canc.json().error).toContain("Refund already recorded");

    // Nothing changed: stock stays deducted, invoice stays active, no refund row added.
    expect(getBatchQuantity(med.batchId)).toBe(9);
    const [saved] = db.select().from(invoices).where(eq(invoices.id, inv.id)).all();
    expect(saved.status).toBe("paid");
    const refunds = db
      .select()
      .from(payments)
      .where(and(eq(payments.invoiceId, inv.id), eq(payments.type, "paid")))
      .all();
    expect(refunds.length).toBe(1); // only the pre-existing one
  });
});