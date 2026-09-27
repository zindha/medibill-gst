import { beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import { applySchema, dbPath, seedUser, type SeededUser } from "./helpers.js";
import reportRoutes from "../src/routes/reports.js";

// Regression tests for the GST report endpoints (/tax, /gstr1, /gstr3b, /hsn, /itc).
// Seeded scenario:
// - Invoice A (paid, B2C): 12% item, amount 112, gst 12  -> taxable 100
// - Invoice B (paid, B2B): 5% items 105 (gst 5) + 210 (gst 10) -> taxable 300
// - Invoice C (cancelled, 18%): must be excluded entirely
// - Sales return R1 against B: 5% item amount 105, gst 5 -> credit taxable 100
// - Purchase P1 (supplier WITH gstin): 12% amt 224 gst 24 + 5% amt 105 gst 5
// - Purchase P2 (supplier WITHOUT gstin): 0% amt 100 gst 0 (nil-rated)
let app: FastifyInstance;
let ctx: SeededUser;

function raw() {
  return new Database(dbPath());
}

function seedAll() {
  const db = raw();
  const now = Date.now();
  // Ensure a clean slate for the hardcoded invoice/bill numbers when tests share the scratch DB.
  try { db.exec("DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE invoice_no IN ('INV-A-001','INV-B-001','INV-C-001'))"); } catch {}
  try { db.exec("DELETE FROM sales_return_items WHERE return_id IN (SELECT id FROM sales_returns WHERE return_no = 'RET-001')"); } catch {}
  try { db.exec("DELETE FROM sales_returns WHERE return_no = 'RET-001'"); } catch {}
  try { db.exec("DELETE FROM invoices WHERE invoice_no IN ('INV-A-001','INV-B-001','INV-C-001')"); } catch {}
  try { db.exec("DELETE FROM purchase_bill_items WHERE purchase_bill_id IN (SELECT id FROM purchase_bills WHERE bill_no IN ('PUR-001','PUR-002'))"); } catch {}
  try { db.exec("DELETE FROM purchase_bills WHERE bill_no IN ('PUR-001','PUR-002')"); } catch {}
  try { db.exec("DELETE FROM suppliers WHERE name IN ('Supplier One','Supplier Two') AND created_by = '" + ctx.id + "'"); } catch {}
  const ins = (table: string, cols: string[], vals: unknown[]) =>
    db.prepare(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).run(...vals);

  const invA = nanoid(16), invB = nanoid(16), invC = nanoid(16);
  for (const [id, no, date, customer, gstin, status, sub, gst, cgst, sgst, total] of [
    [invA, "INV-A-001", "2026-08-10", "Retail", null, "paid", 100, 12, 6, 6, 112],
    [invB, "INV-B-001", "2026-08-15", "Clinic X", "27ABCDE1234F1Z5", "paid", 300, 15, 7.5, 7.5, 315],
    [invC, "INV-C-001", "2026-08-20", "Retail", null, "cancelled", 847.46, 152.54, 76.27, 76.27, 1000],
  ] as const) {
    ins("invoices",
      ["id", "invoice_no", "customer_name", "customer_gstin", "date", "subtotal", "total_gst", "cgst", "sgst", "igst", "grand_total", "amount_paid", "payment_mode", "status", "created_by", "created_at", "updated_at"],
      [id, no, customer, gstin, date, sub, gst, cgst, sgst, 0, total, total, "cash", status, ctx.id, now, now]);
  }
  const itemCols = ["id", "invoice_id", "medicine_name", "hsn_code", "quantity", "unit", "rate", "amount", "gst_rate", "gst_amount", "cgst", "sgst", "created_at"];
  ins("invoice_items", itemCols, [nanoid(16), invA, "Med A", null, 1, "Strip", 112, 112, "12", 12, 6, 6, now]);
  ins("invoice_items", itemCols, [nanoid(16), invB, "Med B1", "30049099", 1, "Nos", 105, 105, "5", 5, 2.5, 2.5, now]);
  ins("invoice_items", itemCols, [nanoid(16), invB, "Med B2", "30049099", 2, "Nos", 105, 210, "5", 10, 5, 5, now]);
  ins("invoice_items", itemCols, [nanoid(16), invC, "Med C", null, 1, "Nos", 1000, 1000, "18", 152.54, 76.27, 76.27, now]);

  const retId = nanoid(16);
  ins("sales_returns",
    ["id", "return_no", "invoice_id", "customer_name", "date", "subtotal", "total_gst", "cgst", "sgst", "igst", "grand_total", "refund_amount", "refund_mode", "status", "created_by", "created_at"],
    [retId, "RET-001", invB, "Clinic X", "2026-08-18", 100, 5, 2.5, 2.5, 0, 105, 105, "cash", "completed", ctx.id, now]);
  ins("sales_return_items",
    ["id", "return_id", "medicine_name", "hsn_code", "quantity", "unit", "rate", "amount", "gst_rate", "gst_amount", "cgst", "sgst", "refund_amount", "created_at"],
    [nanoid(16), retId, "Med B1", "30049099", 1, "Nos", 105, 105, "5", 5, 2.5, 2.5, 105, now]);

  const sup1 = nanoid(16), sup2 = nanoid(16);
  ins("suppliers", ["id", "name", "gstin", "is_active", "created_by", "created_at", "updated_at"],
    [sup1, "Supplier One", "27SUPPLIER001A1Z", 1, ctx.id, now, now]);
  ins("suppliers", ["id", "name", "gstin", "is_active", "created_by", "created_at", "updated_at"],
    [sup2, "Supplier Two", null, 1, ctx.id, now, now]);

  const p1 = nanoid(16), p2 = nanoid(16);
  ins("purchase_bills",
    ["id", "bill_no", "supplier_id", "supplier_name", "bill_date", "subtotal", "total_gst", "grand_total", "amount_paid", "payment_status", "created_by", "created_at", "updated_at"],
    [p1, "PUR-001", sup1, "Supplier One", "2026-08-12", 300, 29, 329, 329, "paid", ctx.id, now, now]);
  ins("purchase_bills",
    ["id", "bill_no", "supplier_id", "supplier_name", "bill_date", "subtotal", "total_gst", "grand_total", "amount_paid", "payment_status", "created_by", "created_at", "updated_at"],
    [p2, "PUR-002", sup2, "Supplier Two", "2026-08-20", 100, 0, 100, 0, "unpaid", ctx.id, now, now]);
  const pItemCols = ["id", "purchase_bill_id", "medicine_name", "hsn_code", "quantity", "rate", "amount", "gst_rate", "gst_amount", "cgst", "sgst", "created_at"];
  ins("purchase_bill_items", pItemCols, [nanoid(16), p1, "Med A", null, 2, 112, 224, "12", 24, 12, 12, now]);
  ins("purchase_bill_items", pItemCols, [nanoid(16), p1, "Med B1", "30049099", 1, 105, 105, "5", 5, 2.5, 2.5, now]);
  ins("purchase_bill_items", pItemCols, [nanoid(16), p2, "Med Nil", null, 10, 10, 100, "0", 0, 0, 0, now]);
  db.close();
}

beforeAll(async () => {
  applySchema();
  ctx = seedUser();
  seedAll();
  app = Fastify({ logger: false });
  await app.register(reportRoutes, { prefix: "/api/reports" });
});

async function get(url: string) {
  const res = await app.inject({ method: "GET", url, headers: { authorization: `Bearer ${ctx.token}` } });
  return { status: res.statusCode, data: res.json()?.data };
}

const Q = "?from=2026-08-01&to=2026-08-31";

describe("GST reports", () => {
  it("/tax is rate-accurate and nets credit notes", async () => {
    const { status, data } = await get(`/api/reports/tax${Q}`);
    expect(status).toBe(200);
    expect(data.totalTaxable).toBeCloseTo(400, 2);
    expect(data.totalGst).toBeCloseTo(27, 2);
    expect(data.breakdown["12"].taxableAmount).toBeCloseTo(100, 2);
    expect(data.breakdown["12"].gstAmount).toBeCloseTo(12, 2);
    expect(data.breakdown["5"].taxableAmount).toBeCloseTo(300, 2);
    expect(data.breakdown["5"].gstAmount).toBeCloseTo(15, 2);
    expect(data.breakdown["18"]).toBeUndefined(); // cancelled invoice excluded
    expect(data.creditNoteCount).toBe(1);
    expect(data.creditNoteTaxable).toBeCloseTo(100, 2);
    expect(data.creditNoteGst).toBeCloseTo(5, 2);
    expect(data.netTaxable).toBeCloseTo(300, 2);
    expect(data.netGst).toBeCloseTo(22, 2);
  });

  it("/gstr1 splits B2B/B2C and lists credit notes", async () => {
    const { status, data } = await get(`/api/reports/gstr1${Q}`);
    expect(status).toBe(200);
    expect(data.summary.b2bCount).toBe(1);
    expect(data.summary.b2cCount).toBe(1);
    expect(data.summary.totalTaxable).toBeCloseTo(400, 2);
    expect(data.summary.totalGst).toBeCloseTo(27, 2);
    expect(data.summary.creditNoteCount).toBe(1);
    expect(data.b2b[0].customerGstin).toBe("27ABCDE1234F1Z5");
    expect(data.cdnr[0].originalInvoiceNo).toBe("INV-B-001");
  });

  it("/gstr3b nets output against ITC and floors at zero", async () => {
    const { status, data } = await get(`/api/reports/gstr3b${Q}`);
    expect(status).toBe(200);
    expect(data.outward.netTaxable).toBeCloseTo(300, 2);
    expect(data.outward.netCgst).toBeCloseTo(11, 2);
    expect(data.itc.billCount).toBe(2);
    expect(data.itc.gst).toBeCloseTo(29, 2);
    expect(data.itc.nilTaxable).toBeCloseTo(100, 2);
    // ITC (14.5/head) exceeds output (11/head) -> payable floors at 0
    expect(data.liability.netCgstPayable).toBe(0);
    expect(data.liability.netSgstPayable).toBe(0);
    expect(data.liability.totalPayable).toBe(0);
  });

  it("/hsn rolls up by HSN + rate", async () => {
    const { status, data } = await get(`/api/reports/hsn${Q}`);
    expect(status).toBe(200);
    expect(data.sales).toHaveLength(2);
    const hsn5 = data.sales.find((r: any) => r.gstRate === "5");
    expect(hsn5.hsn).toBe("30049099");
    expect(hsn5.taxable).toBeCloseTo(300, 2);
    const nilRow = data.purchase.find((r: any) => r.gstRate === "0");
    expect(nilRow.taxable).toBeCloseTo(100, 2);
  });

  it("/itc flags bills missing supplier GSTIN", async () => {
    const { status, data } = await get(`/api/reports/itc${Q}`);
    expect(status).toBe(200);
    expect(data.summary.billCount).toBe(2);
    expect(data.summary.grossItc).toBeCloseTo(29, 2);
    expect(data.summary.netItc).toBeCloseTo(29, 2);
    expect(data.summary.withoutSupplierGstin).toBe(1);
    expect(data.bills.find((b: any) => b.billNo === "PUR-001").eligible).toBe("eligible");
  });
});
