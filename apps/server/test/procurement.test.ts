import { beforeAll, describe, expect, it } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import { applySchema, dbPath, seedUser, seedMedicine, type SeededUser } from "./helpers.js";
import procurementRoutes from "../src/routes/procurement.js";
import reportRoutes from "../src/routes/reports.js";
import { effectiveCost } from "../src/services/procurement.js";

let app: FastifyInstance;
let ctx: SeededUser; // tenant A (main)
let other: SeededUser; // tenant B (isolation checks)

const DAY = 86400000;
const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString().split("T")[0];

function raw() {
  return new Database(dbPath());
}

interface SeededSupplier {
  id: string;
  name: string;
}

function seedSupplier(
  name: string,
  opts: {
    owner?: string;
    paymentTerms?: string | null;
    creditLimit?: number | null;
    balance?: number | null;
  } = {}
): SeededSupplier {
  const db = raw();
  const id = nanoid(16);
  const now = Date.now();
  db.prepare(
    `INSERT INTO suppliers (id, name, gstin, payment_terms, credit_limit, balance, is_active, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
  ).run(
    id,
    name,
    `GSTIN-${nanoid(6)}`,
    opts.paymentTerms ?? null,
    opts.creditLimit ?? null,
    opts.balance ?? 0,
    opts.owner ?? ctx.id,
    now,
    now
  );
  db.close();
  return { id, name };
}

function insertBatch(opts: {
  medicineId: string;
  batchNo: string;
  expiryDate: string;
  supplierId?: string | null;
  quantity?: number;
}): string {
  const db = raw();
  const id = nanoid(16);
  const now = Date.now();
  db.prepare(
    `INSERT INTO batches (id, medicine_id, batch_no, expiry_date, mrp, purchase_price, selling_price, quantity, initial_quantity, supplier_id, is_active, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, 100, 80, 95, ?, ?, ?, 1, ?, ?, ?)`
  ).run(
    id,
    opts.medicineId,
    opts.batchNo,
    opts.expiryDate,
    opts.quantity ?? 0,
    opts.quantity ?? 0,
    opts.supplierId ?? null,
    ctx.id,
    now,
    now
  );
  db.close();
  return id;
}

function insertPurchaseBill(opts: {
  billNo?: string;
  billDate: string;
  supplierId?: string | null;
  supplierName?: string | null;
  items: Array<{
    medicineId: string;
    medicineName: string;
    quantity: number;
    rate: number;
    freeQuantity?: number;
    discountAmount?: number;
    batchNo?: string | null;
    expiryDate?: string | null;
  }>;
}): { id: string; billNo: string; grand: number } {
  const db = raw();
  const now = Date.now();
  const billId = nanoid(16);
  const billNo = opts.billNo ?? `PB-${nanoid(6)}`;
  let grand = 0;
  const rows: any[] = [];
  for (const it of opts.items) {
    const amount = Math.round(it.rate * it.quantity * 100) / 100;
    grand += amount;
    rows.push({ ...it, amount });
  }
  grand = Math.round(grand * 100) / 100;
  db.prepare(
    `INSERT INTO purchase_bills (id, bill_no, supplier_id, supplier_name, bill_date, subtotal, total_gst, grand_total, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`
  ).run(
    billId,
    billNo,
    opts.supplierId ?? null,
    opts.supplierName ?? null,
    opts.billDate,
    grand,
    grand,
    ctx.id,
    now,
    now
  );
  for (const r of rows) {
    db.prepare(
      `INSERT INTO purchase_bill_items (id, purchase_bill_id, medicine_id, medicine_name, batch_no, expiry_date, quantity, free_quantity, rate, amount, gst_rate, gst_amount, cgst, sgst, discount_amount, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '0', 0, 0, 0, ?, ?)`
    ).run(
      nanoid(16),
      billId,
      r.medicineId,
      r.medicineName,
      r.batchNo ?? null,
      r.expiryDate ?? null,
      r.quantity,
      r.freeQuantity ?? 0,
      r.rate,
      r.amount,
      r.discountAmount ?? 0,
      now
    );
  }
  db.close();
  return { id: billId, billNo, grand };
}

function insertPurchaseReturn(opts: {
  billId: string;
  date: string;
  supplierId: string;
  supplierName: string;
  items: Array<{ medicineId: string; medicineName: string; quantity: number; rate: number }>;
}): void {
  const db = raw();
  const now = Date.now();
  const retId = nanoid(16);
  let grand = 0;
  for (const it of opts.items) grand += it.quantity * it.rate;
  db.prepare(
    `INSERT INTO purchase_returns (id, return_no, purchase_bill_id, supplier_id, supplier_name, date, subtotal, total_gst, grand_total, refund_amount, status, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'completed', ?, ?)`
  ).run(
    retId,
    `PR-${nanoid(6)}`,
    opts.billId,
    opts.supplierId,
    opts.supplierName,
    opts.date,
    grand,
    grand,
    grand,
    ctx.id,
    now
  );
  for (const r of opts.items) {
    db.prepare(
      `INSERT INTO purchase_return_items (id, return_id, medicine_id, medicine_name, quantity, rate, amount, gst_rate, gst_amount, cgst, sgst, refund_amount, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, '0', 0, 0, 0, ?, ?)`
    ).run(nanoid(16), retId, r.medicineId, r.medicineName, r.quantity, r.rate, r.quantity * r.rate, r.quantity * r.rate, now);
  }
  db.close();
}

function insertPayment(opts: {
  date: string;
  amount: number;
  supplierId: string;
  reference: string;
}): void {
  const db = raw();
  const now = Date.now();
  db.prepare(
    `INSERT INTO payments (id, date, type, amount, reference, supplier_id, description, payment_mode, voided, created_by, created_at)
     VALUES (?, ?, 'paid', ?, ?, ?, ?, 'upi', 0, ?, ?)`
  ).run(nanoid(16), opts.date, opts.amount, opts.reference, opts.supplierId, "Supplier payment", ctx.id, now);
  db.close();
}

function insertQuote(opts: {
  supplierId: string;
  medicineId: string;
  quotedRate: number;
  quoteDate: string;
  notes?: string | null;
  owner?: string;
}): string {
  const db = raw();
  const id = nanoid(16);
  db.prepare(
    `INSERT INTO supplier_quotes (id, created_by, supplier_id, medicine_id, quoted_rate, quote_date, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    opts.owner ?? ctx.id,
    opts.supplierId,
    opts.medicineId,
    opts.quotedRate,
    opts.quoteDate,
    opts.notes ?? null,
    Date.now()
  );
  db.close();
  return id;
}

// ─── Seeded fixtures ────────────────────────────────────────────────────────
const supAlpha: SeededSupplier = { id: "", name: "SUP-ALPHA" };
const supBeta: SeededSupplier = { id: "", name: "SUP-BETA" };
const supGamma: SeededSupplier = { id: "", name: "SUP-GAMMA" }; // never sells MED1
let supForeign: SeededSupplier = { id: "", name: "SUP-FOREIGN" };

let med1 = ""; // PROC-MED-ONE — the compared medicine
let med2 = ""; // PROC-MED-TWO — only ever bought from GAMMA
let medShort = ""; // PROC-SHORT — shortbook row WITH history
let medNoHist = ""; // PROC-NOHIST — shortbook row WITHOUT history

let alphaBill1No = "";
let alphaBill3No = "";
let alphaBill1Id = "";

beforeAll(async () => {
  applySchema();
  ctx = seedUser();
  other = seedUser();

  Object.assign(supAlpha, seedSupplier("SUP-ALPHA", {
    paymentTerms: "Net 30",
    creditLimit: 50000,
    balance: 12500,
  }));
  Object.assign(supBeta, seedSupplier("SUP-BETA", { paymentTerms: "Net 15", balance: 4200 }));
  Object.assign(supGamma, seedSupplier("SUP-GAMMA"));
  supForeign = seedSupplier("SUP-FOREIGN", { owner: other.id });

  med1 = seedMedicine(ctx.id, { name: "PROC-MED-ONE" }).medicineId;
  med2 = seedMedicine(ctx.id, { name: "PROC-MED-TWO" }).medicineId;
  medShort = seedMedicine(ctx.id, { name: "PROC-SHORT", quantity: 5 }).medicineId;
  medNoHist = seedMedicine(ctx.id, { name: "PROC-NOHIST", quantity: 5 }).medicineId;

  const db = raw();
  db.prepare(`UPDATE medicines SET reorder_level = 100, min_quantity = 50 WHERE id = ?`).run(medShort);
  db.prepare(`UPDATE medicines SET reorder_level = 100, min_quantity = 50 WHERE id = ?`).run(medNoHist);
  db.close();

  // Batches: one expiring within 365d (supplier ALPHA), one far away.
  insertBatch({ medicineId: med1, batchNo: "BATCH-EXP", expiryDate: inDays(100), supplierId: supAlpha.id });
  insertBatch({ medicineId: med1, batchNo: "BATCH-FAR", expiryDate: "2099-12-31", supplierId: supAlpha.id });

  // Purchase history for MED1 (cheapest-first expectations below).
  const bill1 = insertPurchaseBill({
    billDate: "2026-08-01",
    supplierId: supAlpha.id,
    supplierName: supAlpha.name,
    items: [{ medicineId: med1, medicineName: "PROC-MED-ONE", quantity: 10, rate: 120, batchNo: "BATCH-FAR" }],
  });
  alphaBill1No = bill1.billNo;
  alphaBill1Id = bill1.id;

  insertPurchaseBill({
    billDate: "2026-08-15",
    supplierId: supBeta.id,
    supplierName: supBeta.name,
    items: [
      { medicineId: med1, medicineName: "PROC-MED-ONE", quantity: 10, rate: 110, freeQuantity: 1 },
    ],
  });

  const bill3 = insertPurchaseBill({
    billDate: "2026-09-10",
    supplierId: supAlpha.id,
    supplierName: supAlpha.name,
    items: [
      { medicineId: med1, medicineName: "PROC-MED-ONE", quantity: 5, rate: 118, batchNo: "BATCH-EXP" },
    ],
  });
  alphaBill3No = bill3.billNo;

  insertPurchaseBill({
    billDate: "2026-09-12",
    supplierId: supBeta.id,
    supplierName: supBeta.name,
    items: [{ medicineId: med1, medicineName: "PROC-MED-ONE", quantity: 8, rate: 112 }],
  });

  // GAMMA never sells MED1 (only MED2) — must be excluded from MED1 compare.
  insertPurchaseBill({
    billDate: "2026-09-01",
    supplierId: supGamma.id,
    supplierName: supGamma.name,
    items: [{ medicineId: med2, medicineName: "PROC-MED-TWO", quantity: 4, rate: 60 }],
  });

  // Shortbook medicine WITH history → gets a recommended supplier.
  insertPurchaseBill({
    billDate: "2026-09-05",
    supplierId: supBeta.id,
    supplierName: supBeta.name,
    items: [{ medicineId: medShort, medicineName: "PROC-SHORT", quantity: 10, rate: 50 }],
  });

  // Purchase return against ALPHA's first bill (2 of 10 units).
  insertPurchaseReturn({
    billId: alphaBill1Id,
    date: "2026-08-20",
    supplierId: supAlpha.id,
    supplierName: supAlpha.name,
    items: [{ medicineId: med1, medicineName: "PROC-MED-ONE", quantity: 2, rate: 120 }],
  });

  // Payments: 24 and 20 days after their bills → avg 22 days.
  insertPayment({ date: "2026-08-25", amount: 1200, supplierId: supAlpha.id, reference: alphaBill1No });
  insertPayment({ date: "2026-09-30", amount: 590, supplierId: supAlpha.id, reference: alphaBill3No });

  // Fresh manual quote from BETA undercutting their older purchase rates.
  insertQuote({
    supplierId: supBeta.id,
    medicineId: med1,
    quotedRate: 100,
    quoteDate: "2026-09-20",
    notes: "WhatsApp quote",
  });

  app = Fastify({ logger: false });
  await app.register(procurementRoutes, { prefix: "/api/procurement" });
  await app.register(reportRoutes, { prefix: "/api/reports" });
});

async function get(url: string, user: SeededUser = ctx) {
  const res = await app.inject({
    method: "GET",
    url,
    headers: { authorization: `Bearer ${user.token}` },
  });
  return { status: res.statusCode, body: res.json() as any };
}

async function post(url: string, payload: unknown, user: SeededUser = ctx) {
  const res = await app.inject({
    method: "POST",
    url,
    headers: { authorization: `Bearer ${user.token}` },
    payload,
  });
  return { status: res.statusCode, body: res.json() as any };
}

// ─── effective cost ─────────────────────────────────────────────────────────

describe("effectiveCost", () => {
  it("spreads the discount and free units across every unit received", () => {
    const eff = effectiveCost(100, { quantity: 10, freeQuantity: 1, discountAmount: 50 });
    expect(eff.totalCost).toBe(950);
    // 950 / 11 units = 86.36 per unit actually received
    expect(eff.unitCost).toBe(86.36);
  });

  it("matches the worked example: Rs.995 / 11 units = Rs.90.45", () => {
    const eff = effectiveCost(100, { quantity: 10, freeQuantity: 1, discountAmount: 5 });
    expect(eff.totalCost).toBe(995);
    expect(eff.unitCost).toBe(90.45);
  });
});

// ─── rate history ───────────────────────────────────────────────────────────

describe("rate history", () => {
  it("returns purchases sorted ascending with source 'purchase'", async () => {
    const { status, body } = await get(`/api/procurement/rate-history?medicineId=${med1}`);
    expect(status).toBe(200);
    const rows: any[] = body.data.rows;
    const purchases = rows.filter((r) => r.source === "purchase");
    expect(purchases.length).toBe(4);
    // ascending by date
    for (let i = 1; i < purchases.length; i++) {
      expect(purchases[i].date >= purchases[i - 1].date).toBe(true);
    }
    expect(purchases[0].date).toBe("2026-08-01");
    expect(purchases[0].rate).toBe(120);
    // free-unit line: 110 * 10 / 11 = 100 effective
    const betaLine = purchases.find((r) => r.date === "2026-08-15");
    expect(betaLine.effectiveUnitCost).toBe(100);
    expect(purchases.every((r) => typeof r.billNo === "string")).toBe(true);
  });

  it("merges manual quotes with source 'quote'", async () => {
    const { status, body } = await get(`/api/procurement/rate-history?medicineId=${med1}`);
    expect(status).toBe(200);
    const rows: any[] = body.data.rows;
    const quotes = rows.filter((r) => r.source === "quote");
    expect(quotes.length).toBe(1);
    expect(quotes[0].rate).toBe(100);
    expect(quotes[0].supplierId).toBe(supBeta.id);
    expect(quotes[0].date).toBe("2026-09-20");
    expect(quotes[0].billNo).toBeNull();
    // whole timeline still ascending
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].date >= rows[i - 1].date).toBe(true);
    }
  });

  it("honours period + supplier filters and returns empty for no-history medicine", async () => {
    const { body } = await get(
      `/api/procurement/rate-history?medicineId=${med1}&supplierId=${supAlpha.id}&from=2026-09-01&to=2026-09-30`
    );
    const rows: any[] = body.data.rows;
    expect(rows.length).toBe(1);
    expect(rows[0].supplierId).toBe(supAlpha.id);
    expect(rows[0].date).toBe("2026-09-10");

    const empty = await get(`/api/procurement/rate-history?medicineId=${nanoid(16)}`);
    expect(empty.status).toBe(200);
    expect(empty.body.data.rows).toEqual([]);
    expect(empty.body.data.count).toBe(0);
  });
});

