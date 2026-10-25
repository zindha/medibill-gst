import { beforeAll, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import { applySchema, dbPath, seedMedicine, seedUser, type SeededUser } from "./helpers.js";
import purchaseRoutes from "../src/routes/purchases.js";
import supplierRoutes from "../src/routes/suppliers.js";
import medicineRoutes from "../src/routes/medicines.js";

let app: FastifyInstance;

const auth = (u: SeededUser) => ({ authorization: `Bearer ${u.token}` });

function rows<T = any>(sql: string, ...params: any[]): T[] {
  const db = new Database(dbPath());
  try {
    return db.prepare(sql).all(...params) as T[];
  } finally {
    db.close();
  }
}

beforeAll(async () => {
  applySchema();
  app = Fastify({ logger: false });
  await app.register(purchaseRoutes, { prefix: "/api/purchases" });
  await app.register(supplierRoutes, { prefix: "/api/suppliers" });
  await app.register(medicineRoutes, { prefix: "/api/medicines" });
});

// A plain bill: 2 × 100 = 200 + 12 % GST (24) = 224.
function billBody(med: { medicineId: string }, over: Record<string, unknown> = {}) {
  return {
    billNo: `PC-${nanoid(6)}`,
    billDate: "2026-07-10",
    items: [
      {
        medicineId: med.medicineId,
        medicineName: "Test Med",
        batchNo: `PB-${nanoid(4)}`,
        expiryDate: "2099-12-31",
        quantity: 2,
        freeQuantity: 0,
        rate: 100,
        gstRate: "12",
        gstAmount: 24,
        cgst: 12,
        sgst: 12,
        mrp: 150,
      },
    ],
    amountPaid: 0,
    paymentMode: "cash",
    ...over,
  };
}

function postBill(u: SeededUser, body: unknown) {
  return app.inject({
    method: "POST",
    url: "/api/purchases",
    headers: auth(u),
    payload: body as any,
  });
}

async function createSupplier(u: SeededUser, over: Record<string, unknown> = {}) {
  const res = await app.inject({
    method: "POST",
    url: "/api/suppliers",
    headers: auth(u),
    payload: { name: `Supplier ${nanoid(4)}`, ...over },
  });
  expect(res.statusCode).toBe(201);
  return res.json().data;
}

describe("purchase correctness", () => {
  it("rejects a duplicate supplier invoice number for the same supplier but allows it for another supplier", async () => {
    const u = seedUser();
    const med = seedMedicine(u.id);
    const first = await createSupplier(u);
    const second = await createSupplier(u);

    const created = await postBill(u, billBody(med, { supplierId: first.id, supplierInvoiceNo: "INV-9001" }));
    expect(created.statusCode).toBe(201);
    expect(created.json().data.supplierInvoiceNo).toBe("INV-9001");

    const duplicate = await postBill(u, billBody(med, { supplierId: first.id, supplierInvoiceNo: "INV-9001" }));
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error).toBe(
      "A purchase bill with supplier invoice number INV-9001 already exists for this supplier"
    );

    // The same invoice number for a different supplier is a different bill.
    const other = await postBill(u, billBody(med, { supplierId: second.id, supplierInvoiceNo: "INV-9001" }));
    expect(other.statusCode).toBe(201);
  });

  it("derives the payment status from amountPaid: paid / partial / unpaid", async () => {
    const u = seedUser();
    const med = seedMedicine(u.id);

    const paid = await postBill(u, billBody(med, { amountPaid: 224 }));
    expect(paid.statusCode).toBe(201);
    expect(paid.json().data.grandTotal).toBe(224);
    expect(paid.json().data.paymentStatus).toBe("paid");

    const partial = await postBill(u, billBody(med, { amountPaid: 100 }));
    expect(partial.statusCode).toBe(201);
    expect(partial.json().data.paymentStatus).toBe("partial");

    const unpaid = await postBill(u, billBody(med, { amountPaid: 0 }));
    expect(unpaid.statusCode).toBe(201);
    expect(unpaid.json().data.paymentStatus).toBe("unpaid");
  });

  it("settles a bill: amountPaid grows, the status flips and over-payment is rejected", async () => {
    const u = seedUser();
    const med = seedMedicine(u.id);
    const supplier = await createSupplier(u);

    const created = await postBill(u, billBody(med, { supplierId: supplier.id }));
    expect(created.statusCode).toBe(201);
    const bill = created.json().data;
    expect(bill.paymentStatus).toBe("unpaid");
    expect(rows("SELECT balance FROM suppliers WHERE id = ?", supplier.id)[0].balance).toBeCloseTo(224, 2);

    const partial = await app.inject({
      method: "POST",
      url: `/api/purchases/${bill.id}/settle`,
      headers: auth(u),
      payload: { amount: 100, mode: "cash" },
    });
    expect(partial.statusCode).toBe(200);
    expect(partial.json().data.amountPaid).toBe(100);
    expect(partial.json().data.paymentStatus).toBe("partial");
    expect(rows("SELECT balance FROM suppliers WHERE id = ?", supplier.id)[0].balance).toBeCloseTo(124, 2);

    const tooMuch = await app.inject({
      method: "POST",
      url: `/api/purchases/${bill.id}/settle`,
      headers: auth(u),
      payload: { amount: 500, mode: "cash" },
    });
    expect(tooMuch.statusCode).toBe(400);
    expect(tooMuch.json().outstanding).toBe(124);

    const rest = await app.inject({
      method: "POST",
      url: `/api/purchases/${bill.id}/settle`,
      headers: auth(u),
      payload: { amount: 124, mode: "upi" },
    });
    expect(rest.statusCode).toBe(200);
    expect(rest.json().data.amountPaid).toBe(224);
    expect(rest.json().data.paymentStatus).toBe("paid");
    expect(rows("SELECT balance FROM suppliers WHERE id = ?", supplier.id)[0].balance).toBeCloseTo(0, 2);

    // Both settlements are on the supplier ledger.
    const ledger = rows("SELECT amount FROM payments WHERE reference = ? ORDER BY created_at", bill.billNo);
    expect(ledger.length).toBe(2);
    expect(ledger.map((r) => r.amount)).toEqual([100, 124]);
  });

  it("takes the HSN and GST rate from the medicine master when the client omits them", async () => {
    const u = seedUser();
    const created = await app.inject({
      method: "POST",
      url: "/api/medicines",
      headers: auth(u),
      payload: { name: "Master Med", hsnCode: "3004", gstRate: "5" },
    });
    expect(created.statusCode).toBe(201);
    const medicineId = created.json().data.id;

    const body = billBody({ medicineId });
    delete (body.items[0] as any).gstRate;
    (body.items[0] as any).gstAmount = 0;
    (body.items[0] as any).cgst = 0;
    (body.items[0] as any).sgst = 0;

    const res = await postBill(u, body);
    expect(res.statusCode).toBe(201);
    const bill = res.json().data;
    const items = rows("SELECT hsn_code, gst_rate FROM purchase_bill_items WHERE purchase_bill_id = ?", bill.id);
    expect(items[0].hsn_code).toBe("3004");
    expect(items[0].gst_rate).toBe("5");
  });

  it("zeroes every tax amount and the bill tax when the goods are outside GST", async () => {
    const u = seedUser();
    const med = seedMedicine(u.id);

    const res = await postBill(u, billBody(med, { outsideGst: true }));
    expect(res.statusCode).toBe(201);
    const bill = res.json().data;
    expect(bill.outsideGst).toBe(true);
    expect(bill.totalGst).toBe(0);
    expect(bill.grandTotal).toBe(200);

    const items = rows(
      "SELECT gst_rate, gst_amount, cgst, sgst FROM purchase_bill_items WHERE purchase_bill_id = ?",
      bill.id
    );
    expect(items[0].gst_rate).toBe("0");
    expect(items[0].gst_amount).toBe(0);
    expect(items[0].cgst).toBe(0);
    expect(items[0].sgst).toBe(0);
  });

  it("applies per-line markup and discount to the line amount and the bill total", async () => {
    const u = seedUser();
    const med = seedMedicine(u.id);

    const plain = await postBill(u, billBody(med));
    expect(plain.statusCode).toBe(201);
    const plainBill = plain.json().data;
    expect(plainBill.subtotal).toBe(200);
    expect(plainBill.grandTotal).toBe(224);

    // +10 % markup → 100 becomes 110 per unit → 220 for the line.
    const markedBody = billBody(med);
    (markedBody.items[0] as any).markup = 10;
    const marked = await postBill(u, markedBody);
    expect(marked.statusCode).toBe(201);
    const markedBill = marked.json().data;
    expect(markedBill.subtotal).toBe(220);
    expect(markedBill.grandTotal).toBe(244);
    expect(markedBill.grandTotal).not.toBe(plainBill.grandTotal);
    const markedItems = rows(
      "SELECT amount, markup, rate FROM purchase_bill_items WHERE purchase_bill_id = ?",
      markedBill.id
    );
    expect(markedItems[0].amount).toBe(220);
    expect(markedItems[0].markup).toBe(10);
    expect(markedItems[0].rate).toBe(100);

    // A 20 line discount comes off the marked-up line.
    const discountedBody = billBody(med);
    (discountedBody.items[0] as any).markup = 10;
    (discountedBody.items[0] as any).discountAmount = 20;
    const discounted = await postBill(u, discountedBody);
    expect(discounted.statusCode).toBe(201);
    const discountedBill = discounted.json().data;
    expect(discountedBill.subtotal).toBe(200);
    expect(discountedBill.grandTotal).toBe(224);
  });

  it("round-trips the supplier credit and licence fields", async () => {
    const u = seedUser();
    const created = await app.inject({
      method: "POST",
      url: "/api/suppliers",
      headers: auth(u),
      payload: {
        name: "Credit Supplier",
        paymentTerms: "Net 30",
        creditLimit: 50000,
        openingBalance: 1000,
        drugLicenseNo: "MH-20B-4471",
        gstinVerified: true,
      },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().data.id;

    const read = await app.inject({ method: "GET", url: `/api/suppliers/${id}`, headers: auth(u) });
    expect(read.statusCode).toBe(200);
    const supplier = read.json().data;
    expect(supplier.paymentTerms).toBe("Net 30");
    expect(supplier.creditLimit).toBe(50000);
    expect(supplier.openingBalance).toBe(1000);
    expect(supplier.drugLicenseNo).toBe("MH-20B-4471");
    expect(supplier.gstinVerified).toBe(true);

    const updated = await app.inject({
      method: "PUT",
      url: `/api/suppliers/${id}`,
      headers: auth(u),
      payload: { drugLicenseNo: "MH-21C-8890", gstinVerified: false },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().data.drugLicenseNo).toBe("MH-21C-8890");
    expect(updated.json().data.gstinVerified).toBe(false);
  });

  it("round-trips the medicine reorder policy fields", async () => {
    const u = seedUser();
    const created = await app.inject({
      method: "POST",
      url: "/api/medicines",
      headers: auth(u),
      payload: {
        name: "Reorder Med",
        maxQuantity: 500,
        reorderPointDays: 7,
        demandPeriodDays: 45,
        seasonal: true,
      },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().data.id;

    const read = await app.inject({ method: "GET", url: `/api/medicines/${id}`, headers: auth(u) });
    expect(read.statusCode).toBe(200);
    const medicine = read.json().data;
    expect(medicine.maxQuantity).toBe(500);
    expect(medicine.reorderPointDays).toBe(7);
    expect(medicine.demandPeriodDays).toBe(45);
    expect(medicine.seasonal).toBe(true);
  });
});
