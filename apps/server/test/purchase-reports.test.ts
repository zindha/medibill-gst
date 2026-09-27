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

function seedSupplier(name: string): string {
  const db = raw();
  const id = nanoid(16);
  const now = Date.now();
  db.prepare(
    `INSERT INTO suppliers (id, name, gstin, is_active, created_by, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?)`
  ).run(id, name, `GSTIN-${nanoid(6)}`, ctx.id, now, now);
  db.close();
  return id;
}

function insertPurchaseBill(opts: {
  billDate: string;
  supplierId?: string | null;
  supplierName?: string | null;
  billNo?: string;
  items: Array<{ medicineId?: string; medicineName: string; quantity: number; rate: number; gstRate: string; mrp?: number }>;
}) {
  const db = raw();
  const now = Date.now();
  const billId = nanoid(16);
  const billNo = opts.billNo ?? `PB-${nanoid(6)}`;
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
  grand = Math.round(grand * 100) / 100;
  db.prepare(
    `INSERT INTO purchase_bills (id, bill_no, supplier_id, supplier_name, bill_date, subtotal, total_gst, grand_total, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(billId, billNo, opts.supplierId ?? null, opts.supplierName ?? null, opts.billDate, subtotal, totalGst, grand, ctx.id, now, now);
  for (const r of rows) {
    db.prepare(
      `INSERT INTO purchase_bill_items (id, purchase_bill_id, medicine_id, medicine_name, quantity, rate, amount, gst_rate, gst_amount, cgst, sgst, mrp, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(nanoid(16), billId, r.medicineId ?? null, r.medicineName, r.quantity, r.rate, r.amount, r.gstRate, r.gstAmount, r.cgst, r.sgst, r.mrp ?? r.rate + 10, now);
  }
  db.close();
  return billId;
}

function insertPurchaseReturn(billId: string, date: string, opts: { supplierId?: string | null; supplierName?: string | null; items: Array<{ medicineId?: string; medicineName: string; quantity: number; rate: number; gstRate: string }> }) {
  const db = raw();
  const now = Date.now();
  const retId = nanoid(16);
  const retNo = `PR-${nanoid(6)}`;
  let grand = 0;
  let subtotal = 0;
  let totalGst = 0;
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
  db.prepare(
    `INSERT INTO purchase_returns (id, return_no, purchase_bill_id, supplier_id, supplier_name, date, subtotal, total_gst, grand_total, refund_amount, status, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?)`
  ).run(retId, retNo, billId, opts.supplierId ?? null, opts.supplierName ?? null, date, subtotal, totalGst, grand, grand, ctx.id, now);
  for (const r of rows) {
    db.prepare(
      `INSERT INTO purchase_return_items (id, return_id, medicine_id, medicine_name, quantity, rate, amount, gst_rate, gst_amount, cgst, sgst, refund_amount, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(nanoid(16), retId, r.medicineId ?? null, r.medicineName, r.quantity, r.rate, r.amount, r.gstRate, r.gstAmount, r.cgst, r.sgst, r.amount, now);
  }
  db.close();
  return retId;
}

beforeAll(async () => {
  applySchema();
  ctx = seedUser();

  const suppXYZ = seedSupplier("XYZ Distributors");
  const suppABC = seedSupplier("ABC Pharma");

  const medH = seedMedicine(ctx.id, { name: "DOLO 650" });
  updateMedicine(medH.medicineId, { purchase_price: 12, selling_price: 18, mrp: 20, schedule: "H", brand: "Micro Labs", category: "Analgesic", gst_rate: "12", hsn_code: "3004" });
  const medPlain = seedMedicine(ctx.id, { name: "PARA 500" });
  updateMedicine(medPlain.medicineId, { purchase_price: 8, selling_price: 15, mrp: 18, schedule: null, brand: "Generic", category: "Analgesic", gst_rate: "5", hsn_code: "3004" });
  const medX = seedMedicine(ctx.id, { name: "ALPRAX 0.5" });
  updateMedicine(medX.medicineId, { purchase_price: 5, selling_price: 10, mrp: 12, schedule: "H", brand: "Torrent", category: "Psych", gst_rate: "12", hsn_code: "3004" });

  // purchase bills
  const pb1 = insertPurchaseBill({
    billDate: "2026-08-10",
    supplierId: suppXYZ,
    supplierName: "XYZ Distributors",
    items: [{ medicineId: medH.medicineId, medicineName: "DOLO 650", quantity: 10, rate: 12, gstRate: "12", mrp: 20 }],
  });
  insertPurchaseBill({
    billDate: "2026-08-12",
    supplierId: suppABC,
    supplierName: "ABC Pharma",
    items: [{ medicineId: medPlain.medicineId, medicineName: "PARA 500", quantity: 5, rate: 8, gstRate: "5", mrp: 18 }],
  });
  const pb3 = insertPurchaseBill({
    billDate: "2026-09-01",
    supplierId: suppXYZ,
    supplierName: "XYZ Distributors",
    items: [
      { medicineId: medH.medicineId, medicineName: "DOLO 650", quantity: 5, rate: 12, gstRate: "12", mrp: 20 },
      { medicineId: medX.medicineId, medicineName: "ALPRAX 0.5", quantity: 10, rate: 5, gstRate: "12", mrp: 12 },
    ],
  });
  // also second bill same date as pb3 to test date bucket aggregation
  insertPurchaseBill({
    billDate: "2026-09-01",
    supplierId: suppABC,
    supplierName: "ABC Pharma",
    items: [{ medicineId: medPlain.medicineName ? medPlain.medicineId : medPlain.medicineId, medicineName: "PARA 500", quantity: 2, rate: 8, gstRate: "5", mrp: 18 }],
  });

  // purchase return for DOLO 650 (2 qty) linked to pb1
  insertPurchaseReturn(pb1, "2026-08-20", { supplierId: suppXYZ, supplierName: "XYZ Distributors", items: [{ medicineId: medH.medicineId, medicineName: "DOLO 650", quantity: 2, rate: 12, gstRate: "12" }] });

  app = Fastify({ logger: false });
  await app.register(reportRoutes, { prefix: "/api/reports" });
});

async function get(url: string) {
  const res = await app.inject({ method: "GET", url, headers: { authorization: `Bearer ${ctx.token}` } });
  return { status: res.statusCode, body: res.json() };
}

describe("purchase reports parity", () => {
  it("purchase register filters by distributor", async () => {
    const { status, body } = await get("/api/reports/purchase/register?from=2026-08-01&to=2026-09-30&distributor=XYZ");
    expect(status).toBe(200);
    const data = body.data ?? body;
    const rows = data.bills ?? data.rows ?? data.invoices ?? [];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(String(r.supplierName ?? "").toLowerCase()).toContain("xyz");
    }
  });

  it("purchase schedule groups H-schedule", async () => {
    const { status, body } = await get("/api/reports/purchase/schedule?schedule=H&from=2026-08-01&to=2026-09-30");
    expect(status).toBe(200);
    const data = body.data ?? body;
    const rows = data.rows ?? data.bills ?? [];
    expect(Array.isArray(rows)).toBe(true);
    // should have at least DOLO 650 / ALPRAX which are H schedule
    expect(rows.length).toBeGreaterThan(0);
  });

  it("purchase detail returns product grouping with purchQty and margin", async () => {
    const { status, body } = await get("/api/reports/purchase/detail?from=2026-08-01&to=2026-09-30");
    expect(status).toBe(200);
    const data = body.data ?? body;
    const rows = data.rows ?? [];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    const dolo = rows.find((r: any) => r.medicineName === "DOLO 650");
    expect(dolo).toBeDefined();
    // DOLO total purch 15, return 2, net 13
    expect(dolo.purchQty).toBe(15);
    expect(dolo.returnQty).toBe(2);
    expect(dolo.netQty).toBe(13);
    expect(typeof dolo.marginPercent).toBe("number");
    expect(typeof dolo.taxable).toBe("number");
    expect(typeof dolo.gst).toBe("number");
  });

  it("purchase summary groups by company (brand)", async () => {
    const { status, body } = await get("/api/reports/purchase/summary?from=2026-08-01&to=2026-09-30&groupBy=company");
    expect(status).toBe(200);
    const data = body.data ?? body;
    expect(Array.isArray(data.rows)).toBe(true);
    expect(data.rows.length).toBeGreaterThan(0);
    expect(data.rows.some((r: any) => r.group === "Micro Labs" || r.brand === "Micro Labs" || r.company === "Micro Labs")).toBe(true);
    expect(data.summary).toBeDefined();
  });

  it("purchase register date view aggregates by date", async () => {
    const { status, body } = await get("/api/reports/purchase/register?from=2026-08-01&to=2026-09-30&view=date");
    expect(status).toBe(200);
    const data = body.data ?? body;
    const buckets = data.buckets ?? [];
    expect(Array.isArray(buckets)).toBe(true);
    expect(buckets.length).toBeGreaterThan(0);
    expect(typeof buckets[0].taxable).toBe("number");
    expect(typeof buckets[0].gst).toBe("number");
  });

  it("purchase register q search filters", async () => {
    const { status, body } = await get("/api/reports/purchase/register?from=2026-08-01&to=2026-09-30&q=ABC");
    expect(status).toBe(200);
    const data = body.data ?? body;
    const rows = data.bills ?? data.rows ?? [];
    for (const r of rows) expect(String(r.supplierName ?? "").toLowerCase()).toContain("abc");
  });
});
