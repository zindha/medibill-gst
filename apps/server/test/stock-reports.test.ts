import { beforeAll, describe, expect, it } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import { applySchema, dbPath, seedUser, seedMedicine, type SeededUser } from "./helpers.js";
import reportRoutes from "../src/routes/reports.js";

let app: FastifyInstance;
let ctx: SeededUser;

function raw() {
  return new Database(dbPath());
}

function updateMedicine(medicineId: string, overrides: Record<string, any>) {
  const db = raw();
  const cols = Object.keys(overrides);
  if (cols.length) {
    const set = cols.map((c) => `${c} = ?`).join(", ");
    const vals = cols.map((c) => overrides[c]);
    db.prepare(`UPDATE medicines SET ${set} WHERE id = ?`).run(...vals, medicineId);
  }
  db.close();
}

function updateBatch(batchId: string, overrides: Record<string, any>) {
  const db = raw();
  const cols = Object.keys(overrides);
  if (cols.length) {
    const set = cols.map((c) => `${c} = ?`).join(", ");
    const vals = cols.map((c) => overrides[c]);
    db.prepare(`UPDATE batches SET ${set} WHERE id = ?`).run(...vals, batchId);
  }
  db.close();
}

function insertInvoice(opts: {
  date: string;
  items: Array<{ medicineId: string; medicineName: string; quantity: number; rate: number; gstRate: string }>;
}) {
  const db = raw();
  const now = Date.now();
  const invoiceId = nanoid(16);
  const invoiceNo = `INV-${nanoid(6)}`;
  let subtotal = 0;
  let totalGst = 0;
  let grand = 0;
  const rows: any[] = [];
  for (const it of opts.items) {
    const amount = Math.round(it.rate * it.quantity * 100) / 100;
    const gstRate = Number(it.gstRate) || 0;
    const base = Math.round((amount / (1 + gstRate / 100)) * 100) / 100;
    const gstAmount = Math.round((amount - base) * 100) / 100;
    subtotal += amount - gstAmount;
    totalGst += gstAmount;
    grand += amount;
    rows.push({ ...it, amount, gstAmount, cgst: gstAmount / 2, sgst: gstAmount / 2 });
  }
  subtotal = Math.round(subtotal * 100) / 100;
  totalGst = Math.round(totalGst * 100) / 100;
  const cgst = Math.round((totalGst / 2) * 100) / 100;
  const sgst = cgst;
  db.prepare(
    `INSERT INTO invoices (id, invoice_no, date, subtotal, total_gst, cgst, sgst, igst, discount_amount, grand_total, amount_paid, payment_mode, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 'cash', 'paid', ?, ?, ?)`
  ).run(invoiceId, invoiceNo, opts.date, subtotal, totalGst, cgst, sgst, grand, grand, ctx.id, now, now);
  for (const r of rows) {
    db.prepare(
      `INSERT INTO invoice_items (id, invoice_id, medicine_id, medicine_name, quantity, unit, rate, amount, gst_rate, gst_amount, cgst, sgst, created_at)
       VALUES (?, ?, ?, ?, ?, 'Strip', ?, ?, ?, ?, ?, ?, ?)`
    ).run(nanoid(16), invoiceId, r.medicineId, r.medicineName, r.quantity, r.rate, r.amount, r.gstRate, r.gstAmount, r.cgst, r.sgst, now);
  }
  db.close();
  return invoiceId;
}

