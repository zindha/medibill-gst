import { beforeAll, describe, expect, it } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import { applySchema, dbPath, seedUser, type SeededUser } from "./helpers.js";
import reportRoutes from "../src/routes/reports.js";

let app: FastifyInstance;
let ctx: SeededUser;
let ctx2: SeededUser;

function raw() {
  return new Database(dbPath());
}

function seedCustomer(name: string, balance: number, phone?: string, opts?: { totalPurchases?: number; lastPurchaseDate?: string | null }): string {
  const db = raw();
  const id = nanoid(16);
  const now = Date.now();
  db.prepare(
    `INSERT INTO customers (id, name, phone, balance, total_purchases, last_purchase_date, is_active, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
  ).run(id, name, phone ?? null, balance, opts?.totalPurchases ?? balance, opts?.lastPurchaseDate ?? null, ctx.id, now, now);
  db.close();
  return id;
}

function seedSupplier(name: string, balance: number, gstin?: string | null): string {
  const db = raw();
  const id = nanoid(16);
  const now = Date.now();
  db.prepare(
    `INSERT INTO suppliers (id, name, balance, gstin, is_active, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)`
  ).run(id, name, balance, gstin ?? null, ctx.id, now, now);
  db.close();
  return id;
}

function insertInvoiceForCustomer(customerId: string, customerName: string, date: string, grandTotal: number, opts?: { customerPhone?: string }) {
  const db = raw();
  const now = Date.now();
  const id = nanoid(16);
  const no = `INV-${nanoid(6)}`;
  db.prepare(
    `INSERT INTO invoices (id, invoice_no, customer_id, customer_name, customer_phone, date, subtotal, total_gst, cgst, sgst, igst, grand_total, amount_paid, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?, 0, 'paid', ?, ?, ?)`
  ).run(id, no, customerId, customerName, opts?.customerPhone ?? null, date, grandTotal, grandTotal, ctx.id, now, now);
  db.close();
  return id;
}

function insertPurchaseBillForSupplier(supplierId: string, supplierName: string, billDate: string, grandTotal: number) {
  const db = raw();
  const now = Date.now();
  const id = nanoid(16);
  const no = `PB-${nanoid(6)}`;
  db.prepare(
    `INSERT INTO purchase_bills (id, bill_no, supplier_id, supplier_name, bill_date, subtotal, total_gst, grand_total, amount_paid, payment_status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, 0, 'unpaid', ?, ?, ?)`
  ).run(id, no, supplierId, supplierName, billDate, grandTotal, grandTotal, ctx.id, now, now);
  db.close();
  return id;
}

function insertPayment(opts: {
  date: string;
  type: "received" | "paid" | "expense";
  amount: number;
  customerId?: string | null;
  supplierId?: string | null;
  paymentMode?: string | null;
  voided?: boolean;
}) {
  const db = raw();
  const id = nanoid(16);
  const now = Date.now();
  db.prepare(
    `INSERT INTO payments (id, date, type, amount, payment_mode, customer_id, supplier_id, voided, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, opts.date, opts.type, opts.amount, opts.paymentMode ?? "cash", opts.customerId ?? null, opts.supplierId ?? null, opts.voided ? 1 : 0, ctx.id, now);
  db.close();
  return id;
}

function insertFollowup(opts: {
  customerId?: string | null;
  customerName: string;
  customerPhone?: string | null;
  medicineName: string;
  lastPurchaseDate: string;
  reminderDate: string;
  status: "pending" | "sent" | "completed";
}) {
  const db = raw();
  const id = nanoid(16);
  const now = Date.now();
  db.prepare(
    `INSERT INTO refill_reminders (id, customer_id, customer_name, customer_phone, medicine_name, last_purchase_date, reminder_date, status, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, opts.customerId ?? null, opts.customerName, opts.customerPhone ?? null, opts.medicineName, opts.lastPurchaseDate, opts.reminderDate, opts.status, ctx.id, now);
  db.close();
  return id;
}

beforeAll(async () => {
  applySchema();
  ctx = seedUser();
  ctx2 = seedUser();

  // Customers with balances and RFM potential
  const custA = seedCustomer("Alice Pharma", 1500, "9876500001", { totalPurchases: 5000, lastPurchaseDate: "2026-09-18" });
  const custB = seedCustomer("Bob Retail", 800, "9876500002", { totalPurchases: 2000, lastPurchaseDate: "2026-09-10" });
  const custC = seedCustomer("Zero Customer", 0, "9876500003");
  // No invoices for Zero Customer => R null -> 0

  // Invoices for RFM: Alice high frequency/monetary recent, Bob lower
  // Alice: 3 invoices last 180d
  insertInvoiceForCustomer(custA, "Alice Pharma", "2026-09-15", 1000);
  insertInvoiceForCustomer(custA, "Alice Pharma", "2026-09-18", 1500);
  insertInvoiceForCustomer(custA, "Alice Pharma", "2026-09-19", 2000);
  // Bob: 1 invoice older
  insertInvoiceForCustomer(custB, "Bob Retail", "2026-08-01", 500);

  // Suppliers / distributors
  const supA = seedSupplier("XYZ Distributors", 2200, "27XYZ1234A1Z");
  const supB = seedSupplier("ABC Pharma", 900);

  // Purchase bills for supplier ledger
  insertPurchaseBillForSupplier(supA, "XYZ Distributors", "2026-09-15", 1000);
  insertPurchaseBillForSupplier(supA, "XYZ Distributors", "2026-09-18", 2000);

  // Payments for ledgers
  insertPayment({ date: "2026-09-16", type: "received", amount: 500, customerId: custA });
  insertPayment({ date: "2026-09-20", type: "paid", amount: 400, supplierId: supA });

  // Follow-ups: 2 pending in sept, 1 outside, 1 sent
  insertFollowup({ customerId: custA, customerName: "Alice Pharma", customerPhone: "9876500001", medicineName: "DOLO 650", lastPurchaseDate: "2026-09-01", reminderDate: "2026-09-20", status: "pending" });
  insertFollowup({ customerId: custB, customerName: "Bob Retail", customerPhone: "9876500002", medicineName: "AZEE 500", lastPurchaseDate: "2026-09-02", reminderDate: "2026-09-25", status: "pending" });
  insertFollowup({ customerId: custA, customerName: "Alice Pharma", medicineName: "PCM", lastPurchaseDate: "2026-08-01", reminderDate: "2026-08-15", status: "pending" });
  insertFollowup({ customerId: custA, customerName: "Alice Pharma", medicineName: "DONE", lastPurchaseDate: "2026-09-01", reminderDate: "2026-09-22", status: "sent" });

  // Other user isolation
  const db = raw();
  const now = Date.now();
  db.prepare(`INSERT INTO customers (id, name, balance, is_active, created_by, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?)`).run(nanoid(16), "OTHER USER CUSTOMER", 9999, ctx2.id, now, now);
  db.prepare(`INSERT INTO suppliers (id, name, balance, is_active, created_by, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?)`).run(nanoid(16), "OTHER SUPPLIER", 9999, ctx2.id, now, now);
  db.prepare(`INSERT INTO refill_reminders (id, customer_name, medicine_name, last_purchase_date, reminder_date, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(nanoid(16), "Other Guy", "Other Med", "2026-09-01", "2026-09-21", "pending", ctx2.id, now);
  db.close();

  app = Fastify({ logger: false });
  await app.register(reportRoutes, { prefix: "/api/reports" });
});

async function get(url: string) {
  const res = await app.inject({ method: "GET", url, headers: { authorization: `Bearer ${ctx.token}` } });
  return { status: res.statusCode, body: res.json() as any };
}

describe("party reports parity", () => {
  it("customers register returns RFM score", async () => {
    const { status, body } = await get("/api/reports/party/customers");
    expect(status).toBe(200);
    const data = body.data ?? body;
    const rows = data.rows ?? [];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThanOrEqual(3);
    // each row has rfmScore
    for (const r of rows) expect(r).toHaveProperty("rfmScore");
    // zero customer with no invoices should have rfmScore 0 (R null)
    const zero = rows.find((r: any) => String(r.name ?? "").includes("Zero"));
    expect(zero).toBeDefined();
    expect(zero.rfmScore).toBe(0);
    // Alice should have higher RFM than Bob (more recent, higher frequency/monetary)
    const alice = rows.find((r: any) => String(r.name ?? "").includes("Alice"));
    const bob = rows.find((r: any) => String(r.name ?? "").includes("Bob"));
    expect(alice.rfmScore).toBeGreaterThan(bob.rfmScore);
  });

  it("customers register q filter and sort", async () => {
    const { body } = await get("/api/reports/party/customers?q=alice");
    const data = body.data ?? body;
    const rows = data.rows ?? [];
    expect(rows.every((r: any) => String(r.name ?? r.customerName ?? "").toLowerCase().includes("alice"))).toBe(true);
    const { body: body2 } = await get("/api/reports/party/customers?sort=balance");
    const rows2 = (body2.data ?? body2).rows ?? [];
    // sorted by balance desc: Alice 1500 first
    expect(rows2[0].balance >= rows2[1].balance).toBe(true);
    // default rfm sort: highest rfm first (Alice before Bob before Zero)
    const { body: body3 } = await get("/api/reports/party/customers?sort=rfm");
    const rows3 = (body3.data ?? body3).rows ?? [];
    expect(rows3[0].rfmScore >= rows3[rows3.length - 1].rfmScore).toBe(true);
  });

  it("distributors register sorted by balance desc and q filter", async () => {
    const { status, body } = await get("/api/reports/party/distributors");
    expect(status).toBe(200);
    const data = body.data ?? body;
    const rows = data.rows ?? data.suppliers ?? [];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBe(2);
    expect(rows[0].balance >= rows[1].balance).toBe(true);
    expect(rows[0].name).toBe("XYZ Distributors");
    // q filter
    const { body: body2 } = await get("/api/reports/party/distributors?q=xyz");
    const rows2 = (body2.data ?? body2).rows ?? [];
    expect(rows2.length).toBe(1);
    expect(String(rows2[0].name).toLowerCase()).toContain("xyz");
    // isolation: other user supplier not leaked
    expect(rows.some((r: any) => r.name === "OTHER SUPPLIER")).toBe(false);
  });

  it("payment ledger for customer returns balance timeline", async () => {
    // lookup alice customer id
    const db = raw();
    const row = db.prepare("SELECT id FROM customers WHERE name = 'Alice Pharma' AND created_by = ?").get(ctx.id) as any;
    db.close();
    const cid = row.id as string;
    const { status, body } = await get(`/api/reports/party/ledger?type=customer&id=${cid}&from=2026-09-01&to=2026-09-30`);
    expect(status).toBe(200);
    const data = body.data ?? body;
    const entries = data.entries ?? data.ledger ?? [];
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
    // should contain both invoices and payments
    const hasInvoice = entries.some((e: any) => String(e.type ?? e.kind ?? "").toLowerCase().includes("invoice") || e.invoiceNo || e.billNo === undefined && e.amount > 0) || entries.some((e: any) => e.reference === null || e.invoiceId);
    expect(entries.length).toBeGreaterThanOrEqual(2);
    // running balance present and ordered by date asc
    for (let i = 1; i < entries.length; i++) {
      expect(String(entries[i].date) >= String(entries[i - 1].date)).toBe(true);
    }
    expect(entries[0]).toHaveProperty("runningBalance");
    expect(entries[0]).toHaveProperty("date");
    // empty period
    const { body: empty } = await get(`/api/reports/party/ledger?type=customer&id=${cid}&from=2000-01-01&to=2000-01-02`);
    const ed = empty.data ?? empty;
    expect((ed.entries ?? []).length).toBe(0);
  });

  it("payment ledger for distributor returns timeline", async () => {
    const db = raw();
    const row = db.prepare("SELECT id FROM suppliers WHERE name = 'XYZ Distributors' AND created_by = ?").get(ctx.id) as any;
    db.close();
    const sid = row.id as string;
    const { status, body } = await get(`/api/reports/party/ledger?type=supplier&id=${sid}&from=2026-09-01&to=2026-09-30`);
    expect(status).toBe(200);
    const data = body.data ?? body;
    const entries = data.entries ?? [];
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0]).toHaveProperty("runningBalance");
  });

  it("pending medicine followups in range and q filter", async () => {
    const { status, body } = await get("/api/reports/party/followups?from=2026-09-15&to=2026-09-30");
    expect(status).toBe(200);
    const data = body.data ?? body;
    const rows = data.rows ?? data.followups ?? [];
    expect(Array.isArray(rows)).toBe(true);
    // only pending in sept 15-30: 2 (20th and 25th), not 08-15, not sent
    expect(rows.length).toBe(2);
    expect(rows.every((r: any) => r.status === "pending")).toBe(true);
    // q filter by customer name
    const { body: body2 } = await get("/api/reports/party/followups?from=2026-09-15&to=2026-09-30&q=alice");
    const rows2 = (body2.data ?? body2).rows ?? [];
    expect(rows2.length).toBe(1);
    expect(String(rows2[0].customerName).toLowerCase()).toContain("alice");
    // empty period
    const { body: empty } = await get("/api/reports/party/followups?from=2000-01-01&to=2000-01-02");
    expect(((empty.data ?? empty).rows ?? []).length).toBe(0);
  });

  it("followups isolation excludes other user", async () => {
    const { body } = await get("/api/reports/party/followups?from=2026-09-15&to=2026-09-30");
    const rows = (body.data ?? body).rows ?? [];
    expect(rows.some((r: any) => r.customerName === "Other Guy")).toBe(false);
  });
});
