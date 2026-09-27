import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import {
  applySchema,
  dbPath,
  seedCustomer,
  seedMedicine,
  seedUser,
  type SeededMedicine,
  type SeededUser,
} from "./helpers.js";
import customerOrderRoutes from "../src/routes/customerOrders.js";
import publicOrderRoutes from "../src/routes/publicOrders.js";
import { db } from "../src/db/index.js";
import { auditEvents } from "../src/db/schema/index.js";
import { and, eq, like } from "drizzle-orm";
import { fileStorage } from "../src/services/fileStorage.js";
import { setOnlineOrdersEnabled } from "../src/services/customerOrders.js";

let app: FastifyInstance;

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

function seedUserWithRole(role: "admin" | "pharmacist" | "cashier"): SeededUser {
  const now = Date.now();
  const id = nanoid(16);
  const token = nanoid(32);
  const sqlite = new Database(dbPath());
  sqlite
    .prepare(
      `INSERT INTO users (id, email, name, role, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`
    )
    .run(id, `user-${id}@test.local`, `Role ${role}`, role, now, now);
  sqlite
    .prepare(
      `INSERT INTO sessions (id, user_id, token, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(nanoid(16), id, token, now + 7 * 24 * 3600e3, now);
  sqlite.close();
  return { id, token };
}

/** Seed an invoice row directly (the invoice route isn't registered here). */
function seedInvoice(ownerId: string): { id: string; invoiceNo: string } {
  const id = nanoid(16);
  const invoiceNo = `INV-${id.slice(0, 8)}`;
  const now = Date.now();
  const sqlite = new Database(dbPath());
  sqlite
    .prepare(
      `INSERT INTO invoices (id, invoice_no, date, subtotal, total_gst, cgst, sgst,
        grand_total, amount_paid, status, created_by, created_at, updated_at)
       VALUES (?, ?, '2099-01-01', 0, 0, 0, 0, 0, 0, 'paid', ?, ?, ?)`
    )
    .run(id, invoiceNo, ownerId, now, now);
  sqlite.close();
  return { id, invoiceNo };
}

function setMedicineActive(medicineId: string, active: 0 | 1): void {
  const sqlite = new Database(dbPath());
  sqlite.prepare("UPDATE medicines SET is_active = ? WHERE id = ?").run(active, medicineId);
  sqlite.close();
}

/**
 * seedMedicine() only fills the batch price; the catalog snapshot resolves
 * unit_price from medicines.selling_price, so price-sensitive tests set it.
 */
function setMedicinePrice(medicineId: string, price: number): void {
  const sqlite = new Database(dbPath());
  sqlite.prepare("UPDATE medicines SET selling_price = ? WHERE id = ?").run(price, medicineId);
  sqlite.close();
}

function setOrderCreatedAt(orderId: string, ts: number): void {
  const sqlite = new Database(dbPath());
  sqlite.prepare("UPDATE customer_orders SET created_at = ? WHERE id = ?").run(ts, orderId);
  sqlite.close();
}

const createPublicOrder = (payload: unknown) =>
  app.inject({ method: "POST", url: "/api/public/orders", payload: payload as any });

function orderPayload(
  storeId: string,
  items: Array<{ medicineId: string; quantity: number }>,
  extra: Record<string, unknown> = {}
) {
  return {
    storeId,
    customerName: "Asha Rao",
    phone: "9876543210",
    deliveryAddress: "12 MG Road",
    notes: "Call at the gate",
    items,
    ...extra,
  };
}

const listOrdersAs = (token: string, qs = "") =>
  app.inject({ method: "GET", url: `/api/orders${qs}`, headers: auth(token) });

const getOrderAs = (token: string, id: string) =>
  app.inject({ method: "GET", url: `/api/orders/${id}`, headers: auth(token) });

const transitionAs = (token: string, id: string, action: string, payload: unknown = {}) =>
  app.inject({
    method: "POST",
    url: `/api/orders/${id}/${action}`,
    headers: auth(token),
    payload: payload as any,
  });

async function makeOrder(
  storeId: string,
  med: SeededMedicine,
  quantity = 2,
  extra: Record<string, unknown> = {}
): Promise<{ id: string; body: any }> {
  const res = await createPublicOrder(
    orderPayload(storeId, [{ medicineId: med.medicineId, quantity }], extra)
  );
  expect(res.statusCode).toBe(201);
  const body = res.json();
  return { id: body.data.id, body: body.data };
}

const auditRows = (action: string, entityId: string) =>
  db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.action, action), eq(auditEvents.entityId, entityId)))
    .all();

beforeAll(async () => {
  applySchema();
  app = Fastify({ logger: false });
  await app.register(customerOrderRoutes, { prefix: "/api/orders" });
  await app.register(publicOrderRoutes, { prefix: "/api/public" });
  await setOnlineOrdersEnabled(true);
});

afterEach(async () => {
  // The enabled flag is an install-wide singleton — always restore it so one
  // disabled test can never leak into the next.
  await setOnlineOrdersEnabled(true);
});

afterAll(async () => {
  await app.close();
});

// ---------------------------------------------------------------------------
// Public order creation
// ---------------------------------------------------------------------------
describe("POST /api/public/orders — create", () => {
  it("creates a pending order with price snapshot and correct subtotal", async () => {
    const store = seedUser();
    const med = seedMedicine(store.id, { name: "Panadol 500", sellingPrice: 95.24 });
    setMedicinePrice(med.medicineId, 95.24);

    const res = await createPublicOrder(
      orderPayload(store.id, [{ medicineId: med.medicineId, quantity: 2 }])
    );
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("pending");
    expect(body.data.storeId).toBe(store.id);
    expect(body.data.createdBy).toBe(store.id);
    expect(body.data.customerName).toBe("Asha Rao");
    expect(body.data.phone).toBe("9876543210");
    expect(body.data.deliveryAddress).toBe("12 MG Road");
    expect(body.data.subtotal).toBeCloseTo(95.24 * 2, 2);
    expect(body.data.invoiceId).toBeNull();
    expect(body.data.reason).toBeNull();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].medicineName).toBe("Panadol 500");
    expect(body.data.items[0].unitPrice).toBeCloseTo(95.24, 2);
    expect(body.data.items[0].quantity).toBe(2);
  });

  it("rejects a missing phone with 400", async () => {
    const store = seedUser();
    const med = seedMedicine(store.id);
    const res = await createPublicOrder({
      storeId: store.id,
      customerName: "No Phone",
      items: [{ medicineId: med.medicineId, quantity: 1 }],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().success).toBe(false);
  });

  it("rejects empty items with 400", async () => {
    const store = seedUser();
    const res = await createPublicOrder(orderPayload(store.id, []));
    expect(res.statusCode).toBe(400);
    expect(res.json().success).toBe(false);
  });

  it("rejects notes above 500 chars and addresses above 300 chars (zod caps)", async () => {
    const store = seedUser();
    const med = seedMedicine(store.id);
    const res = await createPublicOrder(
      orderPayload(store.id, [{ medicineId: med.medicineId, quantity: 1 }], {
        notes: "x".repeat(501),
        deliveryAddress: "y".repeat(301),
      })
    );
    expect(res.statusCode).toBe(400);
  });

  it("rejects an unknown medicine with 400 and lists the inactive medicine's name", async () => {
    const store = seedUser();
    const med = seedMedicine(store.id, { name: "Hidden Med" });
    setMedicineActive(med.medicineId, 0);

    const res = await createPublicOrder(
      orderPayload(store.id, [{ medicineId: med.medicineId, quantity: 1 }])
    );
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toContain("Hidden Med");
    expect(body.details.inactive).toContain("Hidden Med");
  });

  it("treats another tenant's medicine as unknown and never leaks its name", async () => {
    const storeA = seedUser();
    const storeB = seedUser();
    const foreign = seedMedicine(storeB.id, { name: "Foreign Secret Med" });

    const res = await createPublicOrder(
      orderPayload(storeA.id, [{ medicineId: foreign.medicineId, quantity: 1 }])
    );
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.details.unknown).toContain(foreign.medicineId);
    expect(JSON.stringify(body)).not.toContain("Foreign Secret Med");
  });

  it("returns 403 when online ordering is disabled", async () => {
    const store = seedUser();
    const med = seedMedicine(store.id);
    await setOnlineOrdersEnabled(false);

    const res = await createPublicOrder(
      orderPayload(store.id, [{ medicineId: med.medicineId, quantity: 1 }])
    );
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("Online ordering is disabled");
  });

  it("returns 404 for an inactive/unknown storeId", async () => {
    const store = seedUser();
    const med = seedMedicine(store.id);
    const sqlite = new Database(dbPath());
    sqlite.prepare("UPDATE users SET is_active = 0 WHERE id = ?").run(store.id);
    sqlite.close();

    const res = await createPublicOrder(
      orderPayload(store.id, [{ medicineId: med.medicineId, quantity: 1 }])
    );
    expect(res.statusCode).toBe(404);
  });

  it("rejects a foreign prescriptionFileId with 400", async () => {
    const store = seedUser();
    const stranger = seedUser();
    const med = seedMedicine(store.id);
    const file = await fileStorage.put({
      ownerId: stranger.id,
      purpose: "order-prescription",
      filename: "rx.jpg",
      contentType: "image/jpeg",
      bytes: Buffer.from("stranger-rx"),
    });

    const res = await createPublicOrder(
      orderPayload(store.id, [{ medicineId: med.medicineId, quantity: 1 }], {
        prescriptionFileId: file.id,
      })
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("prescription file");
  });

  it("accepts an owned prescriptionFileId and customerId", async () => {
    const store = seedUser();
    const med = seedMedicine(store.id);
    const customer = seedCustomer(store.id, { name: "Regular" });
    const file = await fileStorage.put({
      ownerId: store.id,
      purpose: "order-prescription",
      filename: "rx.jpg",
      contentType: "image/jpeg",
      bytes: Buffer.from("my-rx"),
    });

    const res = await createPublicOrder(
      orderPayload(store.id, [{ medicineId: med.medicineId, quantity: 1 }], {
        customerId: customer.id,
        prescriptionFileId: file.id,
      })
    );
    expect(res.statusCode).toBe(201);
    expect(res.json().data.customerId).toBe(customer.id);
    expect(res.json().data.prescriptionFileId).toBe(file.id);
  });

  it("rejects a foreign customerId with 400", async () => {
    const store = seedUser();
    const stranger = seedUser();
    const med = seedMedicine(store.id);
    const customer = seedCustomer(stranger.id);

    const res = await createPublicOrder(
      orderPayload(store.id, [{ medicineId: med.medicineId, quantity: 1 }], {
        customerId: customer.id,
      })
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("customer");
  });
});

// ---------------------------------------------------------------------------
// Public catalog
// ---------------------------------------------------------------------------
describe("GET /api/public/medicines — catalog", () => {
  it("requires q of at least 2 characters (400)", async () => {
    const store = seedUser();
    const res = await app.inject({
      method: "GET",
      url: `/api/public/medicines?storeId=${store.id}&q=a`,
    });
    expect(res.statusCode).toBe(400);
  });

  it("scopes results to storeId and never exposes foreign medicines", async () => {
    const storeA = seedUser();
    const storeB = seedUser();
    const mine = seedMedicine(storeA.id, { name: "AlphaCillin 500" });
    setMedicinePrice(mine.medicineId, 42.5);
    seedMedicine(storeB.id, { name: "BetaCillin 500" });

    const hit = await app.inject({
      method: "GET",
      url: `/api/public/medicines?storeId=${storeA.id}&q=Alpha`,
    });
    expect(hit.statusCode).toBe(200);
    const rows = hit.json().data;
    expect(rows).toHaveLength(1);
    expect(rows[0].medicineId).toBe(mine.medicineId);
    expect(rows[0].name).toBe("AlphaCillin 500");
    expect(rows[0].inStock).toBe(true);
    expect(rows[0].sellingPrice).toBeGreaterThan(0);
    // No purchase price / internal leakage.
    expect(rows[0].purchasePrice).toBeUndefined();

    const miss = await app.inject({
      method: "GET",
      url: `/api/public/medicines?storeId=${storeA.id}&q=Beta`,
    });
    expect(miss.json().data).toHaveLength(0);
  });

  it("marks out-of-stock medicines with inStock false", async () => {
    const store = seedUser();
    seedMedicine(store.id, { name: "GoneTab", quantity: 0 });
    const res = await app.inject({
      method: "GET",
      url: `/api/public/medicines?storeId=${store.id}&q=Gone`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].inStock).toBe(false);
  });

  it("honors limit and rejects limit above the 50-row cap", async () => {
    const store = seedUser();
    seedMedicine(store.id, { name: "LimitA Tab" });
    seedMedicine(store.id, { name: "LimitB Tab" });

    const limited = await app.inject({
      method: "GET",
      url: `/api/public/medicines?storeId=${store.id}&q=Limit&limit=1`,
    });
    expect(limited.statusCode).toBe(200);
    expect(limited.json().data).toHaveLength(1);

    const capped = await app.inject({
      method: "GET",
      url: `/api/public/medicines?storeId=${store.id}&q=Limit&limit=99`,
    });
    expect(capped.statusCode).toBe(400);
  });
});

describe("GET /api/public/store — portal header", () => {
  it("returns the store name for an active storeId and 404 otherwise", async () => {
    const store = seedUser();
    const res = await app.inject({
      method: "GET",
      url: `/api/public/store?storeId=${store.id}`,
    });
    expect(res.statusCode).toBe(200);
    // No store_name setting in this file → falls back to the owner's name.
    expect(res.json().data.name).toBe("Tester");

    const bad = await app.inject({
      method: "GET",
      url: "/api/public/store?storeId=missing-store",
    });
    expect(bad.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Public files + status view
// ---------------------------------------------------------------------------
describe("POST /api/public/files — prescription upload", () => {
  const b64 = (buf: Buffer) => buf.toString("base64");

  it("stores a file scoped to the store and de-duplicates by sha256", async () => {
    const store = seedUser();
    const payload = {
      storeId: store.id,
      filename: "rx.jpg",
      contentType: "image/jpeg",
      data: b64(Buffer.from("prescription-bytes")),
    };

    const first = await app.inject({ method: "POST", url: "/api/public/files", payload });
    expect(first.statusCode).toBe(201);
    expect(first.json().data.duplicate).toBe(false);

    const again = await app.inject({ method: "POST", url: "/api/public/files", payload });
    expect(again.statusCode).toBe(200);
    expect(again.json().data.duplicate).toBe(true);
    expect(again.json().data.id).toBe(first.json().data.id);
  });

  it("rejects an oversize file with 400", async () => {
    const store = seedUser();
    const oversize = Buffer.alloc(10 * 1024 * 1024 + 1, 7);
    const res = await app.inject({
      method: "POST",
      url: "/api/public/files",
      payload: {
        storeId: store.id,
        filename: "big.jpg",
        contentType: "image/jpeg",
        data: oversize.toString("base64"),
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("too large");
  });

  it("rejects an invalid base64 payload with 400", async () => {
    const store = seedUser();
    const res = await app.inject({
      method: "POST",
      url: "/api/public/files",
      payload: { storeId: store.id, filename: "a.jpg", contentType: "image/jpeg", data: "!!not-base64!!" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /api/public/orders/:id — customer status view", () => {
  it("returns only customer-safe fields for the right storeId", async () => {
    const store = seedUser();
    const med = seedMedicine(store.id, { name: "SafeMed" });
    const { id } = await makeOrder(store.id, med);

    const res = await app.inject({
      method: "GET",
      url: `/api/public/orders/${id}?storeId=${store.id}`,
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.id).toBe(id);
    expect(data.status).toBe("pending");
    expect(data.createdAt).toBeTruthy();
    expect(data.items).toEqual([{ medicineName: "SafeMed", quantity: 2 }]);
    // No internals leak.
    expect(data.phone).toBeUndefined();
    expect(data.deliveryAddress).toBeUndefined();
    expect(data.subtotal).toBeUndefined();
    expect(data.invoiceId).toBeUndefined();
    expect(data.storeId).toBeUndefined();
  });

  it("returns 404 for the wrong storeId (identical to an unknown id)", async () => {
    const store = seedUser();
    const other = seedUser();
    const med = seedMedicine(store.id);
    const { id } = await makeOrder(store.id, med);

    const wrongStore = await app.inject({
      method: "GET",
      url: `/api/public/orders/${id}?storeId=${other.id}`,
    });
    expect(wrongStore.statusCode).toBe(404);

    const unknown = await app.inject({
      method: "GET",
      url: `/api/public/orders/does-not-exist?storeId=${store.id}`,
    });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().error).toBe(wrongStore.json().error);
  });
});

// ---------------------------------------------------------------------------
// Staff state machine
// ---------------------------------------------------------------------------
describe("order state machine", () => {
  it("accepts a pending order when stock is available", async () => {
    const store = seedUser();
    const staff = seedUser();
    const med = seedMedicine(store.id, { quantity: 50 });
    const { id } = await makeOrder(store.id, med, 5);

    const res = await transitionAs(staff.token, id, "accept");
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("accepted");

    // Soft reservation: NO stock was deducted by acceptance.
    const sqlite = new Database(dbPath());
    const row = sqlite.prepare("SELECT quantity FROM batches WHERE medicine_id = ?").get(med.medicineId) as {
      quantity: number;
    };
    sqlite.close();
    expect(row.quantity).toBe(50);
  });

  it("refuses accept out of order with 409", async () => {
    const store = seedUser();
    const staff = seedUser();
    const med = seedMedicine(store.id);
    const { id } = await makeOrder(store.id, med);

    await transitionAs(staff.token, id, "accept");
    const second = await transitionAs(staff.token, id, "accept");
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toBe("Cannot accept order in accepted");
  });

  it("refuses accept with insufficient stock and returns per-item detail", async () => {
    const store = seedUser();
    const staff = seedUser();
    const med = seedMedicine(store.id, { name: "RareMed", quantity: 1 });
    const { id } = await makeOrder(store.id, med, 5);

    const res = await transitionAs(staff.token, id, "accept");
    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.error).toBe("Insufficient stock");
    expect(body.details.items).toEqual([
      { medicineName: "RareMed", available: 1, requested: 5 },
    ]);
  });

  it("keeps pack/ready linear (409 on wrong state)", async () => {
    const store = seedUser();
    const staff = seedUser();
    const med = seedMedicine(store.id);
    const { id } = await makeOrder(store.id, med);

    // pack straight from pending → 409
    const earlyPack = await transitionAs(staff.token, id, "pack");
    expect(earlyPack.statusCode).toBe(409);
    expect(earlyPack.json().error).toBe("Cannot pack order in pending");

    await transitionAs(staff.token, id, "accept");
    // ready straight from accepted → 409
    const earlyReady = await transitionAs(staff.token, id, "ready");
    expect(earlyReady.statusCode).toBe(409);

    const pack = await transitionAs(staff.token, id, "pack");
    expect(pack.statusCode).toBe(200);
    expect(pack.json().data.status).toBe("packed");

    const ready = await transitionAs(staff.token, id, "ready");
    expect(ready.statusCode).toBe(200);
    expect(ready.json().data.status).toBe("ready");
  });

  it("deliver validates invoiceId (400 missing / 400 foreign / 409 already linked)", async () => {
    const store = seedUser();
    const stranger = seedUser();
    const staff = seedUser();
    const med = seedMedicine(store.id);

    const missing = await makeOrder(store.id, med);
    await transitionAs(staff.token, missing.id, "accept");
    const noInvoice = await transitionAs(staff.token, missing.id, "deliver", {});
    expect(noInvoice.statusCode).toBe(400);

    const foreign = seedInvoice(stranger.id);
    const foreignRes = await transitionAs(staff.token, missing.id, "deliver", {
      invoiceId: foreign.id,
    });
    expect(foreignRes.statusCode).toBe(400);
    expect(foreignRes.json().error).toContain("does not belong");

    const notFound = await transitionAs(staff.token, missing.id, "deliver", {
      invoiceId: "nope-nope",
    });
    expect(notFound.statusCode).toBe(404);

    // Happy path → delivered + invoice linked.
    const invoice = seedInvoice(store.id);
    const delivered = await transitionAs(staff.token, missing.id, "deliver", {
      invoiceId: invoice.id,
    });
    expect(delivered.statusCode).toBe(200);
    expect(delivered.json().data.status).toBe("delivered");
    expect(delivered.json().data.invoiceId).toBe(invoice.id);

    // Same invoice on a second order → 409.
    const second = await makeOrder(store.id, med);
    await transitionAs(staff.token, second.id, "accept");
    const reused = await transitionAs(staff.token, second.id, "deliver", {
      invoiceId: invoice.id,
    });
    expect(reused.statusCode).toBe(409);
    expect(reused.json().error).toContain("already linked");
  });

  it("allows deliver to skip straight from accepted (allow-skip)", async () => {
    const store = seedUser();
    const staff = seedUser();
    const med = seedMedicine(store.id);
    const { id } = await makeOrder(store.id, med);
    await transitionAs(staff.token, id, "accept");
    const invoice = seedInvoice(store.id);

    const res = await transitionAs(staff.token, id, "deliver", { invoiceId: invoice.id });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("delivered");
  });

  it("reject requires a reason of at least 3 chars", async () => {
    const store = seedUser();
    const staff = seedUser();
    const med = seedMedicine(store.id);
    const { id } = await makeOrder(store.id, med);

    const short = await transitionAs(staff.token, id, "reject", { reason: "no" });
    expect(short.statusCode).toBe(400);

    const ok = await transitionAs(staff.token, id, "reject", { reason: "Out of stock today" });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data.status).toBe("rejected");
    expect(ok.json().data.reason).toBe("Out of stock today");
  });

  it("cancel works from pending with a reason, but never from delivered", async () => {
    const store = seedUser();
    const staff = seedUser();
    const med = seedMedicine(store.id);

    const fresh = await makeOrder(store.id, med);
    const cancelled = await transitionAs(staff.token, fresh.id, "cancel", {
      reason: "Customer changed mind",
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().data.status).toBe("cancelled");

    const doomed = await makeOrder(store.id, med);
    await transitionAs(staff.token, doomed.id, "accept");
    const invoice = seedInvoice(store.id);
    await transitionAs(staff.token, doomed.id, "deliver", { invoiceId: invoice.id });
    const late = await transitionAs(staff.token, doomed.id, "cancel", {
      reason: "Too late to cancel",
    });
    expect(late.statusCode).toBe(409);
    expect(late.json().error).toBe("Cannot cancel order in delivered");
  });

  it("records audit events for order.created and every transition", async () => {
    const store = seedUser();
    const staff = seedUser();
    const med = seedMedicine(store.id);
    const { id } = await makeOrder(store.id, med);

    expect(auditRows("order.created", id)).toHaveLength(1);
    expect(auditRows("order.created", id)[0].actorId).toBe(store.id);

    await transitionAs(staff.token, id, "accept");
    await transitionAs(staff.token, id, "pack");
    await transitionAs(staff.token, id, "ready");
    const invoice = seedInvoice(store.id);
    await transitionAs(staff.token, id, "deliver", { invoiceId: invoice.id });

    for (const action of ["order.accepted", "order.packed", "order.ready", "order.delivered"]) {
      const rows = auditRows(action, id);
      expect(rows.length, `audit ${action}`).toBe(1);
      expect(rows[0].actorId).toBe(staff.id);
    }
  });

  it("returns 404 for an unknown order id on every action", async () => {
    const staff = seedUser();
    for (const action of ["accept", "pack", "ready", "reject", "cancel"]) {
      const res = await transitionAs(staff.token, "missing-order", action, { reason: "n/a" });
      expect(res.statusCode, action).toBe(404);
    }
  });
});

// ---------------------------------------------------------------------------
// Staff list + detail
// ---------------------------------------------------------------------------
describe("GET /api/orders — staff queue", () => {
  it("requires authentication (401)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/orders" });
    expect(res.statusCode).toBe(401);
  });

  it("is install-shared: another store's staff sees orders they did not create", async () => {
    // DOCUMENTED: the queue is deliberately NOT tenant-filtered (single-store
    // install, shared counter queue) — this assertion pins that decision.
    const storeA = seedUser();
    const staffB = seedUser();
    const med = seedMedicine(storeA.id, { name: "SharedMed" });
    const { id } = await makeOrder(storeA.id, med);

    const res = await listOrdersAs(staffB.token);
    expect(res.statusCode).toBe(200);
    const ids = res.json().data.map((o: any) => o.id);
    expect(ids).toContain(id);
    expect(res.json().data.find((o: any) => o.id === id).storeId).toBe(storeA.id);
  });

  it("filters by q and paginates", async () => {
    const store = seedUser();
    const staff = seedUser();
    const med = seedMedicine(store.id);

    const first = await createPublicOrder({
      ...orderPayload(store.id, [{ medicineId: med.medicineId, quantity: 1 }]),
      customerName: "Asha Rao",
      phone: "9000000001",
    });
    const second = await createPublicOrder({
      ...orderPayload(store.id, [{ medicineId: med.medicineId, quantity: 1 }]),
      customerName: "Vikram Sen",
      phone: "9000000002",
    });
    const idA = first.json().data.id;
    const idB = second.json().data.id;
    // Distinct created_at so offset paging is deterministic.
    setOrderCreatedAt(idA, Date.now() - 60_000);
    setOrderCreatedAt(idB, Date.now());

    const byName = await listOrdersAs(staff.token, "?q=Vikram");
    expect(byName.json().data).toHaveLength(1);
    expect(byName.json().data[0].id).toBe(idB);

    const byPhone = await listOrdersAs(staff.token, "?q=9000000001");
    expect(byPhone.json().data.map((o: any) => o.id)).toEqual([idA]);

    // q matches name/phone/id — the 90000000 prefix isolates these two rows
    // from every order created earlier in this file.
    const page1 = await listOrdersAs(staff.token, "?q=90000000&page=1&limit=1");
    expect(page1.json().data).toHaveLength(1);
    expect(page1.json().total).toBe(2);
    expect(page1.json().data[0].id).toBe(idB);

    const page2 = await listOrdersAs(staff.token, "?q=90000000&page=2&limit=1");
    expect(page2.json().data).toHaveLength(1);
    expect(page2.json().data[0].id).toBe(idA);

    const pending = await listOrdersAs(staff.token, "?q=90000000&status=pending");
    expect(pending.json().data).toHaveLength(2);
  });

  it("returns server-computed status counts for the search scope", async () => {
    const store = seedUser();
    const staff = seedUser();
    const med = seedMedicine(store.id, { name: "CountMed" });
    const scope = { customerName: "CountScope", phone: "9111111111" };

    const a = await makeOrder(store.id, med, 1, scope); // stays pending
    const b = await makeOrder(store.id, med, 1, scope); // -> accepted
    const accept = await transitionAs(staff.token, b.id, "accept");
    expect(accept.statusCode).toBe(200);

    const res = await listOrdersAs(staff.token, "?q=CountScope");
    expect(res.statusCode).toBe(200);
    const counts = res.json().counts;
    expect(counts.all).toBe(2);
    expect(counts.pending).toBe(1);
    expect(counts.accepted).toBe(1);
    expect(counts.rejected).toBe(0);
    expect(counts.cancelled).toBe(0);
    expect(counts.delivered).toBe(0);
    expect(res.json().total).toBe(2);

    // Counts ignore the status filter, so pills keep their totals while the
    // rows narrow to the selected status.
    const filtered = await listOrdersAs(staff.token, "?q=CountScope&status=accepted");
    expect(filtered.json().data.map((o: any) => o.id)).toEqual([b.id]);
    expect(filtered.json().counts.all).toBe(2);
    expect(filtered.json().counts.pending).toBe(1);
    expect(filtered.json().counts.accepted).toBe(1);

    // The scoped search never counts other orders in the file.
    const other = await listOrdersAs(staff.token, "?q=NoSuchCustomerName");
    expect(other.json().counts.all).toBe(0);
    expect(other.json().counts.pending).toBe(0);
    expect(a.id).toBeTruthy();
  });

  it("returns 404 for an unknown detail id", async () => {
    const staff = seedUser();
    const res = await getOrderAs(staff.token, "nope");
    expect(res.statusCode).toBe(404);
  });
});

describe("GET /api/orders/:id — prescription inline", () => {
  it("inlines prescriptionFile base64 when attached and omits it when null", async () => {
    const store = seedUser();
    const staff = seedUser();
    const med = seedMedicine(store.id, { name: "RxMed" });
    const file = await fileStorage.put({
      ownerId: store.id,
      purpose: "order-prescription",
      filename: "rx.jpg",
      contentType: "image/jpeg",
      bytes: Buffer.from("inline-rx-bytes"),
    });
    const withFile = await makeOrder(store.id, med, 1, { prescriptionFileId: file.id });
    const withoutFile = await makeOrder(store.id, med, 1);

    const res = await getOrderAs(staff.token, withFile.id);
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.prescriptionFile).toBeTruthy();
    expect(data.prescriptionFile.filename).toBe("rx.jpg");
    expect(data.prescriptionFile.contentType).toBe("image/jpeg");
    expect(Buffer.from(data.prescriptionFile.data, "base64").toString()).toBe("inline-rx-bytes");
    expect(data.items).toHaveLength(1);

    const plain = await getOrderAs(staff.token, withoutFile.id);
    expect(plain.statusCode).toBe(200);
    expect(plain.json().data.prescriptionFile).toBeUndefined();
    expect(plain.json().data.prescriptionFileId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Messaging best-effort + roles
// ---------------------------------------------------------------------------
describe("notifications and roles", () => {
  it("accept succeeds even when the messaging provider is unconfigured", async () => {
    // queueMessage may leave queued/failed rows — the transition must never
    // fail because WhatsApp is not set up (best-effort by design).
    const store = seedUser();
    const staff = seedUser();
    const med = seedMedicine(store.id);
    const { id } = await makeOrder(store.id, med, 1, { phone: "9123456780" });

    const res = await transitionAs(staff.token, id, "accept");
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("accepted");

    const rejected = await makeOrder(store.id, med, 1, { phone: "9123456780" });
    const rejectRes = await transitionAs(staff.token, rejected.id, "reject", {
      reason: "Medicine unavailable",
    });
    expect(rejectRes.statusCode).toBe(200);
  });

  it("has no role gates — a cashier can run the queue (documented)", async () => {
    const store = seedUser();
    const cashier = seedUserWithRole("cashier");
    const med = seedMedicine(store.id);
    const { id } = await makeOrder(store.id, med);

    const res = await transitionAs(cashier.token, id, "accept");
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("accepted");
  });
});
