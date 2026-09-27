import { beforeAll, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import {
  applySchema,
  dbPath,
  seedMedicine,
  seedUser,
  type SeededMedicine,
  type SeededUser,
} from "./helpers.js";
import purchaseReturnRoutes from "../src/routes/purchaseReturns.js";
import purchaseRoutes from "../src/routes/purchases.js";
import invoiceRoutes from "../src/routes/invoices.js";
import returnsRoutes from "../src/routes/returns.js";
import { post } from "../src/services/accounting.js";

let app: FastifyInstance;

const RETURN_DATE = "2026-07-10";

function all<T = any>(sql: string, ...params: any[]): T[] {
  const db = new Database(dbPath());
  try {
    return db.prepare(sql).all(...params) as T[];
  } finally {
    db.close();
  }
}

function run(sql: string, ...params: any[]): void {
  const db = new Database(dbPath());
  try {
    db.prepare(sql).run(...params);
  } finally {
    db.close();
  }
}

const auth = (u: SeededUser) => ({ authorization: `Bearer ${u.token}` });

function setRole(userId: string, role: string): void {
  run("UPDATE users SET role = ? WHERE id = ?", role, userId);
}

function seedSupplier(ownerId: string, name = "Acme Distributors"): string {
  const id = `sup-${nanoid(10)}`;
  const now = Date.now();
  run(
    `INSERT INTO suppliers (id, name, is_active, created_by, created_at, updated_at)
     VALUES (?, ?, 1, ?, ?, ?)`,
    id,
    name,
    ownerId,
    now,
    now
  );
  return id;
}

function setSupplierBalance(supplierId: string, balance: number): void {
  run("UPDATE suppliers SET balance = ? WHERE id = ?", balance, supplierId);
}

function getSupplierBalance(supplierId: string): number {
  const rows = all<{ balance: number | null }>("SELECT balance FROM suppliers WHERE id = ?", supplierId);
  return rows[0]?.balance ?? 0;
}

function returnBody(med: SeededMedicine, over: Record<string, unknown> = {}) {
  return {
    date: RETURN_DATE,
    refundMode: "cash",
    items: [
      {
        medicineId: med.medicineId,
        quantity: 2,
        rate: 100,
      },
    ],
    ...over,
  };
}

async function createReturn(u: SeededUser, payload: unknown) {
  return app.inject({
    method: "POST",
    url: "/api/purchase-returns",
    headers: auth(u),
    payload: payload as any,
  });
}

function journalEntries(userId: string, sourceType: string, sourceId?: string) {
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

function entryLines(entryId: string) {
  return all<{ code: string; debit: number; credit: number; party_type: string | null; party_id: string | null }>(
    `SELECT a.code, jl.debit, jl.credit, jl.party_type, jl.party_id
     FROM journal_lines jl JOIN accounts a ON a.id = jl.account_id
     WHERE jl.entry_id = ? ORDER BY a.code`,
    entryId
  );
}

function stockTx(userId: string, reference: string) {
  return all(
    "SELECT * FROM inventory_transactions WHERE created_by = ? AND reference = ?",
    userId,
    reference
  );
}

beforeAll(async () => {
  applySchema();
  app = Fastify({ logger: false });
  await app.register(purchaseReturnRoutes, { prefix: "/api/purchase-returns" });
  await app.register(purchaseRoutes, { prefix: "/api/purchases" });
  await app.register(invoiceRoutes, { prefix: "/api/invoices" });
  await app.register(returnsRoutes, { prefix: "/api/returns" });
});

// ===========================================================================
// Creation
// ===========================================================================
describe("POST /api/purchase-returns", () => {
  it("creates a return: unique returnNo, stock deducted, negative tx, GST math, journal", async () => {
    const u = seedUser();
    const med = seedMedicine(u.id, { quantity: 20 });
    const supplierId = seedSupplier(u.id);

    const res = await createReturn(u, returnBody(med, { supplierId }));
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    const ret = body.data;

    // Distinct prefix + unique sequence (mirrors RET- for sales returns).
    expect(ret.returnNo).toMatch(/^PR-\d{4}-\d{6}$/);

    // Stock deducted on the (auto-picked single) batch.
    const batch = all<{ quantity: number }>("SELECT quantity FROM batches WHERE id = ?", med.batchId)[0];
    expect(batch.quantity).toBe(18);

    // Inventory transaction: purchase_return with NEGATIVE quantity + balanceAfter.
    const txs = stockTx(u.id, ret.returnNo);
    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("purchase_return");
    expect(txs[0].quantity).toBe(-2);
    expect(txs[0].balance_after).toBe(18);
    expect(txs[0].batch_id).toBe(med.batchId);

    // Totals: amount = rate*qty = 200 (GST-inclusive), gstRate defaults to the
    // medicine's rate (5%): gst = 200 - 200/1.05 = 9.52, subtotal = 190.48.
    expect(ret.subtotal).toBeCloseTo(190.48, 2);
    expect(ret.totalGst).toBeCloseTo(9.52, 2);
    expect(ret.grandTotal).toBeCloseTo(200, 2);
    expect(ret.refundAmount).toBeCloseTo(200, 2); // default = grandTotal
    expect(ret.items).toHaveLength(1);
    expect(ret.items[0].amount).toBeCloseTo(200, 2);
    expect(ret.items[0].gstAmount).toBeCloseTo(9.52, 2);
    expect(ret.items[0].refundAmount).toBeCloseTo(200, 2);

    // Journal: Dr CASH 200 / Cr PURCHASE_RETURNS 190.48 / Cr GST_INPUT 9.52.
    const entries = journalEntries(u.id, "purchase_return", ret.id);
    expect(entries).toHaveLength(1);
    const lines = entryLines(entries[0].id);
    expect(lines.find((l) => l.code === "CASH")!.debit).toBeCloseTo(200, 2);
    expect(lines.find((l) => l.code === "PURCHASE_RETURNS")!.credit).toBeCloseTo(190.48, 2);
    expect(lines.find((l) => l.code === "GST_INPUT")!.credit).toBeCloseTo(9.52, 2);
    const debitSum = lines.reduce((s, l) => s + l.debit, 0);
    const creditSum = lines.reduce((s, l) => s + l.credit, 0);
    expect(debitSum).toBeCloseTo(creditSum, 2);

    // Cash refund does NOT touch the supplier balance (mirrors purchases.ts:
    // only non-cash settlements adjust what we owe).
    expect(getSupplierBalance(supplierId)).toBeCloseTo(0, 2);

    // Audit + activity log.
    expect(
      all("SELECT id FROM audit_events WHERE actor_id = ? AND action = 'purchase_return.create'", u.id)
    ).toHaveLength(1);
    expect(
      all("SELECT id FROM activity_log WHERE user_id = ? AND entity = 'purchase_return'", u.id)
    ).toHaveLength(1);

    // A second return gets the next number in the PR- series (created last so
    // the stock/audit counts above stay single-return).
    const dup = await createReturn(u, returnBody(med, { supplierId }));
    expect(dup.statusCode).toBe(201);
    expect(dup.json().data.returnNo).not.toBe(ret.returnNo);
    expect(parseInt(dup.json().data.returnNo.split("-")[2], 10)).toBe(
      parseInt(ret.returnNo.split("-")[2], 10) + 1
    );
  });

  it("credit refund reduces the supplier balance and debits AP with the supplier party", async () => {
    const u = seedUser();
    const med = seedMedicine(u.id, { quantity: 10 });
    const supplierId = seedSupplier(u.id);
    setSupplierBalance(supplierId, 500);

    const res = await createReturn(u, returnBody(med, { supplierId, refundMode: "credit" }));
    expect(res.statusCode).toBe(201);
    const ret = res.json().data;

    // Documented rule: refundMode "credit" settles against dues → balance
    // decreases by the refund; cash-like refunds leave the balance alone.
    expect(getSupplierBalance(supplierId)).toBeCloseTo(300, 2);

    const [entry] = journalEntries(u.id, "purchase_return", ret.id);
    const lines = entryLines(entry.id);
    const ap = lines.find((l) => l.code === "AP")!;
    expect(ap.debit).toBeCloseTo(200, 2);
    expect(ap.party_type).toBe("supplier");
    expect(ap.party_id).toBe(supplierId);
    expect(lines.find((l) => l.code === "CASH")).toBeUndefined();
  });

  it("rejects when the batch does not have enough stock (400 with batch + available)", async () => {
    const u = seedUser();
    const med = seedMedicine(u.id, { quantity: 3 });

    const res = await createReturn(u, returnBody(med, { items: [{ medicineId: med.medicineId, quantity: 5, rate: 100 }] }));
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("Insufficient stock in batch");
    expect(res.json().error).toContain("available 3");

    // Nothing was written.
    expect(all("SELECT id FROM purchase_returns WHERE created_by = ?", u.id)).toHaveLength(0);
    expect(all(
      "SELECT id FROM inventory_transactions WHERE created_by = ? AND type = 'purchase_return'", u.id
    )).toHaveLength(0);
  });

  it("requires batchId when the medicine has multiple batches", async () => {
    const u = seedUser();
    const med = seedMedicine(u.id, {
      quantity: 10,
      batches: [{ quantity: 5 }, { quantity: 7 }],
    });

    const res = await createReturn(u, returnBody(med));
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/batchId is required/i);

    // Explicit batch picks the right lot and deducts only that one.
    const ok = await createReturn(
      u,
      returnBody(med, { items: [{ medicineId: med.medicineId, batchId: med.batchIds[2], quantity: 4, rate: 50 }] })
    );
    expect(ok.statusCode).toBe(201);
    const qtys = all<{ id: string; quantity: number }>(
      "SELECT id, quantity FROM batches WHERE medicine_id = ? ORDER BY batch_no",
      med.medicineId
    );
    expect(qtys.find((b) => b.id === med.batchIds[0])!.quantity).toBe(10);
    expect(qtys.find((b) => b.id === med.batchIds[2])!.quantity).toBe(3);
  });

  it("auto-picks the batch when the medicine has exactly one", async () => {
    const u = seedUser();
    const med = seedMedicine(u.id, { quantity: 8 });

    const res = await createReturn(u, returnBody(med, { items: [{ medicineId: med.medicineId, quantity: 1, rate: 10 }] }));
    expect(res.statusCode).toBe(201);
    const ret = res.json().data;
    expect(ret.items[0].batchId).toBe(med.batchId);
    expect(
      all("SELECT id FROM inventory_transactions WHERE created_by = ? AND reference = ?", u.id, ret.returnNo)
    ).toHaveLength(1);
  });

  it("rejects a batch that belongs to a different medicine", async () => {
    const u = seedUser();
    const medA = seedMedicine(u.id, { quantity: 5 });
    const medB = seedMedicine(u.id, { quantity: 5, name: "Other Med" });

    const res = await createReturn(
      u,
      returnBody(medA, { items: [{ medicineId: medA.medicineId, batchId: medB.batchId, quantity: 1, rate: 10 }] })
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/does not belong/i);
  });

  it("rejects a foreign medicine, supplier and purchase bill", async () => {
    const owner = seedUser();
    const foreign = seedUser();
    const med = seedMedicine(owner.id, { quantity: 10 });
    const foreignSupplier = seedSupplier(owner.id, "Owner's Supplier");

    // Foreign medicine → 400.
    const medRes = await createReturn(foreign, returnBody(med));
    expect(medRes.statusCode).toBe(400);

    // Foreign supplier → 400.
    const supRes = await createReturn(
      foreign,
      returnBody(seedMedicine(foreign.id, { quantity: 5 }), { supplierId: foreignSupplier })
    );
    expect(supRes.statusCode).toBe(400);
    expect(supRes.json().error).toMatch(/supplier/i);

    // Foreign purchase bill → 404.
    const billRes = await app.inject({
      method: "POST",
      url: "/api/purchases",
      headers: auth(owner),
      payload: {
        billNo: `PRBILL-${nanoid(6)}`,
        billDate: RETURN_DATE,
        items: [
          {
            medicineId: med.medicineId,
            medicineName: "Test Med",
            batchNo: `PB-${nanoid(4)}`,
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
        amountPaid: 0,
        paymentMode: "credit",
        supplierId: foreignSupplier,
      },
    });
    expect(billRes.statusCode).toBe(201);
    const bill = billRes.json().data;

    const billReturn = await createReturn(
      foreign,
      returnBody(seedMedicine(foreign.id, { quantity: 5 }), { purchaseBillId: bill.id })
    );
    expect(billReturn.statusCode).toBe(404);
    expect(billReturn.json().error).toMatch(/bill/i);
  });

  it("validates the payload: no items / bad rate / missing fields → 400", async () => {
    const u = seedUser();
    const med = seedMedicine(u.id, { quantity: 5 });

    const noItems = await createReturn(u, { date: RETURN_DATE, items: [] });
    expect(noItems.statusCode).toBe(400);
    expect(noItems.json().error).toBe("Validation error");

    const badRate = await createReturn(
      u,
      returnBody(med, { items: [{ medicineId: med.medicineId, quantity: 1, rate: 0 }] })
    );
    expect(badRate.statusCode).toBe(400);

    const noDate = await createReturn(u, { items: [{ medicineId: med.medicineId, quantity: 1, rate: 5 }] });
    expect(noDate.statusCode).toBe(400);
  });
});

// ===========================================================================
// Reads
// ===========================================================================
describe("GET /api/purchase-returns", () => {
  it("lists tenant returns with date/supplier filters and pagination", async () => {
    const u = seedUser();
    const other = seedUser();
    const med = seedMedicine(u.id, { quantity: 30 });
    const supplierA = seedSupplier(u.id, "Supplier A");
    const supplierB = seedSupplier(u.id, "Supplier B");

    await createReturn(u, returnBody(med, { supplierId: supplierA, date: "2026-07-01" }));
    await createReturn(u, returnBody(med, { supplierId: supplierB, date: "2026-07-05" }));
    await createReturn(u, returnBody(med, { supplierId: supplierA, date: "2026-07-05" }));
    // Another tenant's return must never show up.
    await createReturn(other, returnBody(seedMedicine(other.id, { quantity: 5 })));

    const allRes = await app.inject({
      method: "GET",
      url: "/api/purchase-returns",
      headers: auth(u),
    });
    expect(allRes.statusCode).toBe(200);
    expect(allRes.json().data).toHaveLength(3);
    expect(allRes.json().total).toBe(3);
    expect(allRes.json().page).toBe(1);

    const byDate = await app.inject({
      method: "GET",
      url: "/api/purchase-returns?date=2026-07-05",
      headers: auth(u),
    });
    expect(byDate.json().data).toHaveLength(2);

    const bySupplier = await app.inject({
      method: "GET",
      url: `/api/purchase-returns?supplierId=${supplierA}`,
      headers: auth(u),
    });
    expect(bySupplier.json().data).toHaveLength(2);

    const paged = await app.inject({
      method: "GET",
      url: "/api/purchase-returns?page=1&limit=2",
      headers: auth(u),
    });
    expect(paged.json().data).toHaveLength(2);
    expect(paged.json().total).toBe(3);

    const range = await app.inject({
      method: "GET",
      url: "/api/purchase-returns?from=2026-07-05&to=2026-07-05",
      headers: auth(u),
    });
    expect(range.json().data).toHaveLength(2);
  });

  it("returns a single return with items; foreign id → 404", async () => {
    const u = seedUser();
    const other = seedUser();
    const med = seedMedicine(u.id, { quantity: 10 });
    const created = await createReturn(u, returnBody(med));
    const ret = created.json().data;

    const res = await app.inject({
      method: "GET",
      url: `/api/purchase-returns/${ret.id}`,
      headers: auth(u),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe(ret.id);
    expect(res.json().data.items).toHaveLength(1);
    expect(res.json().data.items[0].medicineId).toBe(med.medicineId);

    const foreign = await app.inject({
      method: "GET",
      url: `/api/purchase-returns/${ret.id}`,
      headers: auth(other),
    });
    expect(foreign.statusCode).toBe(404);
  });
});

// ===========================================================================
// Roles
// ===========================================================================
describe("roles", () => {
  it("admin and pharmacist may create; cashier gets 403", async () => {
    const admin = seedUser(); // helpers.seedUser seeds role=admin
    const med = seedMedicine(admin.id, { quantity: 5 });
    const ok = await createReturn(admin, returnBody(med));
    expect(ok.statusCode).toBe(201);

    const pharmacist = seedUser();
    setRole(pharmacist.id, "pharmacist");
    const med2 = seedMedicine(pharmacist.id, { quantity: 5 });
    const ok2 = await createReturn(pharmacist, returnBody(med2));
    expect(ok2.statusCode).toBe(201);

    const cashier = seedUser();
    setRole(cashier.id, "cashier");
    const med3 = seedMedicine(cashier.id, { quantity: 5 });
    const denied = await createReturn(cashier, returnBody(med3));
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error).toMatch(/permission/i);

    // Cashiers can still read the list.
    const list = await app.inject({
      method: "GET",
      url: "/api/purchase-returns",
      headers: auth(cashier),
    });
    expect(list.statusCode).toBe(200);
  });
});

// ===========================================================================
// Accounting idempotency + sales-return parity
// ===========================================================================
describe("accounting", () => {
  it("posting the same (sourceType, sourceId) again is idempotent", async () => {
    const u = seedUser();
    const med = seedMedicine(u.id, { quantity: 10 });
    const res = await createReturn(u, returnBody(med));
    const ret = res.json().data;

    const entries = journalEntries(u.id, "purchase_return", ret.id);
    expect(entries).toHaveLength(1);

    const again = await post(u.id, {
      date: RETURN_DATE,
      sourceType: "purchase_return",
      sourceId: ret.id,
      lines: [
        { code: "CASH", debit: 1 },
        { code: "SALES", credit: 1 },
      ],
    });
    expect(again.alreadyPosted).toBe(true);
    expect(again.entryId).toBe(entries[0].id);
    expect(journalEntries(u.id, "purchase_return", ret.id)).toHaveLength(1);
  });

  it("keeps the trial balance balanced after a return chain", async () => {
    const u = seedUser();
    const med = seedMedicine(u.id, { quantity: 12 });
    await createReturn(u, returnBody(med, { refundMode: "cash" }));
    await createReturn(u, returnBody(med, { refundMode: "credit" }));

    const rows = all<{ debit: number; credit: number }>(
      `SELECT coalesce(sum(jl.debit), 0) AS debit, coalesce(sum(jl.credit), 0) AS credit
       FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
       WHERE je.created_by = ? AND je.source_type = 'purchase_return'`,
      u.id
    );
    expect(rows[0].debit).toBeCloseTo(rows[0].credit, 2);
    expect(rows[0].debit).toBeCloseTo(400, 2);
  });
});

// ===========================================================================
// Bill linkage, refund override, validation edge cases, list clamp, parity
// ===========================================================================
describe("purchase return linkage & parity", () => {
  it("links to the purchase bill and inherits its supplier when none is given", async () => {
    const u = seedUser();
    const med = seedMedicine(u.id, { quantity: 10 });
    const supplierId = seedSupplier(u.id, "Bill Supplier");

    const billRes = await app.inject({
      method: "POST",
      url: "/api/purchases",
      headers: auth(u),
      payload: {
        billNo: `LINK-${nanoid(6)}`,
        billDate: RETURN_DATE,
        items: [
          {
            medicineId: med.medicineId,
            medicineName: "Test Med",
            batchNo: `LB-${nanoid(4)}`,
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
        amountPaid: 0,
        paymentMode: "credit",
        supplierId,
      },
    });
    expect(billRes.statusCode).toBe(201);
    const bill = billRes.json().data;
    // Unpaid credit purchase → balance grew by the unpaid portion.
    expect(getSupplierBalance(supplierId)).toBeCloseTo(55.36, 2);

    const res = await createReturn(
      u,
      returnBody(med, {
        purchaseBillId: bill.id,
        // The bill created a second batch, so the lot must be explicit here.
        items: [{ medicineId: med.medicineId, batchId: med.batchId, quantity: 2, rate: 100 }],
      })
    );
    expect(res.statusCode).toBe(201);
    const ret = res.json().data;
    expect(ret.purchaseBillId).toBe(bill.id);
    expect(ret.supplierId).toBe(supplierId); // inherited from the bill
    expect(ret.supplierName).toBe("Bill Supplier");
    // Cash refund → outstanding dues unchanged (documented balance rule).
    expect(getSupplierBalance(supplierId)).toBeCloseTo(55.36, 2);
  });

  it("honours an explicit refundAmount with a proportional GST journal split", async () => {
    const u = seedUser();
    const med = seedMedicine(u.id, { quantity: 10 });
    const supplierId = seedSupplier(u.id);
    setSupplierBalance(supplierId, 500);

    const res = await createReturn(
      u,
      returnBody(med, { supplierId, refundMode: "credit", refundAmount: 50 })
    );
    expect(res.statusCode).toBe(201);
    const ret = res.json().data;
    expect(ret.refundAmount).toBeCloseTo(50, 2);
    expect(getSupplierBalance(supplierId)).toBeCloseTo(450, 2); // credit → -= 50

    const [entry] = journalEntries(u.id, "purchase_return", ret.id);
    const lines = entryLines(entry.id);
    const share = Math.round(((50 * ret.totalGst) / ret.grandTotal) * 100) / 100;
    expect(lines.find((l) => l.code === "GST_INPUT")!.credit).toBeCloseTo(share, 2);
    expect(lines.find((l) => l.code === "PURCHASE_RETURNS")!.credit).toBeCloseTo(50 - share, 2);
    expect(lines.find((l) => l.code === "AP")!.debit).toBeCloseTo(50, 2);
    const creditSum = lines.reduce((s, l) => s + l.credit, 0);
    expect(creditSum).toBeCloseTo(50, 2);
  });

  it("rejects non-positive / fractional quantities with 400 validation", async () => {
    const u = seedUser();
    const med = seedMedicine(u.id, { quantity: 5 });

    const zero = await createReturn(
      u,
      returnBody(med, { items: [{ medicineId: med.medicineId, quantity: 0, rate: 10 }] })
    );
    expect(zero.statusCode).toBe(400);
    expect(zero.json().error).toBe("Validation error");

    const fractional = await createReturn(
      u,
      returnBody(med, { items: [{ medicineId: med.medicineId, quantity: 1.5, rate: 10 }] })
    );
    expect(fractional.statusCode).toBe(400);
    expect(all("SELECT id FROM purchase_returns WHERE created_by = ?", u.id)).toHaveLength(0);
  });

  it("list clamps the limit to 100 and always reports total/page", async () => {
    const u = seedUser();
    const med = seedMedicine(u.id, { quantity: 30 });
    await createReturn(u, returnBody(med));
    await createReturn(u, returnBody(med));

    const res = await app.inject({
      method: "GET",
      url: "/api/purchase-returns?limit=999&page=1",
      headers: auth(u),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.limit).toBe(100);
    expect(body.page).toBe(1);
    expect(body.total).toBe(2);
    expect(body.data).toHaveLength(2);
  });

  it("shape parity with the sales-returns API: envelope, item fields, distinct prefixes", async () => {
    const u = seedUser();
    const med = seedMedicine(u.id, { quantity: 10 });

    // Sales side: invoice → sales return (RET- series).
    const invRes = await app.inject({
      method: "POST",
      url: "/api/invoices",
      headers: auth(u),
      payload: {
        date: RETURN_DATE,
        subtotal: 90.48,
        totalGst: 4.76,
        cgst: 2.38,
        sgst: 2.38,
        grandTotal: 95.24,
        amountPaid: 95.24,
        paymentMode: "cash",
        discountAmount: 0,
        items: [
          {
            medicineId: med.medicineId,
            medicineName: "Test Med",
            batchId: med.batchId,
            quantity: 1,
            rate: 95.24,
            amount: 95.24,
            gstRate: "5",
            gstAmount: 4.76,
            cgst: 2.38,
            sgst: 2.38,
            mrp: 100,
          },
        ],
      },
    });
    expect(invRes.statusCode).toBe(201);
    const inv = invRes.json().data;

    const salesRetRes = await app.inject({
      method: "POST",
      url: "/api/returns",
      headers: auth(u),
      payload: {
        invoiceId: inv.id,
        refundMode: "cash",
        items: [
          {
            medicineId: med.medicineId,
            medicineName: "Test Med",
            batchId: med.batchId,
            quantity: 1,
            rate: 95.24,
            amount: 95.24,
            gstRate: "5",
            gstAmount: inv.totalGst,
            refundAmount: inv.grandTotal,
          },
        ],
        subtotal: inv.subtotal,
        totalGst: inv.totalGst,
        grandTotal: inv.grandTotal,
        refundAmount: inv.grandTotal,
      },
    });
    expect(salesRetRes.statusCode).toBe(201);

    const purchaseRetRes = await createReturn(u, returnBody(med));
    expect(purchaseRetRes.statusCode).toBe(201);

    const sr = salesRetRes.json();
    const pr = purchaseRetRes.json();
    // Same envelope.
    expect(sr.success).toBe(true);
    expect(pr.success).toBe(true);
    expect(Array.isArray(sr.data.items)).toBe(true);
    expect(Array.isArray(pr.data.items)).toBe(true);
    // Distinct, unique series.
    expect(sr.data.returnNo).toMatch(/^RET-\d{4}-\d{6}$/);
    expect(pr.data.returnNo).toMatch(/^PR-\d{4}-\d{6}$/);
    // Same item field vocabulary.
    for (const key of [
      "medicineId",
      "batchId",
      "quantity",
      "rate",
      "amount",
      "gstRate",
      "gstAmount",
      "cgst",
      "sgst",
      "refundAmount",
    ]) {
      expect(sr.data.items[0]).toHaveProperty(key);
      expect(pr.data.items[0]).toHaveProperty(key);
    }
    // Both post a balanced journal for their source.
    expect(journalEntries(u.id, "sales_return", sr.data.id)).toHaveLength(1);
    expect(journalEntries(u.id, "purchase_return", pr.data.id)).toHaveLength(1);
  });
});