// ─── supplier comparison ────────────────────────────────────────────────────

describe("compare suppliers", () => {
  it("ranks suppliers cheapest-first with terms, outstanding and totals", async () => {
    const { status, body } = await get(
      `/api/procurement/compare?medicineId=${med1}&quantity=10`
    );
    expect(status).toBe(200);
    expect(body.data.medicineId).toBe(med1);
    expect(body.data.quantity).toBe(10);
    const quotes: any[] = body.data.quotes;
    expect(quotes.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < quotes.length; i++) {
      expect(quotes[i].unitCost).toBeGreaterThanOrEqual(quotes[i - 1].unitCost);
    }

    const betaPurchase = quotes.find(
      (q) => q.supplierId === supBeta.id && q.source === "purchase"
    );
    expect(betaPurchase.unitCost).toBe(112); // latest bill wins, not the 110 from August
    expect(betaPurchase.bills).toBe(2);
    expect(betaPurchase.terms).toBe("Net 15");
    expect(betaPurchase.outstanding).toBe(4200);
    expect(betaPurchase.estimatedCost).toBe(1120);

    const alphaPurchase = quotes.find(
      (q) => q.supplierId === supAlpha.id && q.source === "purchase"
    );
    expect(alphaPurchase.unitCost).toBe(118);
    expect(alphaPurchase.terms).toBe("Net 30");
    expect(alphaPurchase.creditLimit).toBe(50000);
    expect(alphaPurchase.outstanding).toBe(12500);
  });

  it("excludes suppliers without history for this medicine", async () => {
    const { body } = await get(`/api/procurement/compare?medicineId=${med1}`);
    const quotes: any[] = body.data.quotes;
    expect(quotes.some((q) => q.supplierId === supGamma.id)).toBe(false);
    expect(quotes.some((q) => q.source === "purchase")).toBe(true);
    expect(body.data.quotes.length).toBe(
      new Set(quotes.map((q) => `${q.supplierId}:${q.source}`)).size
    );
  });

  it("lets a fresh quote beat an older purchase rate", async () => {
    const { body } = await get(`/api/procurement/compare?medicineId=${med1}`);
    const quotes: any[] = body.data.quotes;
    const quoteRow = quotes.find((q) => q.source === "quote");
    expect(quoteRow).toBeDefined();
    expect(quoteRow.unitCost).toBe(100);
    expect(quoteRow.lastDate).toBe("2026-09-20");
    const quoteIdx = quotes.indexOf(quoteRow);
    const betaPurchaseIdx = quotes.findIndex(
      (q) => q.supplierId === supBeta.id && q.source === "purchase"
    );
    expect(quoteIdx).toBeLessThan(betaPurchaseIdx);
    expect(quotes[0]).toBe(quoteRow); // cheapest overall
  });

  it("400s without medicineId and returns empty for unknown medicine", async () => {
    const { status, body } = await get(`/api/procurement/compare`);
    expect(status).toBe(400);
    expect(body.error).toMatch(/medicineId/i);

    const unknown = await get(`/api/procurement/compare?medicineId=${nanoid(16)}`);
    expect(unknown.status).toBe(200);
    expect(unknown.body.data.quotes).toEqual([]);
  });
});

