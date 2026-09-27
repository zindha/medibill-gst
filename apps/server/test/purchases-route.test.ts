import { beforeAll, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { applySchema, dbPath, seedUser, seedMedicine, type SeededUser } from "./helpers.js";
import purchaseRoutes from "../src/routes/purchases.js";

let app: FastifyInstance;
let user: SeededUser;
let medicineId: string;

beforeAll(async () => {
  applySchema();
  user = seedUser();
  medicineId = seedMedicine(user.id, { name: "MANUAL MED" }).medicineId;
  app = Fastify({ logger: false });
  await app.register(purchaseRoutes, { prefix: "/api/purchases" });
});

describe("POST /api/purchases", () => {
  it("creates a purchase bill with a new batch and a purchase inventory transaction", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/purchases",
      headers: { authorization: `Bearer ${user.token}` },
      payload: {
        billNo: "MANUAL-1",
        billDate: "2026-09-20",
        items: [
          {
            medicineId,
            medicineName: "MANUAL MED",
            batchNo: "MANB1",
            expiryDate: "2027-12-31",
            quantity: 5,
            freeQuantity: 0,
            rate: 10,
            amount: 50,
            gstRate: "12",
            gstAmount: 5.36,
            cgst: 2.68,
            sgst: 2.68,
            mrp: 20,
          },
        ],
        subtotal: 50,
        totalGst: 5.36,
        grandTotal: 55.36,
        amountPaid: 0,
      },
    });
    expect(res.statusCode).toBe(201);

    const db = new Database(dbPath());
    const batch = db
      .prepare("SELECT * FROM batches WHERE batch_no = 'MANB1' AND created_by = ?")
      .get(user.id) as any;
    expect(batch).toBeTruthy();
    expect(batch.purchase_price).toBe(10);

    const tx = db
      .prepare(
        "SELECT * FROM inventory_transactions WHERE reference = 'MANUAL-1' AND created_by = ?"
      )
      .get(user.id) as any;
    expect(tx).toBeTruthy();
    expect(tx.type).toBe("purchase");
    expect(tx.quantity).toBe(5);
    db.close();
  });
});
