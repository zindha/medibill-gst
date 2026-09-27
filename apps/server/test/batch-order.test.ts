import { beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import {
  applySchema,
  dbPath,
  getBatchQuantity,
  makeApp,
  seedMedicine,
  seedUser,
  type SeededUser,
  type SeededMedicine,
} from "./helpers.js";

let app: FastifyInstance;

function bodyFor(med: SeededMedicine, qty: number, batchOrder?: "fefo" | "fifo") {
  return {
    date: "2099-01-01",
    subtotal: 95.24,
    totalGst: 4.76,
    cgst: 2.38,
    sgst: 2.38,
    grandTotal: 100,
    amountPaid: 100,
    paymentMode: "cash",
    status: "paid",
    discount: 0,
    discountAmount: 0,
    ...(batchOrder ? { batchOrder } : {}),
    items: [
      {
        medicineId: med.medicineId,
        medicineName: "Test Med",
        quantity: qty,
        unit: "Strip",
        mrp: 100,
        rate: 95.24,
        amount: 95.24,
        gstRate: "5",
        gstAmount: 4.76,
        cgst: 2.38,
        sgst: 2.38,
      },
    ],
  };
}

async function postSale(med: SeededMedicine, ctx: SeededUser, qty: number, batchOrder?: "fefo" | "fifo") {
  return app.inject({
    method: "POST",
    url: "/api/invoices",
    headers: { authorization: `Bearer ${ctx.token}` },
    payload: bodyFor(med, qty, batchOrder),
  });
}

/**
 * Seed a medicine whose FEFO and FIFO orders disagree: batch A was received
 * first (older createdAt) but expires LATER than batch B.
 */
function seedSplitMedicine(ctx: SeededUser): SeededMedicine {
  const med = seedMedicine(ctx.id, {
    quantity: 10,
    expiry: "2030-01-01",
    batches: [{ quantity: 10, expiry: "2027-01-01" }],
  });
  const sqlite = new Database(dbPath());
  const now = Date.now();
  sqlite.prepare("UPDATE batches SET created_at = ? WHERE id = ?").run(now - 100000, med.batchIds[0]);
  sqlite.prepare("UPDATE batches SET created_at = ? WHERE id = ?").run(now, med.batchIds[1]);
  sqlite.close();
  return med;
}

beforeAll(async () => {
  applySchema();
  app = await makeApp();
});

describe("batch issue order", () => {
  it("fifo deducts the oldest-received batch first", async () => {
    const ctx = seedUser();
    const med = seedSplitMedicine(ctx);
    const [batchA, batchB] = med.batchIds;

    const res = await postSale(med, ctx, 5, "fifo");
    expect(res.statusCode).toBe(201);

    // Batch A (older receipt, later expiry) takes the full sale.
    expect(getBatchQuantity(batchA)).toBe(5);
    expect(getBatchQuantity(batchB)).toBe(10);
  });

  it("fefo deducts the earliest-expiry batch first", async () => {
    const ctx = seedUser();
    const med = seedSplitMedicine(ctx);
    const [batchA, batchB] = med.batchIds;

    const res = await postSale(med, ctx, 5, "fefo");
    expect(res.statusCode).toBe(201);

    // Batch B (earlier expiry, newer receipt) takes the full sale.
    expect(getBatchQuantity(batchA)).toBe(10);
    expect(getBatchQuantity(batchB)).toBe(5);
  });

  it("defaults to fefo when batchOrder is omitted", async () => {
    const ctx = seedUser();
    const med = seedSplitMedicine(ctx);
    const [batchA, batchB] = med.batchIds;

    const res = await postSale(med, ctx, 5);
    expect(res.statusCode).toBe(201);

    expect(getBatchQuantity(batchA)).toBe(10);
    expect(getBatchQuantity(batchB)).toBe(5);
  });
});
