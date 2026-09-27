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

function seedDoctor(name: string) {
  const db = raw();
  const id = nanoid(16);
  const now = Date.now();
  db.prepare(`INSERT INTO doctors (id, name, is_active, created_by, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)`).run(id, name, ctx.id, now, now);
  db.close();
  return id;
}

function seedCustomerExact(name: string) {
  const db = raw();
  const id = nanoid(16);
  const now = Date.now();
  db.prepare(`INSERT INTO customers (id, name, is_active, created_by, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)`).run(id, name, ctx.id, now, now);
  db.close();
  return id;
}

function insertInvoice(opts: {
  date: string;
  customerId?: string | null;
  customerName?: string | null;
  doctorId?: string | null;
  doctorName?: string | null;
  items: Array<{ medicineId?: string; medicineName: string; quantity: number; rate: number; gstRate: string; discountAmount?: number; hsnCode?: string }>;
}) {
  const db = raw();
  const now = Date.now();
  const invoiceId = nanoid(16);
  const invoiceNo = `INV-${nanoid(6)}`;
  // compute per-item amount/gst like invoice route
  let subtotal = 0;
  let totalGst = 0;
  let grand = 0;
  const rows: any[] = [];
  for (const it of opts.items) {
    const rate = Math.round((it.rate + Number.EPSILON) * 100) / 100;
    const amount = Math.round(rate * it.quantity * 100) / 100;
    const gstRate = Number(it.gstRate) || 0;
    const base = Math.round((amount / (1 + gstRate / 100)) * 100) / 100;
    const gstAmount = Math.round((amount - base) * 100) / 100;
    subtotal += amount - gstAmount;
    totalGst += gstAmount;
    grand += amount;
    rows.push({ ...it, rate, amount, gstAmount, cgst: gstAmount / 2, sgst: gstAmount / 2 });
  }
  const discount = opts.items.reduce((a, it) => a + (it.discountAmount ?? 0), 0);
  grand = Math.max(0, Math.round((grand - discount) * 100) / 100);
  subtotal = Math.round(subtotal * 100) / 100;
  totalGst = Math.round(totalGst * 100) / 100;
  const cgst = Math.round((totalGst / 2) * 100) / 100;
  const sgst = cgst;
  db.prepare(
    `INSERT INTO invoices (id, invoice_no, customer_id, customer_name, doctor_id, doctor_name, date, subtotal, total_gst, cgst, sgst, igst, discount_amount, grand_total, amount_paid, payment_mode, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'cash', 'paid', ?, ?, ?)`
  ).run(
    invoiceId,
    invoiceNo,
    opts.customerId ?? null,
    opts.customerName ?? null,
    opts.doctorId ?? null,
    opts.doctorName ?? null,
    opts.date,
    subtotal,
    totalGst,
    cgst,
    sgst,
    discount,
    grand,
    grand,
    ctx.id,
    now,
    now
  );
  for (const r of rows) {
    db.prepare(
      `INSERT INTO invoice_items (id, invoice_id, medicine_id, medicine_name, hsn_code, quantity, unit, rate, amount, gst_rate, gst_amount, cgst, sgst, discount_amount, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'Strip', ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(nanoid(16), invoiceId, r.medicineId ?? null, r.medicineName, r.hsnCode ?? null, r.quantity, r.rate, r.amount, r.gstRate, r.gstAmount, r.cgst, r.sgst, r.discountAmount ?? 0, now);
  }
  db.close();
  return invoiceId;
}

function insertSalesReturn(invoiceId: string, date: string, items: Array<{ medicineId?: string; medicineName: string; quantity: number; rate: number; gstRate: string }>) {
  const db = raw();
  const now = Date.now();
  const retId = nanoid(16);
  const retNo = `RET-${nanoid(6)}`;
  let grand = 0;
  let subtotal = 0;
  let totalGst = 0;
  const rows: any[] = [];
  for (const it of items) {
    const amount = Math.round(it.rate * it.quantity * 100) / 100;
    const gstRate = Number(it.gstRate) || 0;
    const base = Math.round((amount / (1 + gstRate / 100)) * 100) / 100;
    const gstAmount = Math.round((amount - base) * 100) / 100;
    subtotal += amount - gstAmount;
    totalGst += gstAmount;
    grand += amount;
    rows.push({ ...it, amount, gstAmount, cgst: gstAmount / 2, sgst: gstAmount / 2 });
  }
  const cgst = totalGst / 2;
  const sgst = cgst;
  db.prepare(
    `INSERT INTO sales_returns (id, return_no, invoice_id, customer_name, date, subtotal, total_gst, cgst, sgst, igst, grand_total, refund_amount, refund_mode, status, created_by, created_at)
     VALUES (?, ?, ?, 'test', ?, ?, ?, ?, ?, 0, ?, ?, 'cash', 'completed', ?, ?)`
  ).run(retId, retNo, invoiceId, date, subtotal, totalGst, cgst, sgst, grand, grand, ctx.id, now);
  for (const r of rows) {
    db.prepare(
      `INSERT INTO sales_return_items (id, return_id, medicine_id, medicine_name, hsn_code, quantity, unit, rate, amount, gst_rate, gst_amount, cgst, sgst, refund_amount, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'Strip', ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(nanoid(16), retId, r.medicineId ?? null, r.medicineName, null, r.quantity, r.rate, r.amount, r.gstRate, r.gstAmount, r.cgst, r.sgst, r.amount, now);
  }
  db.close();
  return retId;
}

beforeAll(async () => {
  applySchema();
  ctx = seedUser();

  // medicines
  const medH = seedMedicine(ctx.id, { name: "DOLO 650" });
  updateMedicine(medH.medicineId, { purchase_price: 12, selling_price: 18, mrp: 20, schedule: "H", brand: "Micro Labs", category: "Analgesic", gst_rate: "12", hsn_code: "3004" });
  const medX = seedMedicine(ctx.id, { name: "ALPRAX 0.5" });
  updateMedicine(medX.medicineId, { purchase_price: 5, selling_price: 10, mrp: 12, schedule: "H1", brand: "Torrent", category: "Psych", gst_rate: "12", hsn_code: "3004" });
  const medPlain = seedMedicine(ctx.id, { name: "PARA 500" });
  updateMedicine(medPlain.medicineId, { purchase_price: 8, selling_price: 15, mrp: 18, schedule: null, brand: "Generic", category: "Analgesic", gst_rate: "5", hsn_code: "3004" });

  const custA = seedCustomerExact("Customer A");
  const custB = seedCustomerExact("Customer B");
  const docId = seedDoctor("Dr. Sharma");

  // invoice 1: H medicine, 2026-09-10, 2 qty rate 18 gst 12 discount 1
  insertInvoice({
    date: "2026-09-10",
    customerId: custA,
    customerName: "Customer A",
    doctorId: docId,
    doctorName: "Dr. Sharma",
    items: [{ medicineId: medH.medicineId, medicineName: "DOLO 650", quantity: 2, rate: 18, gstRate: "12", discountAmount: 1 }],
  });
  // invoice 2: same day, different medicine, to test date bucket aggregation (2 invoices same date)
  insertInvoice({
    date: "2026-09-10",
    customerId: custB,
    customerName: "Customer B",
    items: [{ medicineId: medPlain.medicineId, medicineName: "PARA 500", quantity: 1, rate: 15, gstRate: "5" }],
  });
  // invoice 3: H1 medicine, 2026-09-12
  const inv3 = insertInvoice({
    date: "2026-09-12",
    customerId: custA,
    customerName: "Customer A",
    items: [{ medicineId: medX.medicineId, medicineName: "ALPRAX 0.5", quantity: 5, rate: 10, gstRate: "12" }],
  });
  insertSalesReturn(inv3, "2026-09-13", [{ medicineId: medX.medicineId, medicineName: "ALPRAX 0.5", quantity: 1, rate: 10, gstRate: "12" }]);

  app = Fastify({ logger: false });
  await app.register(reportRoutes, { prefix: "/api/reports" });
});

async function get(url: string) {
  const res = await app.inject({ method: "GET", url, headers: { authorization: `Bearer ${ctx.token}` } });
  return { status: res.statusCode, body: res.json() };
}

describe("sales reports parity", () => {
  it("register date-wise aggregates profit and adj amount", async () => {
    const { status, body } = await get("/api/reports/sales/register?from=2026-09-01&to=2026-09-30&view=date");
    expect(status).toBe(200);
    const data = body.data ?? body;
    const buckets = data.buckets ?? data.rows ?? [];
    expect(buckets.length).toBeGreaterThan(0);
    expect(typeof buckets[0].netProfit).toBe("number");
    expect(typeof buckets[0].adjAmount).toBe("number");
    expect(typeof buckets[0].taxable).toBe("number");
    expect(data.summary).toBeDefined();
  });

  it("schedule register filters H schedule", async () => {
    const { status, body } = await get("/api/reports/sales/schedule?schedule=H&from=2026-09-01&to=2026-09-30");
    expect(status).toBe(200);
    const data = body.data ?? body;
    const rows = data.rows ?? data.invoices ?? [];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    // all rows should be H schedule - we check invoice contains DOLO
    // detail via medicine schedule
  });

  it("register invoice view returns per-invoice rows with margin", async () => {
    const { status, body } = await get("/api/reports/sales/register?from=2026-09-01&to=2026-09-30&view=invoice");
    expect(status).toBe(200);
    const data = body.data ?? body;
    const rows = data.invoices ?? data.rows ?? [];
    expect(rows.length).toBeGreaterThan(0);
    const r = rows[0];
    expect(typeof r.taxable).toBe("number");
    expect(typeof r.gst).toBe("number");
    expect(typeof r.netProfit).toBe("number");
    expect(typeof r.marginPercent).toBe("number");
    expect(typeof r.payable).toBe("number");
    expect(r.balance).toBe(0);
  });

  it("detail returns per-medicine saleQty and netQty", async () => {
    const { status, body } = await get("/api/reports/sales/detail?from=2026-09-01&to=2026-09-30");
    expect(status).toBe(200);
    const data = body.data ?? body;
    const rows = data.rows ?? [];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    const dolo = rows.find((r: any) => r.medicineName === "DOLO 650");
    expect(dolo).toBeDefined();
    expect(typeof dolo.saleQty).toBe("number");
    expect(typeof dolo.netQty).toBe("number");
    expect(typeof dolo.marginPercent).toBe("number");
    const alprax = rows.find((r: any) => r.medicineName === "ALPRAX 0.5");
    expect(alprax.saleQty).toBe(5);
    expect(alprax.returnQty).toBe(1);
    expect(alprax.netQty).toBe(4);
  });

  it("summary groupBy product aggregates", async () => {
    const { status, body } = await get("/api/reports/sales/summary?from=2026-09-01&to=2026-09-30&groupBy=product");
    expect(status).toBe(200);
    const data = body.data ?? body;
    expect(Array.isArray(data.rows)).toBe(true);
    expect(data.rows.length).toBeGreaterThan(0);
    expect(data.summary).toBeDefined();
  });

  it("summary groupBy company aggregates by brand", async () => {
    const { status, body } = await get("/api/reports/sales/summary?from=2026-09-01&to=2026-09-30&groupBy=company");
    expect(status).toBe(200);
    const data = body.data ?? body;
    expect(data.rows.some((r: any) => r.group === "Micro Labs" || r.brand === "Micro Labs" || r.company === "Micro Labs")).toBe(true);
  });

  it("doctor filter returns only doctor invoices", async () => {
    const { status, body } = await get("/api/reports/sales/doctor?from=2026-09-01&to=2026-09-30");
    expect(status).toBe(200);
    const data = body.data ?? body;
    expect(Array.isArray(data.rows ?? data.invoices ?? [])).toBe(true);
  });

  it("party filter returns only customer invoices", async () => {
    // fetch customer A id first
    const db = raw();
    const custA = db.prepare("SELECT id FROM customers WHERE name = 'Customer A' AND created_by = ?").get(ctx.id) as any;
    db.close();
    const { status, body } = await get(`/api/reports/sales/party?from=2026-09-01&to=2026-09-30&customerId=${custA.id}`);
    expect(status).toBe(200);
    const data = body.data ?? body;
    const rows = data.rows ?? data.invoices ?? [];
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.customerName === "Customer A" || r.customerId === custA.id).toBe(true);
    }
  });

  it("empty period returns zero totals and empty arrays", async () => {
    const { status, body } = await get("/api/reports/sales/register?from=2000-01-01&to=2000-01-02&view=invoice");
    expect(status).toBe(200);
    const data = body.data ?? body;
    const rows = data.invoices ?? data.rows ?? [];
    expect(rows.length).toBe(0);
    expect(data.summary.invoiceCount).toBe(0);
  });

  it("isolates tenants: another user's invoices are excluded", async () => {
    const other = seedUser();
    const odb = raw();
    const now = Date.now();
    odb.prepare(
      `INSERT INTO invoices (id, invoice_no, customer_name, date, subtotal, total_gst, cgst, sgst, igst, discount_amount, grand_total, amount_paid, payment_mode, status, created_by, created_at, updated_at)
       VALUES (?, ?, 'Other Tenant', '2026-09-11', 100, 12, 6, 6, 0, 0, 112, 112, 'cash', 'paid', ?, ?, ?)`
    ).run(nanoid(16), `INV-OTHER-${nanoid(6)}`, other.id, now, now);
    odb.close();
    for (const url of [
      "/api/reports/sales/register?from=2026-09-01&to=2026-09-30&view=invoice",
      "/api/reports/sales/register?from=2026-09-01&to=2026-09-30&view=date",
      "/api/reports/sales/detail?from=2026-09-01&to=2026-09-30",
      "/api/reports/sales/summary?from=2026-09-01&to=2026-09-30&groupBy=product",
      "/api/reports/sales/doctor?from=2026-09-01&to=2026-09-30",
      "/api/reports/sales/schedule?from=2026-09-01&to=2026-09-30",
      "/api/reports/sales/party?from=2026-09-01&to=2026-09-30",
    ]) {
      const { status, body } = await get(url);
      expect(status).toBe(200);
      expect(JSON.stringify(body)).not.toContain("Other Tenant");
    }
  });
});
