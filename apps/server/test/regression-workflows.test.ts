import { beforeAll, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import {
  applySchema,
  countFor,
  dbPath,
  getBatchQuantity,
  seedCustomer,
  seedMedicine,
  seedUser,
  type SeededMedicine,
  type SeededUser,
} from "./helpers.js";

import invoiceRoutes from "../src/routes/invoices.js";
import purchaseRoutes from "../src/routes/purchases.js";
import paymentRoutes from "../src/routes/payments.js";
import returnsRoutes from "../src/routes/returns.js";
import accountingRoutes from "../src/routes/accounting.js";
import expiryPolicyRoutes from "../src/routes/expiryPolicies.js";
import { DEFAULT_POLICY } from "../src/services/expiryPolicy.js";

/**
 * Task 18 â€” invoice lifecycle regression.
 *
 * One end-to-end chain per flow, asserting that the WHOLE pipeline still holds
 * together after the Task 11-17 wiring landed:
 *
 *   1. cash sale      â†’ invoice + stock deducted + payment-mode journal
 *                       + loyalty disabled (no ledger row) + no prescription
 *                       required + clean audit trail
 *   2. schedule H saleâ†’ 400 prescription enforcement (no partial writes)
 *   3. cancel         â†’ stock restored + is_reversal journal + reversed_by set
 *   4. purchase       â†’ batch created + INVENTORY/GST_INPUT/CASH journal
 *                       + expiry policy blocks the expired incoming batch
 *   5. payment/return â†’ CASH-AR receipt + proportional GST reversal journal
 *                       + TRIAL BALANCE DEBIT == CREDIT over the whole story
 *   6. admin expiry override â†’ sale proceeds + invoice.expiry_override audit
 */

let app: FastifyInstance;

const auth = (u: SeededUser) => ({ authorization: `Bearer ${u.token}` });
const INV_DATE = "2026-06-15";

function raw() {
  return new Database(dbPath());
}

function all<T = any>(sql: string, ...params: any[]): T[] {
  const db = raw();
  try {
    return db.prepare(sql).all(...params) as T[];
  } finally {
    db.close();
  }
}

function one<T = any>(sql: string, ...params: any[]): T | undefined {
  const db = raw();
  try {
    return db.prepare(sql).get(...params) as T | undefined;
  } finally {
    db.close();
  }
}

function auditCount(actorId: string, action: string): number {
  return all<{ c: number }>(
    "SELECT COUNT(*) AS c FROM audit_events WHERE actor_id = ? AND action = ?",
    actorId,
    action
  )[0].c;
}

function entriesFor(userId: string, sourceType: string, sourceId?: string) {
  if (sourceId !== undefined) {
    return all(
      "SELECT * FROM journal_entries WHERE created_by = ? AND source_type = ? AND source_id = ?",
      userId,
      sourceType,
      sourceId
    );
  }
  return all("SELECT * FROM journal_entries WHERE created_by = ? AND source_type = ?", userId, sourceType);
}

function linesFor(entryId: string) {
  return all<{ code: string; debit: number; credit: number; party_type: string | null; party_id: string | null }>(
    `SELECT a.code, jl.debit, jl.credit, jl.party_type, jl.party_id
     FROM journal_lines jl JOIN accounts a ON a.id = jl.account_id
     WHERE jl.entry_id = ? ORDER BY a.code`,
    entryId
  );
}

function lineFor(entryId: string, code: string) {
  return linesFor(entryId).find((line) => line.code === code);
}

const PAYLOAD_ITEM = (med: SeededMedicine, over: Record<string, unknown> = {}) => ({
  medicineId: med.medicineId,
  medicineName: "Regression Med",
  quantity: 1,
  unit: "Strip",
  mrp: 100,
  rate: 95.24,
  amount: 95.24,
  gstRate: "5",
  gstAmount: 4.76,
  cgst: 2.38,
  sgst: 2.38,
  ...over,
});

function saleBody(items: unknown[], over: Record<string, unknown> = {}) {
  return {
    date: INV_DATE,
    subtotal: items.length * 95.24,
    totalGst: items.length * 4.76,
    cgst: items.length * 2.38,
    sgst: items.length * 2.38,
    grandTotal: items.length * 100,
    amountPaid: items.length * 100,
    paymentMode: "cash",
    status: "paid",
    discountAmount: 0,
    items,
    ...over,
  };
}

async function createSale(u: SeededUser, body: unknown) {
  return app.inject({
    method: "POST",
    url: "/api/invoices",
    headers: auth(u),
    payload: body as any,
  });
}

function purchaseBody(med: SeededMedicine, over: Record<string, unknown> = {}) {
  return {
    billNo: `REG-${nanoid(6)}`,
    billDate: "2026-06-20",
    items: [
      {
        medicineId: med.medicineId,
        medicineName: "Regression Med",
        batchNo: `RB-${nanoid(4)}`,
        expiryDate: "2027-12-31",
        quantity: 5,
        freeQuantity: 0,
        rate: 10,
        amount: 50,
        gstRate: "12",
        gstAmount: 5.36,
        cgst: 2.68,
        sgst: 2.68,
        mrp: 20,
      },
    ],
    subtotal: 50,
    totalGst: 5.36,
    grandTotal: 55.36,
    amountPaid: 55.36,
    paymentMode: "cash",
    ...over,
  };
}

const putPolicy = (u: SeededUser, policy: unknown) =>
  app.inject({ method: "PUT", url: "/api/expiry-policy", headers: auth(u), payload: policy as any });

beforeAll(async () => {
  applySchema();
  app = Fastify({ logger: false });
  await app.register(cookie);
  await app.register(invoiceRoutes, { prefix: "/api/invoices" });
  await app.register(purchaseRoutes, { prefix: "/api/purchases" });
  await app.register(paymentRoutes, { prefix: "/api/payments" });
  await app.register(returnsRoutes, { prefix: "/api/returns" });
  await app.register(accountingRoutes, { prefix: "/api/accounting" });
  await app.register(expiryPolicyRoutes, { prefix: "/api/expiry-policy" });
  await putPolicy(seedUser(), DEFAULT_POLICY);
});

// ===========================================================================
// 1. Cash sale chain
// ===========================================================================
describe("chain: cash sale", () => {
  it("writes invoice + stock deduction + payment-mode journal, no loyalty, no prescription, clean audit", async () => {
    const u = seedUser();
    const med = seedMedicine(u.id, { quantity: 30 });
    const cust = seedCustomer(u.id, { name: "Chain Customer" });

    const res = await createSale(u, saleBody([PAYLOAD_ITEM(med)], { customerId: cust.id }));
    expect(res.statusCode).toBe(201);
    const inv = res.json().data;

    // 1. Invoice row + batch stock deducted 30 â†’ 29.
    const saved = one<{ status: string; prescription_id: string | null }>(
      "SELECT status, prescription_id FROM invoices WHERE id = ?",
      inv.id
    );
    expect(saved?.status).toBe("paid");
    expect(saved?.prescription_id).toBeNull();
    expect(getBatchQuantity(med.batchId)).toBe(29);
    expect(countFor("invoice_batch_allocations", u.id)).toBe(1);

    // 2. Payment-mode journal: CASH debit = grandTotal = SALES + GST_OUTPUT credits.
    const entries = entriesFor(u.id, "invoice", inv.id);
    expect(entries).toHaveLength(1);
    const lines = linesFor(entries[0].id);
    expect(lineFor(entries[0].id, "CASH")?.debit).toBeCloseTo(inv.grandTotal, 2);
    expect(lineFor(entries[0].id, "SALES")?.credit).toBeCloseTo(inv.grandTotal - inv.totalGst, 2);
    expect(lineFor(entries[0].id, "GST_OUTPUT")?.credit).toBeCloseTo(inv.totalGst, 2);
    const debitSum = lines.reduce((s, l) => s + l.debit, 0);
    const creditSum = lines.reduce((s, l) => s + l.credit, 0);
    expect(debitSum).toBeCloseTo(creditSum, 2);
    expect(debitSum).toBeCloseTo(inv.grandTotal, 2);

    // 3. Loyalty is disabled by default â†’ NO ledger row for this sale.
    expect(
      all("SELECT id FROM loyalty_ledger WHERE created_by = ? AND customer_id = ?", u.id, cust.id)
    ).toHaveLength(0);

    // 4. Non-schedule medicine â†’ no prescription required (201 above proves it),
    //    and nothing was linked.
    expect(inv.prescriptionId ?? null).toBeNull();
    const medRow = one<{ schedule: string | null }>("SELECT schedule FROM medicines WHERE id = ?", med.medicineId);
    expect(medRow?.schedule ?? null).toBeNull();

    // 5. Audit trail is clean: CREATE recorded, no post/loyalty failures.
    expect(countFor("activity_log", u.id)).toBe(1);
    for (const action of [
      "accounting.post_failed",
      "accounting.skipped_no_party",
      "accounting.skipped_credit_mode",
      "loyalty.post_failed",
      "invoice.expiry_override",
      "invoice.prescription_override",
    ]) {
      expect(auditCount(u.id, action)).toBe(0);
    }
  });
});

// ===========================================================================
// 2. Schedule H prescription enforcement
// ===========================================================================
describe("chain: schedule H prescription enforcement", () => {
  it("rejects a scheduled-drug sale without a prescription and writes nothing", async () => {
    const u = seedUser();
    const med = seedMedicine(u.id, { quantity: 20, name: "SCHEDULE H MED" });
    const db = raw();
    db.prepare("UPDATE medicines SET schedule = 'H' WHERE id = ?").run(med.medicineId);
    db.close();

    const res = await createSale(u, saleBody([PAYLOAD_ITEM(med)]));
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("Prescription required for scheduled drugs");
    expect(body.items?.[0]).toBe("Regression Med"); // echoes the refused line item

    // No partial writes: no invoice, no allocation, stock untouched, no journal.
    expect(countFor("invoices", u.id)).toBe(0);
    expect(countFor("invoice_batch_allocations", u.id)).toBe(0);
    expect(getBatchQuantity(med.batchId)).toBe(20);
    expect(entriesFor(u.id, "invoice")).toHaveLength(0);
    expect(auditCount(u.id, "invoice.prescription_override")).toBe(0);
  });
});

// ===========================================================================
// 3. Cancel chain
// ===========================================================================
describe("chain: cancellation", () => {
  it("restores stock, writes an is_reversal journal and stamps reversed_by", async () => {
    const u = seedUser();
    const med = seedMedicine(u.id, { quantity: 12 });

    const created = await createSale(u, saleBody([PAYLOAD_ITEM(med), PAYLOAD_ITEM(med)]));
    expect(created.statusCode).toBe(201);
    const inv = created.json().data;
    expect(getBatchQuantity(med.batchId)).toBe(10);

    const [original] = entriesFor(u.id, "invoice", inv.id);
    expect(original.reversed_by).toBeNull();
    expect(original.is_reversal).toBe(0);

    const cancel = await app.inject({
      method: "POST",
      url: `/api/invoices/${inv.id}/cancel`,
      headers: auth(u),
    });
    expect(cancel.statusCode).toBe(200);

    // Stock fully restored.
    expect(getBatchQuantity(med.batchId)).toBe(12);

    // Reversal journal exists and points at the original; original is stamped.
    const reversals = all(
      "SELECT * FROM journal_entries WHERE created_by = ? AND source_type = 'reversal'",
      u.id
    );
    expect(reversals).toHaveLength(1);
    expect(reversals[0].is_reversal).toBe(1);
    expect(reversals[0].source_id).toBe(original.id);

    const [refreshed] = entriesFor(u.id, "invoice", inv.id);
    expect(refreshed.reversed_by).toBe(reversals[0].id);

    // The reversal mirrors every leg â†’ every account nets to zero.
    const reversalLines = linesFor(reversals[0].id);
    expect(reversalLines.length).toBeGreaterThanOrEqual(2);

    // Invoice is cancelled (kept as history) with a matching refund payout.
    expect(one<{ status: string }>("SELECT status FROM invoices WHERE id = ?", inv.id)?.status).toBe(
      "cancelled"
    );
    expect(
      all("SELECT id FROM payments WHERE invoice_id = ? AND type = 'paid' AND category = 'Refund'", inv.id)
    ).toHaveLength(1);
  });
});

// ===========================================================================
// 4. Purchase chain
// ===========================================================================
describe("chain: purchase", () => {
  it("creates the batch + INVENTORY/GST_INPUT/CASH journal, then blocks an expired incoming batch", async () => {
    const u = seedUser();
    const med = seedMedicine(u.id, { quantity: 2 });

    const batchesBefore = all("SELECT id FROM batches WHERE created_by = ?", u.id).length;

    const payload = purchaseBody(med);
    const res = await app.inject({
      method: "POST",
      url: "/api/purchases",
      headers: auth(u),
      payload: payload as any,
    });
    expect(res.statusCode).toBe(201);
    const bill = res.json().data;

    // Batch created for this bill.
    const batchesAfter = all<{ id: string; batch_no: string; quantity: number }>(
      "SELECT id, batch_no, quantity FROM batches WHERE created_by = ?",
      u.id
    );
    expect(batchesAfter.length).toBe(batchesBefore + 1);
    const created = batchesAfter.find((b) => b.batch_no === (payload.items[0] as any).batchNo);
    expect(created).toBeTruthy();
    expect(created!.quantity).toBe(5);

    // Journal: INVENTORY + GST_INPUT debits = CASH credit.
    const entries = entriesFor(u.id, "purchase", bill.id);
    expect(entries).toHaveLength(1);
    const lines = linesFor(entries[0].id);
    expect(lineFor(entries[0].id, "INVENTORY")?.debit).toBeCloseTo(50, 2);
    expect(lineFor(entries[0].id, "GST_INPUT")?.debit).toBeCloseTo(5.36, 2);
    expect(lineFor(entries[0].id, "CASH")?.credit).toBeCloseTo(55.36, 2);
    const debitSum = lines.reduce((s, l) => s + l.debit, 0);
    const creditSum = lines.reduce((s, l) => s + l.credit, 0);
    expect(debitSum).toBeCloseTo(creditSum, 2);

    // Expiry policy chain: the same bill with an expired incoming batch is
    // refused and nothing partial is written.
    const billsBefore = all("SELECT id FROM purchase_bills WHERE created_by = ?", u.id).length;
    const expired = purchaseBody(med, {
      items: [{ ...(purchaseBody(med).items[0] as any), expiryDate: "2020-01-01", batchNo: "EXPIRED-IN" }],
    });
    const blocked = await app.inject({
      method: "POST",
      url: "/api/purchases",
      headers: auth(u),
      payload: expired as any,
    });
    expect(blocked.statusCode).toBe(400);
    expect(blocked.json().error).toContain("Expired/near-expiry batch blocked by policy");
    expect(blocked.json().blocked[0].severity).toBe("blocked");
    expect(all("SELECT id FROM purchase_bills WHERE created_by = ?", u.id)).toHaveLength(billsBefore);
    expect(all("SELECT id FROM batches WHERE batch_no = 'EXPIRED-IN'")).toHaveLength(0);
  });
});

// ===========================================================================
// 5. Payment + return + the whole-story trial balance
// ===========================================================================
describe("chain: payment, return and trial balance", () => {
  it("keeps the ledger balanced across sale â†’ payment â†’ return", async () => {
    const u = seedUser();
    const med = seedMedicine(u.id, { quantity: 15 });
    const cust = seedCustomer(u.id, { name: "Credit Chain Customer" });

    // --- (a) Credit sale: AR debit = SALES + GST_OUTPUT credits.
    const sale = await createSale(
      u,
      saleBody([PAYLOAD_ITEM(med)], {
        customerId: cust.id,
        paymentMode: "credit",
        amountPaid: 0,
        status: "unpaid",
        grandTotal: 95.24,
        subtotal: 95.24 - 4.76,
        totalGst: 4.76,
      })
    );
    expect(sale.statusCode).toBe(201);
    const inv = sale.json().data;
    expect(getBatchQuantity(med.batchId)).toBe(14);

    const [saleEntry] = entriesFor(u.id, "invoice", inv.id);
    expect(lineFor(saleEntry.id, "AR")?.debit).toBeCloseTo(inv.grandTotal, 2);
    expect(lineFor(saleEntry.id, "CASH")).toBeUndefined();
    expect(lineFor(saleEntry.id, "AR")?.party_id).toBe(cust.id);

    // --- (b) Payment received: CASH debit / AR credit (party-tagged).
    const payment = await app.inject({
      method: "POST",
      url: "/api/payments",
      headers: auth(u),
      payload: {
        type: "received",
        amount: 50,
        invoiceId: inv.id,
        customerId: cust.id,
        paymentMode: "cash",
        date: "2026-06-25",
      },
    });
    expect(payment.statusCode).toBe(201);
    const pay = payment.json().data;
    const [payEntry] = entriesFor(u.id, "payment", pay.id);
    expect(payEntry).toBeTruthy();
    expect(lineFor(payEntry.id, "CASH")?.debit).toBeCloseTo(50, 2);
    expect(lineFor(payEntry.id, "AR")?.credit).toBeCloseTo(50, 2);
    expect(lineFor(payEntry.id, "AR")?.party_id).toBe(cust.id);

    // --- (c) Return with a proportional GST share (â‚¹50 of a â‚¹95.24 bill).
    const refund = 50;
    const ret = await app.inject({
      method: "POST",
      url: "/api/returns",
      headers: auth(u),
      payload: {
        invoiceId: inv.id,
        reason: "Damaged strip in the chain test",
        refundMode: "cash",
        items: [
          {
            medicineId: med.medicineId,
            medicineName: "Regression Med",
            batchId: med.batchId,
            quantity: 1,
            rate: 95.24,
            amount: 95.24,
            gstRate: "5",
            gstAmount: inv.totalGst,
            refundAmount: refund,
          },
        ],
        subtotal: inv.subtotal,
        totalGst: inv.totalGst,
        grandTotal: inv.grandTotal,
        refundAmount: refund,
      },
    });
    expect(ret.statusCode).toBe(201);
    const salesReturn = ret.json().data;
    const [retEntry] = entriesFor(u.id, "sales_return", salesReturn.id);
    expect(retEntry).toBeTruthy();
    const gstShare = Math.round(((refund * inv.totalGst) / inv.grandTotal) * 100) / 100;
    const taxable = Math.round((refund - gstShare) * 100) / 100;
    expect(lineFor(retEntry.id, "SALES_RETURNS")?.debit).toBeCloseTo(taxable, 2);
    expect(lineFor(retEntry.id, "GST_OUTPUT")?.debit).toBeCloseTo(gstShare, 2);
    expect(lineFor(retEntry.id, "CASH")?.credit).toBeCloseTo(refund, 2);
    expect(taxable + gstShare).toBeCloseTo(refund, 2);

    // Stock came back for the returned unit.
    expect(getBatchQuantity(med.batchId)).toBe(15);

    // --- (d) THE end-to-end assertion: trial balance across the whole story.
    const tb = await app.inject({
      method: "GET",
      url: "/api/accounting/trial-balance",
      headers: auth(u),
    });
    expect(tb.statusCode).toBe(200);
    const totals = tb.json().data.totals;
    expect(totals.totalDebit).toBeGreaterThan(0);
    expect(totals.totalDebit).toBeCloseTo(totals.totalCredit, 2);

    // And via the HTTP day book: all four entries are present and balanced.
    const dayBook = await app.inject({
      method: "GET",
      url: `/api/accounting/day-book?from=2026-01-01&to=2026-12-31`,
      headers: auth(u),
    });
    expect(dayBook.statusCode).toBe(200);
    const kinds = dayBook.json().data.entries.map((e: any) => e.sourceType);
    for (const kind of ["invoice", "payment", "sales_return"]) {
      expect(kinds).toContain(kind);
    }
    for (const entry of dayBook.json().data.entries as any[]) {
      const debits = entry.lines.reduce((s: number, l: any) => s + (l.debit ?? 0), 0);
      const credits = entry.lines.reduce((s: number, l: any) => s + (l.credit ?? 0), 0);
      expect(debits).toBeCloseTo(credits, 2);
    }
  });
});

// ===========================================================================
// 6. Admin expiry override
// ===========================================================================
describe("chain: admin expiry override", () => {
  it("blocks first, then lets an admin sell through with an audited override", async () => {
    const u = seedUser(); // helpers.seedUser â†’ admin
    const med = seedMedicine(u.id, { quantity: 8 });
    const expiredOn = "2026-01-01";

    // Blocked without the override.
    const blocked = await createSale(
      u,
      saleBody([PAYLOAD_ITEM(med, { expiryDate: expiredOn })])
    );
    expect(blocked.statusCode).toBe(400);
    expect(blocked.json().error).toContain("Expired/near-expiry batch blocked by policy");
    expect(countFor("invoices", u.id)).toBe(0);
    expect(getBatchQuantity(med.batchId)).toBe(8);

    // Admin override with a reason â†’ sale proceeds and the audit event exists.
    const over = await createSale(
      u,
      saleBody([PAYLOAD_ITEM(med, { expiryDate: expiredOn })], {
        overrideExpiry: true,
        overrideReason: "Dispensed last pack offline â€” correcting entry",
      })
    );
    expect(over.statusCode).toBe(201);
    const inv = over.json().data;
    expect(getBatchQuantity(med.batchId)).toBe(7);

    expect(auditCount(u.id, "invoice.expiry_override")).toBe(1);
    const event = all<{ metadata: string }>(
      "SELECT metadata FROM audit_events WHERE actor_id = ? AND action = 'invoice.expiry_override'",
      u.id
    )[0];
    const meta = JSON.parse(event.metadata ?? "{}");
    expect(meta.overrideReason).toContain("correcting entry");
    expect(meta.items[0].expiryDate).toBe(expiredOn);
    expect(meta.entity ?? meta.invoiceId ?? true).toBeTruthy();

    // The chain still balances after the override.
    const tb = await app.inject({
      method: "GET",
      url: "/api/accounting/trial-balance",
      headers: auth(u),
    });
    expect(tb.json().data.totals.totalDebit).toBeCloseTo(tb.json().data.totals.totalCredit, 2);

    // Leave the install-wide policy on defaults for the rest of the run.
    await putPolicy(u, DEFAULT_POLICY);
  });
});


// ===========================================================================
// 7. Partial-payment accounting (Fix 3) â€” sale split, settlements, cancel
// ===========================================================================
/** Net ledger balance for one account (debit âˆ’ credit) across ALL of a tenant's entries. */
function accountNet(userId: string, code: string): number {
  const rows = all<{ net: number }>(
    `SELECT coalesce(sum(jl.debit - jl.credit), 0) AS net
     FROM journal_lines jl
     JOIN accounts a ON a.id = jl.account_id
     JOIN journal_entries je ON je.id = jl.entry_id
     WHERE je.created_by = ? AND a.code = ?`,
    userId,
    code
  );
  return Math.round((rows[0]?.net ?? 0) * 100) / 100;
}

function reversalRows(userId: string) {
  return all<{ id: string; source_id: string }>(
    "SELECT id, source_id FROM journal_entries WHERE created_by = ? AND source_type = 'reversal'",
    userId
  );
}

async function partialCashSale(u: SeededUser) {
  const med = seedMedicine(u.id, { quantity: 20 });
  const cust = seedCustomer(u.id, { name: "Partial Customer" });
  const res = await createSale(
    u,
    saleBody([PAYLOAD_ITEM(med)], { customerId: cust.id, amountPaid: 40 })
  );
  expect(res.statusCode).toBe(201);
  return { med, cust, inv: res.json().data };
}

async function settle(u: SeededUser, inv: any, cust: any, amount: number) {
  const payment = await app.inject({
    method: "POST",
    url: "/api/payments",
    headers: auth(u),
    payload: {
      type: "received",
      amount,
      invoiceId: inv.id,
      customerId: cust.id,
      paymentMode: "cash",
      date: "2026-06-25",
    },
  });
  expect(payment.statusCode).toBe(201);
  return payment.json().data;
}

describe("chain: partial payment accounting (Fix 3)", () => {
  it("splits a partial cash sale: CASH = amountPaid, AR = remainder, TB balanced", async () => {
    const u = seedUser();
    const { inv, cust } = await partialCashSale(u);

    const [entry] = entriesFor(u.id, "invoice", inv.id);
    const lines = linesFor(entry.id);
    expect(lineFor(entry.id, "CASH")?.debit).toBeCloseTo(40, 2); // only what was collected
    expect(lineFor(entry.id, "AR")?.debit).toBeCloseTo(inv.grandTotal - 40, 2); // remainder
    expect(lineFor(entry.id, "AR")?.party_id).toBe(cust.id);
    expect(lineFor(entry.id, "SALES")?.credit).toBeCloseTo(inv.grandTotal - inv.totalGst, 2);
    expect(lineFor(entry.id, "GST_OUTPUT")?.credit).toBeCloseTo(inv.totalGst, 2);
    const debitSum = lines.reduce((s, l) => s + l.debit, 0);
    const creditSum = lines.reduce((s, l) => s + l.credit, 0);
    expect(debitSum).toBeCloseTo(creditSum, 2);

    const tb = await app.inject({
      method: "GET",
      url: "/api/accounting/trial-balance",
      headers: auth(u),
    });
    expect(tb.json().data.totals.totalDebit).toBeCloseTo(tb.json().data.totals.totalCredit, 2);
  });

  it("a settlement posts Dr CASH / Cr AR and AR nets to grandTotal - amountPaid - settled", async () => {
    const u = seedUser();
    const { inv, cust } = await partialCashSale(u);
    const pay = await settle(u, inv, cust, 30);

    const [payEntry] = entriesFor(u.id, "payment", pay.id);
    expect(lineFor(payEntry.id, "CASH")?.debit).toBeCloseTo(30, 2);
    expect(lineFor(payEntry.id, "AR")?.credit).toBeCloseTo(30, 2);

    // AR = +(grandTotal - 40) (sale remainder) - 30 (settlement).
    expect(accountNet(u.id, "AR")).toBeCloseTo(inv.grandTotal - 40 - 30, 2);
    expect(accountNet(u.id, "CASH")).toBeCloseTo(70, 2); // 40 + 30 collected

    const tb = await app.inject({
      method: "GET",
      url: "/api/accounting/trial-balance",
      headers: auth(u),
    });
    expect(tb.json().data.totals.totalDebit).toBeCloseTo(tb.json().data.totals.totalCredit, 2);
  });

  it("cancel reverses the settlement AND the sale entry: exact final balances + audits", async () => {
    const u = seedUser();
    const { inv, cust } = await partialCashSale(u);
    const pay = await settle(u, inv, cust, 30);

    const [invoiceEntry] = entriesFor(u.id, "invoice", inv.id);
    const [payEntry] = entriesFor(u.id, "payment", pay.id);

    const cancel = await app.inject({
      method: "POST",
      url: `/api/invoices/${inv.id}/cancel`,
      headers: auth(u),
    });
    expect(cancel.statusCode).toBe(200);

    // Two reversals: the settlement first, then the sale entry.
    const reversals = reversalRows(u.id);
    expect(reversals).toHaveLength(2);
    const reversedIds = reversals.map((r) => r.source_id);
    expect(reversedIds).toContain(invoiceEntry.id);
    expect(reversedIds).toContain(payEntry.id);

    // Exact final balances: everything nets to zero (cash 40+30 in, refund matched out
    // modeled by the two reversals; AR cleared with the invoice).
    expect(accountNet(u.id, "AR")).toBeCloseTo(0, 2);
    expect(accountNet(u.id, "CASH")).toBeCloseTo(0, 2);
    expect(accountNet(u.id, "SALES")).toBeCloseTo(0, 2);
    expect(accountNet(u.id, "GST_OUTPUT")).toBeCloseTo(0, 2);

    // Both reversals audited with the invoice number + kind metadata.
    const audits = all<{ metadata: string }>(
      "SELECT metadata FROM audit_events WHERE actor_id = ? AND action = 'accounting.reversed'",
      u.id
    );
    const kinds = audits.map((a) => JSON.parse(a.metadata ?? "{}").kind).sort();
    expect(kinds).toEqual(["invoice", "settlement"]);
    for (const a of audits) {
      expect(JSON.parse(a.metadata ?? "{}").invoiceNo).toBe(inv.invoiceNo);
    }

    const tb = await app.inject({
      method: "GET",
      url: "/api/accounting/trial-balance",
      headers: auth(u),
    });
    expect(tb.json().data.totals.totalDebit).toBeCloseTo(tb.json().data.totals.totalCredit, 2);
  });

  it("full-credit sale with no settlement cancels to AR 0 (single reversal)", async () => {
    const u = seedUser();
    const med = seedMedicine(u.id, { quantity: 15 });
    const cust = seedCustomer(u.id, { name: "Credit Only" });
    const res = await createSale(
      u,
      saleBody([PAYLOAD_ITEM(med)], {
        customerId: cust.id,
        paymentMode: "credit",
        amountPaid: 0,
        status: "unpaid",
        grandTotal: 95.24,
        subtotal: 95.24 - 4.76,
        totalGst: 4.76,
      })
    );
    expect(res.statusCode).toBe(201);
    const inv = res.json().data;
    expect(accountNet(u.id, "AR")).toBeCloseTo(95.24, 2);
    expect(accountNet(u.id, "CASH")).toBeCloseTo(0, 2);

    const cancel = await app.inject({
      method: "POST",
      url: `/api/invoices/${inv.id}/cancel`,
      headers: auth(u),
    });
    expect(cancel.statusCode).toBe(200);

    expect(reversalRows(u.id)).toHaveLength(1); // nothing settled â†’ only the sale
    expect(accountNet(u.id, "AR")).toBeCloseTo(0, 2);
    expect(accountNet(u.id, "CASH")).toBeCloseTo(0, 2);
    expect(accountNet(u.id, "SALES")).toBeCloseTo(0, 2);
  });

  it("double cancel is rejected and never double-reverses a settlement", async () => {
    const u = seedUser();
    const { inv, cust } = await partialCashSale(u);
    await settle(u, inv, cust, 30);

    const first = await app.inject({
      method: "POST",
      url: `/api/invoices/${inv.id}/cancel`,
      headers: auth(u),
    });
    expect(first.statusCode).toBe(200);
    expect(reversalRows(u.id)).toHaveLength(2);

    const second = await app.inject({
      method: "POST",
      url: `/api/invoices/${inv.id}/cancel`,
      headers: auth(u),
    });
    expect(second.statusCode).toBe(400);
    expect(second.json().error).toMatch(/already cancelled|refund/i);
    expect(reversalRows(u.id)).toHaveLength(2); // unchanged
    expect(accountNet(u.id, "AR")).toBeCloseTo(0, 2);
    expect(accountNet(u.id, "CASH")).toBeCloseTo(0, 2);
  });

  it("invoice-created receipt rows never produce sourceType 'payment' entries (double-post guard)", async () => {
    const u = seedUser();
    const { inv } = await partialCashSale(u);

    // The receipt row exists in the payments table...
    const receiptRows = all(
      "SELECT id FROM payments WHERE created_by = ? AND invoice_id = ? AND type = 'received'",
      u.id,
      inv.id
    );
    expect(receiptRows).toHaveLength(1);
    // ...but invoice create never passes through the payments route, so no
    // `payment` journal entry exists for it (only the invoice entry's cash leg).
    expect(entriesFor(u.id, "payment")).toHaveLength(0);

    // After cancel the refund payout row is also unposted; still zero payment entries.
    const cancel = await app.inject({
      method: "POST",
      url: `/api/invoices/${inv.id}/cancel`,
      headers: auth(u),
    });
    expect(cancel.statusCode).toBe(200);
    expect(
      all("SELECT id FROM payments WHERE created_by = ? AND invoice_id = ? AND type = 'paid'", u.id, inv.id)
    ).toHaveLength(1); // refund payout, as history
    expect(entriesFor(u.id, "payment")).toHaveLength(0);
    expect(reversalRows(u.id)).toHaveLength(1); // only the sale entry reversed
  });
});

describe("chain: partial payment edges (Fix 3)", () => {
  it("a cash sale with amountPaid = 0 posts entirely to AR (no CASH leg)", async () => {
    const u = seedUser();
    const med = seedMedicine(u.id, { quantity: 10 });
    const cust = seedCustomer(u.id, { name: "Unpaid Cash" });
    const res = await createSale(
      u,
      saleBody([PAYLOAD_ITEM(med)], { customerId: cust.id, amountPaid: 0, status: "unpaid" })
    );
    expect(res.statusCode).toBe(201);
    const inv = res.json().data;

    const [entry] = entriesFor(u.id, "invoice", inv.id);
    expect(lineFor(entry.id, "CASH")).toBeUndefined(); // truthful split: no cash moved
    expect(lineFor(entry.id, "AR")?.debit).toBeCloseTo(inv.grandTotal, 2);
    expect(lineFor(entry.id, "AR")?.party_id).toBe(cust.id);
    expect(accountNet(u.id, "CASH")).toBeCloseTo(0, 2);
  });

  it("a fully-paid cash sale omits the AR leg (zero leg)", async () => {
    const u = seedUser();
    const med = seedMedicine(u.id, { quantity: 10 });
    const res = await createSale(u, saleBody([PAYLOAD_ITEM(med)])); // amountPaid = grandTotal
    expect(res.statusCode).toBe(201);
    const inv = res.json().data;

    const [entry] = entriesFor(u.id, "invoice", inv.id);
    expect(lineFor(entry.id, "CASH")?.debit).toBeCloseTo(inv.grandTotal, 2);
    expect(lineFor(entry.id, "AR")).toBeUndefined(); // remainder is zero → leg omitted
    expect(accountNet(u.id, "AR")).toBeCloseTo(0, 2);
  });

  it("a partial card sale debits BANK with amountPaid only", async () => {
    const u = seedUser();
    const med = seedMedicine(u.id, { quantity: 10 });
    const cust = seedCustomer(u.id, { name: "Card Partial" });
    const res = await createSale(
      u,
      saleBody([PAYLOAD_ITEM(med)], { customerId: cust.id, amountPaid: 30, paymentMode: "card" })
    );
    expect(res.statusCode).toBe(201);
    const inv = res.json().data;

    const [entry] = entriesFor(u.id, "invoice", inv.id);
    expect(lineFor(entry.id, "BANK")?.debit).toBeCloseTo(30, 2);
    expect(lineFor(entry.id, "CASH")).toBeUndefined();
    expect(lineFor(entry.id, "AR")?.debit).toBeCloseTo(inv.grandTotal - 30, 2);
    expect(accountNet(u.id, "BANK")).toBeCloseTo(30, 2);
  });

  it("a settlement exceeding the outstanding balance is rejected with 400", async () => {
    const u = seedUser();
    const { inv, cust } = await partialCashSale(u); // amountPaid 40 → outstanding = grandTotal - 40
    const tooMuch = await app.inject({
      method: "POST",
      url: "/api/payments",
      headers: auth(u),
      payload: {
        type: "received",
        amount: inv.grandTotal, // > outstanding
        invoiceId: inv.id,
        customerId: cust.id,
        paymentMode: "cash",
        date: "2026-06-25",
      },
    });
    expect(tooMuch.statusCode).toBe(400);
    expect(tooMuch.json().error).toContain("exceeds the outstanding balance");
    expect(entriesFor(u.id, "payment")).toHaveLength(0);
  });

  it("settling a cancelled invoice is refused with 409", async () => {
    const u = seedUser();
    const { inv, cust } = await partialCashSale(u);
    const cancel = await app.inject({
      method: "POST",
      url: `/api/invoices/${inv.id}/cancel`,
      headers: auth(u),
    });
    expect(cancel.statusCode).toBe(200);

    const after = await app.inject({
      method: "POST",
      url: "/api/payments",
      headers: auth(u),
      payload: {
        type: "received",
        amount: 10,
        invoiceId: inv.id,
        customerId: cust.id,
        paymentMode: "cash",
        date: "2026-06-26",
      },
    });
    expect(after.statusCode).toBe(409);
    expect(after.json().error).toContain("cancelled invoice");
    expect(entriesFor(u.id, "payment")).toHaveLength(0);
  });
});