// ─── supplier metrics ───────────────────────────────────────────────────────

describe("supplier metrics", () => {
  const period = "from=2026-08-01&to=2026-09-30";

  it("computes totals, return rate and fill rate", async () => {
    const { status, body } = await get(
      `/api/procurement/suppliers/${supAlpha.id}/metrics?${period}`
    );
    expect(status).toBe(200);
    expect(body.data.supplierName).toBe("SUP-ALPHA");
    // bill1 (1200) + bill3 (590)
    expect(body.data.totals.totalPurchased).toBe(1790);
    expect(body.data.totals.totalPaid).toBe(1790);
    expect(body.data.totals.outstanding).toBe(12500);
    expect(body.data.metrics.billCount).toBe(2);
    expect(body.data.metrics.returnCount).toBe(1);
    expect(body.data.metrics.returnRatePct).toBe(50);
    expect(body.data.metrics.fillRatePct).toBe(50);
    expect(body.data.metrics.returnQtyPct).toBeCloseTo(13.33, 1);
    expect(body.data.bills.length).toBe(2);
    expect(body.data.paymentTerms).toBe("Net 30");
  });

  it("averages payment lag from bill date to paid date", async () => {
    const { body } = await get(
      `/api/procurement/suppliers/${supAlpha.id}/metrics?${period}`
    );
    // 2026-08-01 → 2026-08-25 = 24d, 2026-09-10 → 2026-09-30 = 20d → avg 22
    expect(body.data.metrics.avgPaymentDays).toBe(22);
  });

  it("values purchase lines whose batch expires within 365 days", async () => {
    const { body } = await get(
      `/api/procurement/suppliers/${supAlpha.id}/metrics?${period}`
    );
    // only the BATCH-EXP line (5 × 118) qualifies; BATCH-FAR (2099) does not
    expect(body.data.metrics.expiryRiskValue).toBe(590);
  });

  it("returns zeroed metrics for an empty period", async () => {
    const { status, body } = await get(
      `/api/procurement/suppliers/${supAlpha.id}/metrics?from=2030-01-01&to=2030-12-31`
    );
    expect(status).toBe(200);
    expect(body.data.metrics.billCount).toBe(0);
    expect(body.data.totals.totalPurchased).toBe(0);
    expect(body.data.metrics.avgPaymentDays).toBe(0);
    expect(body.data.metrics.expiryRiskValue).toBe(0);
    expect(body.data.bills).toEqual([]);
  });

  it("404s for a foreign supplier (metrics + expiry drill)", async () => {
    const m = await get(`/api/procurement/suppliers/${supForeign.id}/metrics`);
    expect(m.status).toBe(404);
    const e = await get(`/api/procurement/suppliers/${supForeign.id}/expiry-items`);
    expect(e.status).toBe(404);
    const missing = await get(`/api/procurement/suppliers/${nanoid(16)}/metrics`);
    expect(missing.status).toBe(404);
  });
});

