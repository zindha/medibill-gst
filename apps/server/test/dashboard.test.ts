import { beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import {
  applySchema,
  dbPath,
  makeDashboardApp,
  seedMedicine,
  seedUser,
  type SeededUser,
} from "./helpers.js";

let app: FastifyInstance;
let ctx: SeededUser;

function raw() {
  return new Database(dbPath());
}

function seedAll() {
  const db = raw();
  const now = Date.now();
  const today = new Date().toISOString().split("T")[0];

  // Debtors / creditors
  const cust = (name: string, balance: number) => {
    const id = nanoid(16);
    db.prepare(
      `INSERT INTO customers (id, name, balance, is_active, created_by, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?, ?)`
    ).run(id, name, balance, ctx.id, now, now);
    return id;
  };
  cust("Owes Big", 500);
  cust("Owes Small", 120);
  cust("Settled", 0);
  cust("Advance Paid", -30); // negative = owes us nothing; excluded from dues

  const supp = (name: string, balance: number) => {
    const id = nanoid(16);
    db.prepare(
      `INSERT INTO suppliers (id, name, balance, is_active, created_by, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?, ?)`
    ).run(id, name, balance, ctx.id, now, now);
    return id;
  };
  supp("We Owe", 900);

  // Payments today: +1000 received, -400 paid, -50 expense, +999 voided (ignored)
  const pay = (type: string, amount: number, voided: number) =>
    db.prepare(
      `INSERT INTO payments (id, date, type, amount, voided, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(nanoid(16), today, type, amount, voided, ctx.id, now);
  pay("received", 1000, 0);
  pay("paid", 400, 0);
  pay("expense", 50, 0);
  pay("received", 999, 1);

  db.close();
}

beforeAll(async () => {
  applySchema();
  ctx = seedUser();
  // qty 4 @ mrp 100 / sale 90 / cost 0 — plus a zero-qty batch (excluded)
  const med = seedMedicine(ctx.id, {
    quantity: 4,
    sellingPrice: 90,
    mrp: 100,
    batches: [{ quantity: 0, expiry: "2099-12-31" }],
  });
  // Fix purchase prices so cost value is deterministic: 60 and 70.
  const db = raw();
  db.prepare("UPDATE batches SET purchase_price = 60 WHERE id = ?").run(med.batchIds[0]);
  db.prepare("UPDATE batches SET purchase_price = 70 WHERE id = ?").run(med.batchIds[1]);
  db.close();
  seedAll();
  app = await makeDashboardApp();
});

async function getKpis() {
  const res = await app.inject({
    method: "GET",
    url: "/api/dashboard/kpis",
    headers: { authorization: `Bearer ${ctx.token}` },
  });
  expect(res.statusCode).toBe(200);
  return res.json()?.data;
}

describe("dashboard kpis (money widgets)", () => {
  it("values stock from active in-stock batches", async () => {
    const data = await getKpis();
    expect(data.stockValue.packs).toBeCloseTo(4, 6);
    expect(data.stockValue.mrpValue).toBeCloseTo(400, 2);
    expect(data.stockValue.saleValue).toBeCloseTo(360, 2);
    expect(data.stockValue.costValue).toBeCloseTo(240, 2);
  });

  it("sums today's collections by type, excluding voided rows", async () => {
    const data = await getKpis();
    expect(data.collections.received).toBeCloseTo(1000, 2);
    expect(data.collections.paid).toBeCloseTo(400, 2);
    expect(data.collections.expenses).toBeCloseTo(50, 2);
  });

  it("lists top debtors and creditors by positive balance", async () => {
    const data = await getKpis();
    expect(data.dues.customerTotal).toBeCloseTo(620, 2);
    expect(data.dues.customers.map((c: any) => c.name)).toEqual(["Owes Big", "Owes Small"]);
    expect(data.dues.customers[0].balance).toBeCloseTo(500, 2);
    expect(data.dues.supplierTotal).toBeCloseTo(900, 2);
    expect(data.dues.suppliers.map((s: any) => s.name)).toEqual(["We Owe"]);
    // Back-compat: outstandingCredit matches the customer dues total.
    expect(data.outstandingCredit).toBeCloseTo(620, 2);
  });
});
