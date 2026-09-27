import { beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import { applySchema, dbPath, seedUser, type SeededUser } from "./helpers.js";
import reportRoutes from "../src/routes/reports.js";

let app: FastifyInstance;
let ctx: SeededUser;

function raw() {
  return new Database(dbPath());
}

function seedAll() {
  const db = raw();
  const now = Date.now();
  try { db.exec("DELETE FROM purchase_return_items WHERE return_id IN (SELECT id FROM purchase_returns WHERE return_no = 'PR-GSTR2-001')"); } catch {}
  try { db.exec("DELETE FROM purchase_returns WHERE return_no = 'PR-GSTR2-001'"); } catch {}
  try { db.exec("DELETE FROM purchase_bill_items WHERE purchase_bill_id IN (SELECT id FROM purchase_bills WHERE bill_no IN ('PB-GSTR2-001','PB-GSTR2-002'))"); } catch {}
  try { db.exec("DELETE FROM purchase_bills WHERE bill_no IN ('PB-GSTR2-001','PB-GSTR2-002')"); } catch {}
  try { db.exec("DELETE FROM suppliers WHERE name IN ('Supplier With GST','Supplier Without GST') AND created_by = '" + ctx.id + "'"); } catch {}
  const ins = (table: string, cols: string[], vals: unknown[]) =>
    db.prepare(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).run(...vals);

  // Suppliers
  const supWith = nanoid(16);
  const supWithout = nanoid(16);
  ins("suppliers", ["id", "name", "gstin", "is_active", "created_by", "created_at", "updated_at"],
    [supWith, "Supplier With GST", "27SUPPLIER001A1Z", 1, ctx.id, now, now]);
  ins("suppliers", ["id", "name", "gstin", "is_active", "created_by", "created_at", "updated_at"],
    [supWithout, "Supplier Without GST", null, 1, ctx.id, now, now]);

  // Purchase bills in period 2026-09-10
  const p1 = nanoid(16); // B2B 12% - 10 qty * 10 rate = 100 amount incl? Use derive pattern: amount 112? Keep simple: amount 100 taxable derived? We'll insert consistent with deriveItemTax: amount = taxable+gst. For test: 12% gst -> amount 112 gst 12.
  const p2 = nanoid(16); // B2C 5% - amount 105 gst 5
  ins("purchase_bills",
    ["id", "bill_no", "supplier_id", "supplier_name", "bill_date", "subtotal", "total_gst", "grand_total", "amount_paid", "payment_status", "created_by", "created_at", "updated_at"],
    [p1, "PB-GSTR2-001", supWith, "Supplier With GST", "2026-09-10", 100, 12, 112, 112, "paid", ctx.id, now, now]);
  ins("purchase_bills",
    ["id", "bill_no", "supplier_id", "supplier_name", "bill_date", "subtotal", "total_gst", "grand_total", "amount_paid", "payment_status", "created_by", "created_at", "updated_at"],
    [p2, "PB-GSTR2-002", supWithout, "Supplier Without GST", "2026-09-15", 100, 5, 105, 105, "paid", ctx.id, now, now]);

  const pItemCols = ["id", "purchase_bill_id", "medicine_name", "hsn_code", "quantity", "rate", "amount", "gst_rate", "gst_amount", "cgst", "sgst", "created_at"];
  // p1: 12% single item amount 112 gst 12
  ins("purchase_bill_items", pItemCols, [nanoid(16), p1, "PCM", "3004", 10, 10, 112, "12", 12, 6, 6, now]);
  // p2: 5% single item amount 105 gst 5
  ins("purchase_bill_items", pItemCols, [nanoid(16), p2, "GEN", null, 5, 21, 105, "5", 5, 2.5, 2.5, now]);

  // Purchase return (debit note) against p1 in same period: 12% amount 22.4 gst 2.4 (2 qty)
  const retId = nanoid(16);
  ins("purchase_returns",
    ["id", "return_no", "purchase_bill_id", "supplier_id", "supplier_name", "date", "subtotal", "total_gst", "grand_total", "refund_amount", "refund_mode", "status", "created_by", "created_at"],
    [retId, "PR-GSTR2-001", p1, supWith, "Supplier With GST", "2026-09-20", 20, 2.4, 22.4, 22.4, "cash", "completed", ctx.id, now]);
  ins("purchase_return_items",
    ["id", "return_id", "medicine_name", "hsn_code", "quantity", "unit", "rate", "amount", "gst_rate", "gst_amount", "cgst", "sgst", "refund_amount", "created_at"],
    [nanoid(16), retId, "PCM", "3004", 2, "Strip", 10, 22.4, "12", 2.4, 1.2, 1.2, 22.4, now]);

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
  return { status: res.statusCode, data: res.json()?.data, raw: res.json() };
}

const Q = "?from=2026-09-01&to=2026-09-30";

describe("GSTR-2 inward", () => {
  it("gstr2 sums inward GST by rate net of debit notes", async () => {
    const { status, data } = await get(`/api/reports/gstr2${Q}`);
    expect(status).toBe(200);
    // gross: p1 12 + p2 5 = 17 ; debit 2.4
    expect(data.summary.totalGst).toBeCloseTo(17, 2);
    expect(data.summary.debitGst).toBeCloseTo(2.4, 2);
    expect(data.summary.netGst).toBeCloseTo(14.6, 2);
    // byRate buckets present
    expect(data.byRate["12"]).toBeDefined();
    expect(data.byRate["12"].gst).toBeCloseTo(12, 2);
    expect(data.byRate["5"].gst).toBeCloseTo(5, 2);
    // B2B vs B2C split
    expect(data.b2b.length).toBe(1);
    expect(data.b2b[0].supplierGstin).toBe("27SUPPLIER001A1Z");
    expect(data.b2c.length).toBe(1);
    expect(data.b2c[0].supplierGstin).toBeNull();
    // cdnr = debit notes
    expect(data.cdnr.length).toBe(1);
    expect(data.cdnr[0].returnNo).toBe("PR-GSTR2-001");
    // summary counts
    expect(data.summary.billCount).toBe(2);
    expect(data.summary.debitNoteCount).toBe(1);
    expect(data.summary.totalTaxable).toBeGreaterThan(0);
    expect(data.summary.netTaxable).toBeCloseTo(data.summary.totalTaxable - data.summary.debitTaxable, 2);
  });

  it("gstr2 empty period returns zeros", async () => {
    const { status, data } = await get(`/api/reports/gstr2?from=2020-01-01&to=2020-01-31`);
    expect(status).toBe(200);
    expect(data.summary.billCount).toBe(0);
    expect(data.summary.totalGst).toBeCloseTo(0, 2);
    expect(data.summary.netGst).toBeCloseTo(0, 2);
    expect(data.b2b.length).toBe(0);
    expect(data.b2c.length).toBe(0);
    expect(data.cdnr.length).toBe(0);
  });
});