// ─── expiry drill-down ──────────────────────────────────────────────────────

describe("supplier expiry drill-down", () => {
  it("returns batch-level rows expiring within 365 days", async () => {
    const { status, body } = await get(
      `/api/procurement/suppliers/${supAlpha.id}/expiry-items?from=2026-08-01&to=2026-09-30`
    );
    expect(status).toBe(200);
    const rows: any[] = body.data.rows;
    expect(rows.length).toBe(1);
    expect(rows[0].batchNo).toBe("BATCH-EXP");
    expect(rows[0].medicineName).toBe("PROC-MED-ONE");
    expect(rows[0].value).toBe(590);
    expect(rows[0].billNo).toBe(alphaBill3No);
    expect(rows[0].daysToExpiry).toBeGreaterThan(0);
    expect(body.data.totalValue).toBe(590);
  });
});

// ─── quotes CRUD + tenant isolation ─────────────────────────────────────────

describe("quotes CRUD", () => {
  it("rejects validation errors and foreign suppliers/medicines", async () => {
    const negative = await post(`/api/procurement/quotes`, {
      supplierId: supBeta.id,
      medicineId: med1,
      quotedRate: -1,
    });
    expect(negative.status).toBe(400);

    const foreignSupplier = await post(`/api/procurement/quotes`, {
      supplierId: supForeign.id,
      medicineId: med1,
      quotedRate: 90,
    });
    expect(foreignSupplier.status).toBe(404);

    const foreignMedicine = await post(`/api/procurement/quotes`, {
      supplierId: supBeta.id,
      medicineId: nanoid(16),
      quotedRate: 90,
    });
    expect(foreignMedicine.status).toBe(404);
  });

  it("creates and lists quotes tenant-scoped", async () => {
    const created = await post(`/api/procurement/quotes`, {
      supplierId: supAlpha.id,
      medicineId: med1,
      quotedRate: 105,
      quoteDate: "2026-09-21",
      notes: "phone quote",
    });
    expect(created.status).toBe(201);
    expect(created.body.data.quotedRate).toBe(105);
    expect(created.body.data.supplierName).toBe("SUP-ALPHA");

    const list = await get(`/api/procurement/quotes?medicineId=${med1}`);
    expect(list.status).toBe(200);
    const rows: any[] = list.body.data.rows;
    expect(rows.length).toBe(2); // seeded BETA quote + this one
    expect(rows.every((r) => r.medicineId === med1)).toBe(true);
    expect(rows.some((r) => r.quotedRate === 100)).toBe(true);
    expect(rows.some((r) => r.quotedRate === 105)).toBe(true);
  });

  it("isolates quotes across tenants", async () => {
    // tenant B sees none of tenant A's quotes
    const listB = await get(`/api/procurement/quotes`, other);
    expect(listB.status).toBe(200);
    expect(listB.body.data.rows).toEqual([]);

    // tenant B cannot quote against tenant A's supplier or medicine
    const postB = await post(
      `/api/procurement/quotes`,
      { supplierId: supAlpha.id, medicineId: med1, quotedRate: 50 },
      other
    );
    expect(postB.status).toBe(404);

    // tenant B's compare + rate history for A's medicine stay empty
    const compareB = await get(`/api/procurement/compare?medicineId=${med1}`, other);
    expect(compareB.body.data.quotes).toEqual([]);
    const historyB = await get(`/api/procurement/rate-history?medicineId=${med1}`, other);
    expect(historyB.body.data.rows).toEqual([]);

    // and tenant B's metrics for A's supplier are a 404
    const metricsB = await get(`/api/procurement/suppliers/${supAlpha.id}/metrics`, other);
    expect(metricsB.status).toBe(404);
  });
});

// ─── shortbook recommended supplier ─────────────────────────────────────────

describe("shortbook recommended supplier", () => {
  it("adds recommendedSupplier* fields without breaking existing rows", async () => {
    const { status, body } = await get(`/api/reports/order/shortbook`);
    expect(status).toBe(200);
    const rows: any[] = body.data.rows;
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);

    const short = rows.find((r) => r.name === "PROC-SHORT");
    expect(short).toBeDefined();
    // existing shape intact
    expect(typeof short.stock).toBe("number");
    expect(typeof short.shortagePercent).toBe("number");
    expect(short.orderQty).toBe(95);
    // additive recommendation fields
    expect(short.recommendedSupplierId).toBe(supBeta.id);
    expect(short.recommendedSupplierName).toBe("SUP-BETA");
    expect(short.unitCost).toBe(50);

    // medicine without procurement history keeps NO recommendation keys
    const noHist = rows.find((r) => r.name === "PROC-NOHIST");
    expect(noHist).toBeDefined();
    expect("recommendedSupplierId" in noHist).toBe(false);
    expect("recommendedSupplierName" in noHist).toBe(false);
    expect("unitCost" in noHist).toBe(false);
  });
});
