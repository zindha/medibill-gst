import { beforeAll, describe, expect, it } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import { applySchema, dbPath, seedUser, type SeededUser } from "./helpers.js";
import reportRoutes from "../src/routes/reports.js";

let app: FastifyInstance;
let ctx: SeededUser;

function raw() {
  return new Database(dbPath());
}

function seedCustomer(name: string, balance: number, phone?: string): string {
  const db = raw();
  const id = nanoid(16);
  const now = Date.now();
  db.prepare(
    `INSERT INTO customers (id, name, phone, balance, is_active, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)`
  ).run(id, name, phone ?? null, balance, ctx.id, now, now);
  db.close();
  return id;
}

function seedSupplier(name: string, balance: number): string {
  const db = raw();
  const id = nanoid(16);
  const now = Date.now();
  db.prepare(
    `INSERT INTO suppliers (id, name, balance, is_active, created_by, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?)`
  ).run(id, name, balance, ctx.id, now, now);
  db.close();
  return id;
}

function insertPayment(opts: {
  date: string;
  type: "received" | "paid" | "expense";
  amount: number;
  category?: string | null;
  description?: string | null;
  paymentMode?: string | null;
  customerId?: string | null;
  supplierId?: string | null;
  invoiceId?: string | null;
  voided?: boolean;
}) {
  const db = raw();
  const id = nanoid(16);
  const now = Date.now();
  db.prepare(
    `INSERT INTO payments (id, date, type, category, amount, description, payment_mode, invoice_id, customer_id, supplier_id, voided, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    opts.date,
    opts.type,
    opts.category ?? null,
    opts.amount,
    opts.description ?? null,
    opts.paymentMode ?? null,
    opts.invoiceId ?? null,
    opts.customerId ?? null,
    opts.supplierId ?? null,
    opts.voided ? 1 : 0,
    ctx.id,
    now
  );
  db.close();
  return id;
}

function insertInvoiceForCustomer(customerId: string, customerName: string, date: string, grandTotal: number) {
  const db = raw();
  const now = Date.now();
  const id = nanoid(16);
  const no = `INV-${nanoid(6)}`;
  db.prepare(
    `INSERT INTO invoices (id, invoice_no, customer_id, customer_name, date, subtotal, total_gst, cgst, sgst, igst, grand_total, amount_paid, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?, 0, 'unpaid', ?, ?, ?)`
  ).run(id, no, customerId, customerName, date, grandTotal, grandTotal, ctx.id, now, now);
  db.close();
  return id;
}

beforeAll(async () => {
  applySchema();
  ctx = seedUser();

  // customers: 2 owing, 1 zero/negative should be excluded
  const custA = seedCustomer("ALICE PHARMA", 1500.5, "9876500001");
  const custB = seedCustomer("BOB RETAIL", 800, "9876500002");
  seedCustomer("ZERO CUSTOMER", 0, "9876500003");
  seedCustomer("NEG CUSTOMER", -100, "9876500004");

  // invoices for lastInvoiceDate check (ALICE)
  insertInvoiceForCustomer(custA, "ALICE PHARMA", "2026-09-18", 500);
  insertInvoiceForCustomer(custA, "ALICE PHARMA", "2026-09-20", 700);

  // suppliers: 2 owing
  seedSupplier("XYZ Distributors", 2200);
  seedSupplier("ABC Pharma", 900);
  seedSupplier("ZERO SUPPLIER", 0);

  // payments: mix of types, dates, voided
  insertPayment({ date: "2026-09-05", type: "received", amount: 1000, category: "sales", description: "Cash from Alice", paymentMode: "cash", customerId: custA });
  insertPayment({ date: "2026-09-10", type: "paid", amount: 500, category: "purchase", description: "Paid to XYZ", paymentMode: "upi" });
  // outside period
  insertPayment({ date: "2026-08-01", type: "received", amount: 200, category: "sales", description: "Old", paymentMode: "cash" });
  // voided should be excluded
  insertPayment({ date: "2026-09-12", type: "received", amount: 9999, category: "sales", description: "VOIDED", paymentMode: "cash", voided: true });
  // expenses
  insertPayment({ date: "2026-09-15", type: "expense", amount: 300, category: "Rent", description: "Shop Rent", paymentMode: "cash" });
  insertPayment({ date: "2026-09-16", type: "expense", amount: 150, category: "Electricity", description: "Electricity Bill GST", paymentMode: "upi" });
  insertPayment({ date: "2026-09-17", type: "expense", amount: 200, category: "Rent", description: "Rent with GST", paymentMode: "cash" });

  // other user isolation: customer with balance should not leak
  const other = seedUser();
  const db = raw();
  const now = Date.now();
  db.prepare(`INSERT INTO customers (id, name, balance, is_active, created_by, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?)`).run(nanoid(16), "OTHER USER CUSTOMER", 5000, other.id, now, now);
  db.prepare(`INSERT INTO payments (id, date, type, amount, voided, created_by, created_at) VALUES (?, ?, 'received', 9999, 0, ?, ?)`).run(nanoid(16), "2026-09-10", other.id, now);
  db.close();

  app = Fastify({ logger: false });
  await app.register(reportRoutes, { prefix: "/api/reports" });
});

async function get(url: string) {
  const res = await app.inject({ method: "GET", url, headers: { authorization: `Bearer ${ctx.token}` } });
  return { status: res.statusCode, body: res.json() as any };
}

describe("payments reports parity", () => {
  it("pending customers summary sums balance > 0", async () => {
    const { status, body } = await get("/api/reports/payments/pending-customers?view=summary");
    expect(status).toBe(200);
    const data = body.data ?? body;
    const totalDue = data.totalDue ?? data.summary?.totalDue ?? data.summary?.total ?? 0;
    const count = data.count ?? data.summary?.count ?? data.count ?? 0;
    expect(typeof totalDue).toBe("number");
    // ALICE 1500.5 + BOB 800 = 2300.5, ZERO/NEG excluded, OTHER user excluded
    expect(totalDue).toBeCloseTo(2300.5, 2);
    expect(count).toBe(2);
  });

  it("pending customers detail ordered by balance desc and q filter", async () => {
    const { status, body } = await get("/api/reports/payments/pending-customers?view=detail&q=alice");
    expect(status).toBe(200);
    const data = body.data ?? body;
    const rows = data.rows ?? data.customers ?? [];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    // q=alice should only contain alice
    expect(rows.every((r: any) => String(r.name ?? r.customerName ?? "").toLowerCase().includes("alice"))).toBe(true);
    // detail rows should have balance and last invoice date
    const first = rows[0];
    expect(typeof first.balance).toBe("number");
    // should have lastInvoiceDate or lastPurchaseDate
    expect(first.lastInvoiceDate ?? first.lastPurchaseDate ?? first.last_invoice_date).toBeDefined();
  });

  it("pending distributors summary sums balance > 0", async () => {
    const { status, body } = await get("/api/reports/payments/pending-distributors?view=summary");
    expect(status).toBe(200);
    const data = body.data ?? body;
    const totalDue = data.totalDue ?? data.summary?.totalDue ?? 0;
    const count = data.count ?? data.summary?.count ?? 0;
    expect(typeof totalDue).toBe("number");
    expect(totalDue).toBeCloseTo(3100, 2); // 2200 + 900
    expect(count).toBe(2);
    // ordered check via detail
    const detail = await get("/api/reports/payments/pending-distributors?view=detail");
    const d = detail.body.data ?? detail.body;
    const rows = d.rows ?? d.suppliers ?? [];
    expect(rows[0].balance >= rows[1].balance).toBe(true);
  });

  it("payments register respects date filter and excludes voided", async () => {
    const { status, body } = await get("/api/reports/payments/register?from=2026-09-01&to=2026-09-30");
    expect(status).toBe(200);
    const data = body.data ?? body;
    const rows = data.rows ?? [];
    expect(Array.isArray(rows)).toBe(true);
    // should contain 5 non-voided payments in sept (received 1000, paid 500, rent 300, electricity 150, rent 200) = 5
    expect(rows.length).toBe(5);
    expect(rows.some((r: any) => r.description === "VOIDED")).toBe(false);
    expect(rows.some((r: any) => r.amount === 200 && r.date === "2026-08-01")).toBe(false);
    const summary = data.summary ?? {};
    expect(typeof summary.totalReceived).toBe("number");
    expect(typeof summary.totalPaid).toBe("number");
    expect(typeof summary.totalExpense).toBe("number");
    expect(summary.totalReceived).toBeCloseTo(1000, 2);
    expect(summary.totalPaid).toBeCloseTo(500, 2);
    expect(summary.totalExpense).toBeCloseTo(650, 2);
    expect(summary.count).toBe(5);
  });

  it("payments register type and mode filter", async () => {
    const { body } = await get("/api/reports/payments/register?from=2026-09-01&to=2026-09-30&type=received&mode=cash");
    const data = body.data ?? body;
    const rows = data.rows ?? [];
    expect(rows.length).toBe(1);
    expect(rows[0].type).toBe("received");
    expect(rows[0].paymentMode === "cash" || rows[0].mode === "cash" || rows[0].payment_mode === "cash").toBe(true);
  });

  it("payments register q search and empty period", async () => {
    const { body } = await get("/api/reports/payments/register?from=2026-09-01&to=2026-09-30&q=Rent");
    const data = body.data ?? body;
    const rows = data.rows ?? [];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r: any) => String(r.category ?? r.description ?? "").toLowerCase().includes("rent") || String(r.customerName ?? r.supplierName ?? "").toLowerCase().includes("rent"))).toBe(true);
    const empty = await get("/api/reports/payments/register?from=2000-01-01&to=2000-01-02");
    const ed = empty.body.data ?? empty.body;
    expect((ed.rows ?? []).length).toBe(0);
    expect(ed.summary.count).toBe(0);
  });

  it("expense grouped by category", async () => {
    const { status, body } = await get("/api/reports/payments/expense?from=2026-09-01&to=2026-09-30&groupBy=category");
    expect(status).toBe(200);
    const data = body.data ?? body;
    const rows = data.rows ?? data.groups ?? [];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    const rent = rows.find((r: any) => String(r.group ?? r.category ?? "").toLowerCase() === "rent");
    expect(rent).toBeDefined();
    expect(rent.total ?? rent.totalAmount ?? rent.amount).toBeCloseTo(500, 2); // 300+200
    // category pass-through GST hint field should exist
    expect(rent.category ?? rent.group ?? rent.description).toBeDefined();
    expect(data.summary?.totalExpense ?? data.totalExpense).toBeCloseTo(650, 2);
  });

  it("expense grouped by name (description)", async () => {
    const { body } = await get("/api/reports/payments/expense?from=2026-09-01&to=2026-09-30&groupBy=name&q=Rent");
    const data = body.data ?? body;
    const rows = data.rows ?? data.groups ?? [];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r: any) => String(r.group ?? r.description ?? r.category ?? "").toLowerCase().includes("rent"))).toBe(true);
  });

  it("expense empty period returns empty", async () => {
    const { body } = await get("/api/reports/payments/expense?from=2000-01-01&to=2000-01-02");
    const data = body.data ?? body;
    const rows = data.rows ?? data.groups ?? [];
    expect(rows.length).toBe(0);
  });
});