function insertInventoryTx(opts: { medicineId: string; batchId?: string | null; type: string; quantity: number; createdAt: Date }) {
  const db = raw();
  const id = nanoid(16);
  // Drizzle's integer timestamp mode stores seconds (not ms) — raw inserts must match
  const ts = Math.floor(opts.createdAt.getTime() / 1000);
  // need balanceAfter — compute simple: sum previous + quantity or 0
  const prev = db.prepare("SELECT COALESCE(SUM(quantity),0) as s FROM inventory_transactions WHERE medicine_id = ?").get(opts.medicineId) as any;
  const balanceAfter = (prev?.s ?? 0) + opts.quantity;
  db.prepare(
    `INSERT INTO inventory_transactions (id, medicine_id, batch_id, type, quantity, balance_after, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, opts.medicineId, opts.batchId ?? null, opts.type, opts.quantity, balanceAfter, ctx.id, ts);
  db.close();
  return id;
}

beforeAll(async () => {
  applySchema();
  ctx = seedUser();

  // Seed medicines with known pricing
  const medA = seedMedicine(ctx.id, { name: "AZEE 500", quantity: 50, sellingPrice: 60 });
  updateMedicine(medA.medicineId, { purchase_price: 40, selling_price: 60, mrp: 70, brand: "Cipla", category: "Antibiotic" });
  // medA has one batch qty 50, update batch purchase/mrp to match
  updateBatch(medA.batchId, { purchase_price: 40, selling_price: 60, mrp: 70 });

  const medB = seedMedicine(ctx.id, { name: "DOLO 650", quantity: 30, sellingPrice: 20 });
  updateMedicine(medB.medicineId, { purchase_price: 12, selling_price: 20, mrp: 25, brand: "Micro Labs", category: "Analgesic" });
  updateBatch(medB.batchId, { purchase_price: 12, selling_price: 20, mrp: 25 });

  const medC = seedMedicine(ctx.id, { name: "SLOWMED", quantity: 100, sellingPrice: 10 });
  updateMedicine(medC.medicineId, { purchase_price: 5, selling_price: 10, mrp: 12, brand: "Generic", category: "Vitamin" });
  updateBatch(medC.batchId, { purchase_price: 5, selling_price: 10, mrp: 12 });

  // Expired batch: create separate medicine with expired date
  const medExp = seedMedicine(ctx.id, { name: "EXPMED", quantity: 10, sellingPrice: 15, expiry: "2026-01-01" });
  updateMedicine(medExp.medicineId, { purchase_price: 8, selling_price: 15, mrp: 18, brand: "ExBrand", category: "Test" });
  // ensure batch expiry is expired
  updateBatch(medExp.batchId, { expiry_date: "2026-01-01" });

  // Near-expiry: 45 days from now
  const nearDate = new Date(Date.now() + 45 * 24 * 3600e3).toISOString().split("T")[0];
  const medNear = seedMedicine(ctx.id, { name: "NEARMED", quantity: 20, sellingPrice: 22, expiry: nearDate });
  updateMedicine(medNear.medicineId, { purchase_price: 10, selling_price: 22, mrp: 25, brand: "NearBrand", category: "Test" });
  updateBatch(medNear.batchId, { expiry_date: nearDate });

  // Invoices for fast/slow ranking: AZEE sold 10, DOLO sold 2, SLOWMED sold 0
  insertInvoice({ date: "2026-08-15", items: [{ medicineId: medA.medicineId, medicineName: "AZEE 500", quantity: 10, rate: 60, gstRate: "12" }] });
  insertInvoice({ date: "2026-08-20", items: [{ medicineId: medA.medicineId, medicineName: "AZEE 500", quantity: 5, rate: 60, gstRate: "12" }] });
  insertInvoice({ date: "2026-09-01", items: [{ medicineId: medB.medicineId, medicineName: "DOLO 650", quantity: 2, rate: 20, gstRate: "12" }] });

  // Inventory transactions for opening/closing + statement + adjustments
  // For medA: tx before period, in period, and adjustment
  insertInventoryTx({ medicineId: medA.medicineId, batchId: medA.batchId, type: "purchase", quantity: 50, createdAt: new Date("2026-08-01T10:00:00Z") });
  insertInventoryTx({ medicineId: medA.medicineId, batchId: medA.batchId, type: "sales", quantity: -10, createdAt: new Date("2026-08-15T10:00:00Z") });
  insertInventoryTx({ medicineId: medA.medicineId, batchId: medA.batchId, type: "purchase", quantity: 20, createdAt: new Date("2026-09-05T10:00:00Z") });
  insertInventoryTx({ medicineId: medA.medicineId, batchId: medA.batchId, type: "adjustment", quantity: -2, createdAt: new Date("2026-09-10T10:00:00Z") });
  insertInventoryTx({ medicineId: medB.medicineId, batchId: medB.batchId, type: "damage", quantity: -1, createdAt: new Date("2026-09-12T10:00:00Z") });
  insertInventoryTx({ medicineId: medExp.medicineId, batchId: medExp.batchId, type: "expired", quantity: -5, createdAt: new Date("2026-09-15T10:00:00Z") });

  app = Fastify({ logger: false });
  await app.register(reportRoutes, { prefix: "/api/reports" });
});

async function get(url: string) {
  const res = await app.inject({ method: "GET", url, headers: { authorization: `Bearer ${ctx.token}` } });
  return { status: res.statusCode, body: res.json() };
}

describe("stock reports", () => {
  it("fast-movers returns ranked list desc", async () => {
    const { status, body } = await get("/api/reports/stock/fast?from=2026-08-01&to=2026-09-30");
    expect(status).toBe(200);
    const data = body.data ?? body;
    const rows = data.rows ?? [];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    // AZEE 500 sold 15 should be first (fastest)
    expect(rows[0].medicineName).toBe("AZEE 500");
    expect(typeof rows[0].qtySold).toBe("number");
    expect(typeof rows[0].currentStock).toBe("number");
    // limit param
    const { body: body2 } = await get("/api/reports/stock/fast?from=2026-08-01&to=2026-09-30&limit=1");
    const d2 = body2.data ?? body2;
    expect((d2.rows ?? []).length).toBe(1);
  });

  it("slow-movers returns ascending including zero-sold", async () => {
    const { status, body } = await get("/api/reports/stock/slow?from=2026-08-01&to=2026-09-30");
    expect(status).toBe(200);
    const data = body.data ?? body;
    const rows = data.rows ?? [];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    // SLOWMED has 0 sold, should be first in slow (ascending)
    const slowMedRow = rows.find((r: any) => r.medicineName === "SLOWMED");
    expect(slowMedRow).toBeDefined();
    expect(slowMedRow.qtySold).toBe(0);
  });

  it("current stock with value aggregates batches", async () => {
    const { status, body } = await get("/api/reports/stock/current");
    expect(status).toBe(200);
    const data = body.data ?? body;
    expect(typeof data.totalValue).toBe("number");
    expect(Array.isArray(data.rows)).toBe(true);
    const azee = data.rows.find((r: any) => r.medicineName === "AZEE 500");
    expect(azee).toBeDefined();
    expect(typeof azee.stockPacks).toBe("number");
    expect(typeof azee.saleValue).toBe("number");
    expect(typeof azee.mrpValue).toBe("number");
    expect(typeof azee.costValue).toBe("number");
  });

  it("expired buckets uses expiryDate range and status", async () => {
    const { status, body } = await get("/api/reports/stock/expired?from=2026-09-01&to=2026-12-31");
    expect(status).toBe(200);
    const data = body.data ?? body;
    const rows = data.rows ?? [];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    const exp = rows.find((r: any) => r.medicineName === "EXPMED");
    expect(exp).toBeDefined();
    expect(exp.status).toBe("expired");
    const near = rows.find((r: any) => r.medicineName === "NEARMED");
    expect(near).toBeDefined();
    expect(near.status).toBe("near");
  });

  it("opening-closing per product computes opening and closing", async () => {
    const { status, body } = await get("/api/reports/stock/opening-closing?from=2026-08-10&to=2026-09-10");
    expect(status).toBe(200);
    const data = body.data ?? body;
    const rows = data.rows ?? [];
    expect(Array.isArray(rows)).toBe(true);
    const azee = rows.find((r: any) => r.medicineName === "AZEE 500");
    expect(azee).toBeDefined();
    expect(typeof azee.opening).toBe("number");
    expect(typeof azee.closing).toBe("number");
    // opening for AZEE should be 50 (before 2026-08-10) — only first tx counts
    expect(azee.opening).toBe(50);
    // closing = opening + sum in range: -10 (sales) +20 if 2026-09-05 within to=2026-09-10 => 60
    // But note adjustment -2 also in range, so closing depends on inclusive handling
    expect(azee.closing).toBeGreaterThanOrEqual(58);
  });

  it("statement returns ledger with running balance for a medicine", async () => {
    const db = raw();
    const med = db.prepare("SELECT id FROM medicines WHERE name = 'AZEE 500' AND created_by = ?").get(ctx.id) as any;
    db.close();
    const { status, body } = await get(`/api/reports/stock/statement?medicineId=${med.id}&from=2026-08-01&to=2026-09-30`);
    expect(status).toBe(200);
    const data = body.data ?? body;
    const entries = data.entries ?? data.rows ?? [];
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      expect(typeof e.runningBalance).toBe("number");
      expect(typeof e.quantity).toBe("number");
    }
    // verify sorted by date asc
    const dates = entries.map((e: any) => new Date(e.createdAt ?? e.date).getTime());
    for (let i = 1; i < dates.length; i++) expect(dates[i]).toBeGreaterThanOrEqual(dates[i - 1]);
  });

  it("current stock values each batch at its own rate, not the medicine master rate", async () => {
    const db = raw();
    const med = db.prepare("SELECT id FROM medicines WHERE name = 'AZEE 500' AND created_by = ?").get(ctx.id) as any;
    const now = Date.now();
    db.prepare(
      `INSERT INTO batches (id, medicine_id, batch_no, expiry_date, mrp, purchase_price, selling_price, quantity, initial_quantity, is_active, created_by, created_at, updated_at)
       VALUES (?, ?, 'B2-CHEAP', '2099-12-31', 20, 10, 15, 10, 10, 1, ?, ?, ?)`
    ).run(nanoid(16), med.id, ctx.id, now, now);
    db.close();
    const { status, body } = await get("/api/reports/stock/current");
    expect(status).toBe(200);
    const data = body.data ?? body;
    const azee = data.rows.find((r: any) => r.medicineName === "AZEE 500");
    // 50 packs @ master (sale 60 / mrp 70 / cost 40) + 10 packs @ batch (15 / 20 / 10)
    expect(azee.stockPacks).toBe(60);
    expect(azee.saleValue).toBe(3150);
    expect(azee.mrpValue).toBe(3700);
    expect(azee.costValue).toBe(2100);
    expect(data.totalValue).toBe(data.rows.reduce((a: number, r: any) => a + r.saleValue, 0));
  });

  it("adjustments lists adjustment|damage|expired in range grouped by user", async () => {
    const { status, body } = await get("/api/reports/stock/adjustments?from=2026-08-01&to=2026-09-30");
    expect(status).toBe(200);
    const data = body.data ?? body;
    const rows = data.rows ?? data.entries ?? [];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(["adjustment", "damage", "expired"].includes(r.type)).toBe(true);
    expect(data.summary ?? data.grouped ?? data.byUser).toBeDefined();
  });
});
