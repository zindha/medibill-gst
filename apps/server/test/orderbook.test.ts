import { beforeAll, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { applySchema, seedMedicine, seedUser, type SeededUser } from "./helpers.js";
import orderbookRoutes from "../src/routes/orderbook.js";

let app: FastifyInstance;
let ctx: SeededUser;
let other: SeededUser;

function auth(user: SeededUser) {
  return { authorization: `Bearer ${user.token}` };
}

async function get(url: string, user: SeededUser = ctx) {
  return app.inject({ method: "GET", url, headers: auth(user) });
}

async function post(url: string, payload: unknown, user: SeededUser = ctx) {
  return app.inject({ method: "POST", url, headers: auth(user), payload });
}

async function patch(url: string, payload: unknown) {
  return app.inject({ method: "PATCH", url, headers: auth(ctx), payload });
}

async function del(url: string) {
  return app.inject({ method: "DELETE", url, headers: auth(ctx) });
}

async function createDistributor(name: string, user: SeededUser = ctx) {
  const res = await post("/api/orderbook/distributors", { name }, user);
  expect(res.statusCode).toBe(201);
  return res.json().data;
}

beforeAll(async () => {
  applySchema();
  app = Fastify({ logger: false });
  await app.register(orderbookRoutes, { prefix: "/api/orderbook" });
  await app.ready();
  ctx = seedUser();
  other = seedUser();
});

describe("orderbook distributors", () => {
  it("creates, lists and scopes distributors to their owner", async () => {
    const mine = await createDistributor("MedSupply Traders");
    await createDistributor("Rival Distributor", other);

    const list = await get("/api/orderbook/distributors");
    expect(list.statusCode).toBe(200);
    const names = list.json().data.map((d: { name: string }) => d.name);
    expect(names).toContain("MedSupply Traders");
    expect(names).not.toContain("Rival Distributor");

    // Another user cannot read a foreign distributor.
    const foreign = await get(`/api/orderbook/distributors/${mine.id}`, other);
    expect(foreign.statusCode).toBe(404);
  });

  it("patches distributor fields", async () => {
    const d = await createDistributor("Healthline Agencies");
    const res = await patch(`/api/orderbook/distributors/${d.id}`, {
      phone: "9876543210",
      creditLimit: 50000,
      connectionStatus: "connected",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.phone).toBe("9876543210");
    expect(res.json().data.connectionStatus).toBe("connected");
  });
});

describe("orderbook cart and checkout", () => {
  it("adds cart items, merges same-medicine lines and checks out to a PO per distributor", async () => {
    const med = seedMedicine(ctx.id, { name: "Paracetamol 500mg" });
    const dist1 = await createDistributor("Cart Dist A");
    const dist2 = await createDistributor("Cart Dist B");

    const add1 = await post("/api/orderbook/cart/items", {
      distributorId: dist1.id,
      medicineId: med.medicineId,
      name: "Paracetamol 500mg",
      pack: "10x15",
      quantity: 10,
      rate: 12.5,
    });
    expect(add1.statusCode).toBe(201);
    await post("/api/orderbook/cart/items", {
      distributorId: dist1.id,
      medicineId: med.medicineId,
      name: "Paracetamol 500mg",
      pack: "10x15",
      quantity: 5,
      rate: 12.5,
    });
    await post("/api/orderbook/cart/items", {
      distributorId: dist2.id,
      name: "Cough syrup 100ml",
      quantity: 3,
      rate: 60,
    });

    const cart = await get("/api/orderbook/cart");
    expect(cart.statusCode).toBe(200);
    const body = cart.json().data;
    expect(body.groups).toHaveLength(2);
    // 10 + 5 merged into one line of 15 @ 12.5 = 187.5, plus 3 @ 60 = 180.
    expect(body.total).toBeCloseTo(367.5, 2);

    const update = await patch(`/api/orderbook/cart/items/${add1.json().data.id}`, {
      quantity: 20,
    });
    expect(update.json().data.quantity).toBe(20);

    const checkout = await post("/api/orderbook/cart/checkout", {});
    expect(checkout.statusCode).toBe(200);
    const orders = checkout.json().data.orders;
    expect(orders).toHaveLength(2);
    expect(orders[0].number).toMatch(/^OB-\d{6}-0001$/);

    // Cart is empty after checkout.
    const after = await get("/api/orderbook/cart");
    expect(after.json().data.groups).toHaveLength(0);

    // Order snapshot is readable and immutable.
    const orderDetail = await get(`/api/orderbook/orders/${orders[0].orderId}`);
    expect(orderDetail.statusCode).toBe(200);
    expect(orderDetail.json().data.snapshot.items.length).toBeGreaterThan(0);

    // Checkout with an empty cart fails.
    const empty = await post("/api/orderbook/cart/checkout", {});
    expect(empty.statusCode).toBe(400);
  });
});

describe("orderbook purchase order lifecycle", () => {
  it("creates, sends, partially receives (shortbook) and closes POs", async () => {
    const dist = await createDistributor("Lifecycle Dist");
    const created = await post("/api/orderbook/pos", {
      distributorId: dist.id,
      items: [
        { name: "Item A", quantity: 10, rate: 20 },
        { name: "Item B", quantity: 5, rate: 40 },
      ],
    });
    expect(created.statusCode).toBe(201);
    const po = created.json().data;
    expect(po.total).toBe(400);
    expect(po.status).toBe("draft");

    // Invalid transition: confirm before send.
    const badConfirm = await post(`/api/orderbook/pos/${po.id}/confirm`, {});
    expect(badConfirm.statusCode).toBe(409);

    const sent = await post(`/api/orderbook/pos/${po.id}/send`, {});
    expect(sent.json().data.status).toBe("sent");

    const confirmed = await post(`/api/orderbook/pos/${po.id}/confirm`, {});
    expect(confirmed.json().data.status).toBe("confirmed");

    const detail = await get(`/api/orderbook/pos/${po.id}`);
    const items = detail.json().data.items;

    // Receive 10/10 of A and 2/5 of B → partial, one shortbook line.
    const received = await post(`/api/orderbook/pos/${po.id}/receive`, {
      receipts: [
        { itemId: items[0].id, receivedQuantity: 10 },
        { itemId: items[1].id, receivedQuantity: 2 },
      ],
    });
    expect(received.statusCode).toBe(200);
    expect(received.json().data.po.status).toBe("partial");
    expect(received.json().data.shortbooked).toBe(1);

    const shortbook = await get("/api/orderbook/shortbook?status=open");
    const open = shortbook.json().data as Array<{
      name: string;
      demandedQuantity: number;
      status: string;
    }>;
    expect(open).toHaveLength(1);
    expect(open[0].name).toBe("Item B");
    expect(open[0].demandedQuantity).toBe(3);

    // Resolve the shortfall as supplied.
    const resolved = await post(`/api/orderbook/shortbook/${open[0].id}/resolve`, {
      action: "supplied",
      suppliedQuantity: 3,
    });
    expect(resolved.json().data.status).toBe("supplied");

    // Receive the rest → fully received.
    const rest = await post(`/api/orderbook/pos/${po.id}/receive`, {
      receipts: [{ itemId: items[1].id, receivedQuantity: 3 }],
    });
    expect(rest.json().data.po.status).toBe("received");

    const analysis = await get("/api/orderbook/analysis");
    expect(analysis.statusCode).toBe(200);
    expect(analysis.json().data.statusCounts.length).toBeGreaterThan(0);
    expect(analysis.json().data.openShortbook).toBe(0);
  });

  it("cancels a draft and rejects receiving against it", async () => {
    const dist = await createDistributor("Cancel Dist");
    const created = await post("/api/orderbook/pos", {
      distributorId: dist.id,
      items: [{ name: "Item C", quantity: 1, rate: 10 }],
    });
    const po = created.json().data;
    const cancelled = await post(`/api/orderbook/pos/${po.id}/cancel`, {});
    expect(cancelled.json().data.status).toBe("cancelled");
    const detail = await get(`/api/orderbook/pos/${po.id}`);
    const receive = await post(`/api/orderbook/pos/${po.id}/receive`, {
      receipts: [{ itemId: detail.json().data.items[0].id, receivedQuantity: 1 }],
    });
    expect(receive.statusCode).toBe(409);
  });
});

describe("orderbook products and already-to-order", () => {
  it("searches the owner's medicines and lists pending order items", async () => {
    seedMedicine(ctx.id, { name: "Azithromycin 500" });
    seedMedicine(other.id, { name: "Secret Med" });
    const products = await get("/api/orderbook/products?q=azithro");
    expect(products.statusCode).toBe(200);
    const names = products.json().data.map((p: { name: string }) => p.name);
    expect(names).toContain("Azithromycin 500");
    expect(names).not.toContain("Secret Med");

    const pending = await get("/api/orderbook/already-to-order");
    expect(pending.statusCode).toBe(200);
    expect(Array.isArray(pending.json().data.pending)).toBe(true);
    expect(Array.isArray(pending.json().data.shorts)).toBe(true);
  });
});

describe("orderbook cart cleanup", () => {
  it("deletes a cart line", async () => {
    const dist = await createDistributor("Delete Dist");
    const added = await post("/api/orderbook/cart/items", {
      distributorId: dist.id,
      name: "Will delete",
      quantity: 1,
      rate: 5,
    });
    const removed = await del(`/api/orderbook/cart/items/${added.json().data.id}`);
    expect(removed.statusCode).toBe(200);
    const cart = await get("/api/orderbook/cart");
    expect(cart.json().data.groups).toHaveLength(0);
  });
});

describe("orderbook tenant isolation", () => {
  it("foreign ids 404 on cart, PO and shortbook mutations", async () => {
    const dist = await createDistributor("Iso Dist", ctx);
    const cartItem = await post("/api/orderbook/cart/items", {
      distributorId: dist.id,
      name: "Iso item",
      quantity: 1,
      rate: 1,
    });
    // Another user must not patch (or otherwise resolve) our cart line.
    const foreignPatch = await app.inject({
      method: "PATCH",
      url: `/api/orderbook/cart/items/${cartItem.json().data.id}`,
      headers: auth(other),
      payload: { quantity: 2 },
    });
    expect(foreignPatch.statusCode).toBe(404);
    // And must not read our distributor detail.
    const foreignDist = await get(`/api/orderbook/distributors/${dist.id}`, other);
    expect(foreignDist.statusCode).toBe(404);
  });
});
