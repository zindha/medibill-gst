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

function setBatchQuantity(medicineId: string, quantity: number) {
  const db = raw();
  // set all batches for this medicine to distribute quantity: keep one batch with quantity, others 0
  const batches = db.prepare(`SELECT id FROM batches WHERE medicine_id = ?`).all(medicineId) as any[];
  if (batches.length) {
    db.prepare(`UPDATE batches SET quantity = 0 WHERE medicine_id = ?`).run(medicineId);
    db.prepare(`UPDATE batches SET quantity = ? WHERE id = ?`).run(quantity, batches[0].id);
  }
  db.close();
}

function seedSupplier(name: string): string {
  const db = raw();
  const id = nanoid(16);
  const now = Date.now();
  db.prepare(`INSERT INTO suppliers (id, name, is_active, created_by, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)`).run(id, name, ctx.id, now, now);
  db.close();
  return id;
}

function insertPurchaseBill(opts: {
  billDate: string;
  supplierId?: string | null;
  supplierName?: string | null;
  items: Array<{ medicineId?: string; medicineName: string; quantity: number; rate: number; gstRate: string }>;
}) {
  const db = raw();
  const now = Date.now();
  const billId = nanoid(16);
  const billNo = `PB-${nanoid(6)}`;
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
  db.prepare(`INSERT INTO purchase_bills (id, bill_no, supplier_id, supplier_name, bill_date, subtotal, total_gst, grand_total, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(billId, billNo, opts.supplierId ?? null, opts.supplierName ?? null, opts.billDate, subtotal, totalGst, grand, ctx.id, now, now);
  for (const r of rows) {
    db.prepare(`INSERT INTO purchase_bill_items (id, purchase_bill_id, medicine_id, medicine_name, quantity, rate, amount, gst_rate, gst_amount, cgst, sgst, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(nanoid(16), billId, r.medicineId ?? null, r.medicineName, r.quantity, r.rate, r.amount, r.gstRate, r.gstAmount, r.cgst, r.sgst, now);
  }
  db.close();
  return billId;
}

beforeAll(async () => {
  applySchema();
  ctx = seedUser();

  // Shortbook medicines: LOW with high shortage, MID with lower shortage, OK above reorder should be excluded
  const low = seedMedicine(ctx.id, { name: "LOWMED", quantity: 5 });
  updateMedicine(low.medicineId, { brand: "LowBrand", category: "TestCat", min_quantity: 50, reorder_level: 100, mrp: 20, purchase_price: 10, selling_price: 15 });
  setBatchQuantity(low.medicineId, 5);

  const mid = seedMedicine(ctx.id, { name: "MIDMED", quantity: 60 });
  updateMedicine(mid.medicineId, { brand: "MidBrand", category: "TestCat", min_quantity: 50, reorder_level: 100, mrp: 25, purchase_price: 12, selling_price: 18 });
  setBatchQuantity(mid.medicineId, 60);

  const ok = seedMedicine(ctx.id, { name: "OKMED", quantity: 150 });
  updateMedicine(ok.medicineId, { brand: "OkBrand", category: "TestCat", min_quantity: 50, reorder_level: 100, mrp: 30, purchase_price: 15, selling_price: 22 });
  setBatchQuantity(ok.medicineId, 150);

  // Another med with only minQuantity (no reorderLevel) to test fallback
  const minOnly = seedMedicine(ctx.id, { name: "MINONLY", quantity: 5 });
  updateMedicine(minOnly.medicineId, { brand: "MinBrand", category: "TestCat", min_quantity: 20, reorder_level: null, mrp: 18, purchase_price: 9, selling_price: 14 });
  setBatchQuantity(minOnly.medicineId, 5);

  // q filter brand test: unique brand
  const qbrand = seedMedicine(ctx.id, { name: "QFILTERMED", quantity: 1 });
  updateMedicine(qbrand.medicineId, { brand: "UniqueBrandXYZ", category: "TestCat", min_quantity: 10, reorder_level: 20, mrp: 22, purchase_price: 11, selling_price: 16 });
  setBatchQuantity(qbrand.medicineId, 1);

  // Purchase order register data: two suppliers, same medicine across multiple bills
  const suppA = seedSupplier("Supplier A");
  const suppB = seedSupplier("Supplier B");
  // Need medicine ids for purchase orders
  insertPurchaseBill({ billDate: "2026-09-05", supplierId: suppA, supplierName: "Supplier A", items: [{ medicineId: low.medicineId, medicineName: "LOWMED", quantity: 10, rate: 10, gstRate: "12" }] });
  insertPurchaseBill({ billDate: "2026-09-15", supplierId: suppA, supplierName: "Supplier A", items: [{ medicineId: low.medicineId, medicineName: "LOWMED", quantity: 5, rate: 10, gstRate: "12" }] });
  insertPurchaseBill({ billDate: "2026-09-20", supplierId: suppB, supplierName: "Supplier B", items: [{ medicineId: mid.medicineId, medicineName: "MIDMED", quantity: 8, rate: 12, gstRate: "12" }] });

  app = Fastify({ logger: false });
  await app.register(reportRoutes, { prefix: "/api/reports" });
});

async function get(url: string) {
  const res = await app.inject({ method: "GET", url, headers: { authorization: `Bearer ${ctx.token}` } });
  return { status: res.statusCode, body: res.json() as any };
}

describe("order reports parity", () => {
  it("shortbook returns low-stock medicines ordered by shortage %", async () => {
    const { status, body } = await get("/api/reports/order/shortbook");
    expect(status).toBe(200);
    const data = body.data ?? body;
    const rows: any[] = data.rows ?? [];
    expect(Array.isArray(rows)).toBe(true);
    // LOWMED should be present and before MIDMED (higher shortage)
    const lowIdx = rows.findIndex((r: any) => String(r.name ?? r.medicineName ?? "").toUpperCase().includes("LOWMED"));
    const midIdx = rows.findIndex((r: any) => String(r.name ?? r.medicineName ?? "").toUpperCase().includes("MIDMED"));
    expect(lowIdx).toBeGreaterThanOrEqual(0);
    expect(midIdx).toBeGreaterThanOrEqual(0);
    expect(lowIdx).toBeLessThan(midIdx);
    // OKMED should NOT be in shortbook (stock > reorder)
    const okIdx = rows.findIndex((r: any) => String(r.name ?? "").toUpperCase().includes("OKMED"));
    expect(okIdx).toBe(-1);
    // check required fields
    const low = rows[lowIdx];
    expect(low).toHaveProperty("medicineId");
    expect(low).toHaveProperty("name");
    expect(low).toHaveProperty("brand");
    expect(low).toHaveProperty("category");
    expect(low).toHaveProperty("stock");
    expect(low).toHaveProperty("shortagePercent");
    expect(low).toHaveProperty("orderQty");
    expect(low).toHaveProperty("mrp");
    expect(typeof low.stock).toBe("number");
    expect(typeof low.shortagePercent).toBe("number");
    // orderQty = reorderLevel - stock
    expect(low.orderQty).toBe(95); // 100 - 5
    expect(low.shortagePercent).toBeCloseTo(95, 1);
    // ensure sorted by shortage desc when sort=shortage
    const { body: body2 } = await get("/api/reports/order/shortbook?sort=shortage");
    const rows2 = (body2.data ?? body2).rows ?? [];
    for (let i = 1; i < rows2.length; i++) {
      expect(rows2[i - 1].shortagePercent).toBeGreaterThanOrEqual(rows2[i].shortagePercent);
    }
  });

  it("shortbook q filter by name and brand", async () => {
    const { status, body } = await get("/api/reports/order/shortbook?q=LOWMED");
    expect(status).toBe(200);
    const rows = (body.data ?? body).rows ?? [];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r: any) => String(r.name ?? "").toLowerCase().includes("lowmed") || String(r.brand ?? "").toLowerCase().includes("lowmed"))).toBe(true);

    const { body: body2 } = await get("/api/reports/order/shortbook?q=UniqueBrandXYZ");
    const rows2 = (body2.data ?? body2).rows ?? [];
    expect(rows2.length).toBe(1);
    expect(String(rows2[0].brand).toLowerCase()).toContain("uniquebrandxyz");

    // sort by name
    const { body: body3 } = await get("/api/reports/order/shortbook?sort=name");
    const rows3 = (body3.data ?? body3).rows ?? [];
    const names = rows3.map((r: any) => String(r.name));
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  it("purchase order register grouped by product", async () => {
    const { status, body } = await get("/api/reports/order/purchase-orders?from=2026-09-01&to=2026-09-30&groupBy=product");
    expect(status).toBe(200);
    const data = body.data ?? body;
    const rows: any[] = data.rows ?? [];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    const low = rows.find((r: any) => String(r.medicineName ?? r.name ?? "").toUpperCase().includes("LOWMED"));
    expect(low).toBeDefined();
    expect(typeof low.totalOrderedQty).toBe("number");
    expect(typeof low.billCount).toBe("number");
    expect(Array.isArray(low.suppliers)).toBe(true);
    expect(typeof low.totalAmount).toBe("number");
    expect(low.lastBillDate).toBeDefined();
    // LOWMED ordered 10+5 =15 across 2 bills, single supplier
    expect(low.totalOrderedQty).toBe(15);
    expect(low.billCount).toBe(2);
    expect(low.suppliers).toContain("Supplier A");

    // q filter
    const { body: body2 } = await get("/api/reports/order/purchase-orders?from=2026-09-01&to=2026-09-30&q=LOWMED");
    const rows2 = (body2.data ?? body2).rows ?? [];
    expect(rows2.every((r: any) => String(r.medicineName ?? r.name ?? "").toLowerCase().includes("lowmed"))).toBe(true);

    // default last 30d when no from/to (should still return something, not error)
    const { status: s3 } = await get("/api/reports/order/purchase-orders");
    expect(s3).toBe(200);
  });
});
