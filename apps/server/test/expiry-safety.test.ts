import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import { applySchema, countFor, dbPath, getBatchQuantity, seedMedicine, seedUser, type SeededUser, type SeededMedicine } from "./helpers.js";
import invoiceRoutes from "../src/routes/invoices.js";
import purchaseRoutes from "../src/routes/purchases.js";
import inventoryRoutes from "../src/routes/inventory.js";
import expiryPolicyRoutes from "../src/routes/expiryPolicies.js";
import { DEFAULT_POLICY } from "../src/services/expiryPolicy.js";
import { db } from "../src/db/index.js";
import { auditEvents } from "../src/db/schema/index.js";
import { and, eq } from "drizzle-orm";

let app: FastifyInstance;

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

const inDays = (n: number): string => new Date(Date.now() + n * 86400000).toISOString().split("T")[0];
const daysAgo = (n: number): string => inDays(-n);

/** Seed a user with an explicit role (helpers.seedUser always inserts admin). */
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

const itemFor = (med: SeededMedicine, overrides: Record<string, unknown> = {}) => ({
  medicineId: med.medicineId,
  medicineName: "Test Med",
  batchNo: "B1",
  quantity: 1,
  unit: "Strip",
  mrp: 100,
  rate: 95.24,
  amount: 95.24,
  gstRate: "5",
  gstAmount: 4.76,
  cgst: 2.38,
  sgst: 2.38,
  ...overrides,
});

function invoiceBody(items: unknown[], extra: Record<string, unknown> = {}) {
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
    discountAmount: 0,
    items,
    ...extra,
  };
}

const putPolicy = (token: string, policy: unknown) =>
  app.inject({ method: "PUT", url: "/api/expiry-policy", headers: auth(token), payload: policy as any });

const getPolicyAs = (token: string) =>
  app.inject({ method: "GET", url: "/api/expiry-policy", headers: auth(token) });

const postInvoice = (token: string, body: unknown) =>
  app.inject({ method: "POST", url: "/api/invoices", headers: auth(token), payload: body as any });

const postPurchase = (token: string, body: unknown) =>
  app.inject({ method: "POST", url: "/api/purchases", headers: auth(token), payload: body as any });

function purchaseBody(med: SeededMedicine, expiryDate: string, extra: Record<string, unknown> = {}) {
  return {
    billNo: `EXP-${nanoid(6)}`,
    billDate: "2099-01-01",
    items: [
      {
        medicineId: med.medicineId,
        medicineName: "Test Med",
        batchNo: `XB-${nanoid(4)}`,
        expiryDate,
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
    ...extra,
  };
}

beforeAll(async () => {
  applySchema();
  app = Fastify({ logger: false });
  await app.register(invoiceRoutes, { prefix: "/api/invoices" });
  await app.register(purchaseRoutes, { prefix: "/api/purchases" });
  await app.register(inventoryRoutes, { prefix: "/api/inventory" });
  await app.register(expiryPolicyRoutes, { prefix: "/api/expiry-policy" });
  const { default: purchaseImportRoutes } = await import("../src/routes/purchaseImports.js");
  await app.register(purchaseImportRoutes, { prefix: "/api/purchase-imports" });
});

// The policy is a per-install singleton (one settings row), so every test in
// this file shares it — reset to defaults before each test.
beforeEach(async () => {
  const ctx = seedUser();
  await putPolicy(ctx.token, DEFAULT_POLICY);
});

describe("GET/PUT /api/expiry-policy", () => {
  it("returns the default policy when nothing is stored", async () => {
    const ctx = seedUser();
    const res = await getPolicyAs(ctx.token);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.policy).toEqual(DEFAULT_POLICY);
  });

  it("round-trips a saved policy", async () => {
    const ctx = seedUser();
    const next = { ...DEFAULT_POLICY, warningDays: 30, blockWithinDays: 15, allowOverrideRoles: ["admin"] };
    const put = await putPolicy(ctx.token, next);
    expect(put.statusCode).toBe(200);
    expect(put.json().data.policy).toEqual(next);

    const other = seedUser();
    const got = await getPolicyAs(other.token);
    expect(got.json().data.policy).toEqual(next);
  });

  it("rejects invalid values with 400 (zod)", async () => {
    const ctx = seedUser();
    const cases = [
      { ...DEFAULT_POLICY, warningDays: -1 },
      { ...DEFAULT_POLICY, blockWithinDays: 4000 },
      { ...DEFAULT_POLICY, allowOverrideRoles: ["superadmin"] },
      { ...DEFAULT_POLICY, blockExpiredSale: "yes" },
    ];
    for (const payload of cases) {
      const res = await putPolicy(ctx.token, payload);
      expect(res.statusCode).toBe(400);
      expect(res.json().success).toBe(false);
    }
    // Nothing above was persisted.
    const got = await getPolicyAs(ctx.token);
    expect(got.json().data.policy).toEqual(DEFAULT_POLICY);
  });

  it("is a singleton: a second user sees the same policy", async () => {
    const a = seedUser();
    const b = seedUser();
    await putPolicy(a.token, { ...DEFAULT_POLICY, warningDays: 45 });
    const res = await getPolicyAs(b.token);
    expect(res.json().data.policy.warningDays).toBe(45);
  });
});

describe("sale blocking (invoices)", () => {
  it("blocks an expired sale line with the stable blocked[] payload", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { quantity: 10 });

    const res = await postInvoice(ctx.token, invoiceBody([itemFor(med, { expiryDate: daysAgo(10) })]));
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("Expired/near-expiry batch blocked by policy");
    expect(Array.isArray(body.blocked)).toBe(true);
    expect(body.blocked.length).toBeGreaterThanOrEqual(1);
    expect(body.blocked[0].severity).toBe("blocked");
    expect(body.blocked[0].batchNo).toBe("B1");
    expect(body.blocked[0].daysToExpiry).toBeLessThan(0);
    expect(body.blocked[0].reason).toMatch(/Expired on/);

    // Nothing was written and stock is untouched.
    expect(countFor("invoices", ctx.id)).toBe(0);
    expect(getBatchQuantity(med.batchId)).toBe(10);
  });

  it("lets an admin override with a reason and records the audit event", async () => {
    const ctx = seedUser(); // helpers.seedUser inserts role 'admin'
    const med = seedMedicine(ctx.id, { quantity: 10 });

    const res = await postInvoice(
      ctx.token,
      invoiceBody([itemFor(med, { expiryDate: daysAgo(10) })], {
        overrideExpiry: true,
        overrideReason: "Patient already dispensed — correcting entry",
      }),
    );
    expect(res.statusCode).toBe(201);
    expect(res.json().success).toBe(true);
    expect(countFor("invoices", ctx.id)).toBe(1);

    const events = db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.action, "invoice.expiry_override"), eq(auditEvents.actorId, ctx.id)))
      .all();
    expect(events.length).toBe(1);
    expect(events[0].entity).toBe("invoice");
    const meta = JSON.parse(events[0].metadata ?? "{}");
    expect(meta.overrideReason).toContain("correcting entry");
    expect(Array.isArray(meta.items)).toBe(true);
    expect(meta.items[0].batchNo).toBe("B1");
    expect(meta.items[0].expiryDate).toBe(daysAgo(10));
  });

  it("rejects an override without a reason", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { quantity: 10 });
    const res = await postInvoice(
      ctx.token,
      invoiceBody([itemFor(med, { expiryDate: daysAgo(3) })], { overrideExpiry: true }),
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("overrideReason");
    expect(countFor("invoices", ctx.id)).toBe(0);
  });

  it("rejects an override from a cashier even with a reason", async () => {
    const cashier = seedUserWithRole("cashier");
    const med = seedMedicine(cashier.id, { quantity: 10 });

    const res = await postInvoice(
      cashier.token,
      invoiceBody([itemFor(med, { expiryDate: daysAgo(10) })], {
        overrideExpiry: true,
        overrideReason: "Let me through",
      }),
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().blocked?.length).toBeGreaterThanOrEqual(1);
    expect(countFor("invoices", cashier.id)).toBe(0);
    const events = db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.action, "invoice.expiry_override"), eq(auditEvents.actorId, cashier.id)))
      .all();
    expect(events.length).toBe(0);
  });

  it("warns but allows a sale inside warningDays (30 <= 90)", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { quantity: 10, expiry: inDays(30) });

    const res = await postInvoice(ctx.token, invoiceBody([itemFor(med, { expiryDate: inDays(30) })]));
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.warnings.length).toBe(1);
    expect(body.warnings[0].severity).toBe("warning");
    expect(body.warnings[0].daysToExpiry).toBeLessThanOrEqual(30);
    expect(countFor("invoices", ctx.id)).toBe(1);
  });

  it("blocks a sale inside blockWithinDays with severity blocked and a window reason", async () => {
    const ctx = seedUser();
    await putPolicy(ctx.token, { ...DEFAULT_POLICY, blockWithinDays: 30 });
    const med = seedMedicine(ctx.id, { quantity: 10, expiry: inDays(20) });

    const res = await postInvoice(ctx.token, invoiceBody([itemFor(med, { expiryDate: inDays(20) })]));
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.blocked[0].severity).toBe("blocked");
    expect(body.blocked[0].reason).toMatch(/block window/);
    expect(body.blocked[0].daysToExpiry).toBeLessThanOrEqual(30);
    expect(countFor("invoices", ctx.id)).toBe(0);

    // The same near-expiry batch sells fine once overridden by an allowed role.
    const ok = await postInvoice(
      ctx.token,
      invoiceBody([itemFor(med, { expiryDate: inDays(20) })], {
        overrideExpiry: true,
        overrideReason: "Short-expiry lot on offer",
      }),
    );
    expect(ok.statusCode).toBe(201);
  });

  it("sells a normal far-expiry batch with no warnings", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { quantity: 10, expiry: "2099-12-31" });
    const res = await postInvoice(ctx.token, invoiceBody([itemFor(med, { expiryDate: "2099-12-31" })]));
    expect(res.statusCode).toBe(201);
    expect(res.json().warnings).toEqual([]);
  });
});

describe("purchase blocking (purchases)", () => {
  it("rejects an expired incoming batch while blockExpiredPurchase is true", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { quantity: 5 });
    const body = purchaseBody(med, daysAgo(5));

    const res = await postPurchase(ctx.token, body);
    expect(res.statusCode).toBe(400);
    const parsed = res.json();
    expect(parsed.error).toContain("Expired/near-expiry batch blocked by policy");
    expect(parsed.blocked[0].severity).toBe("blocked");
    expect(parsed.blocked[0].daysToExpiry).toBeLessThan(0);

    // No partial writes: no batch, no bill.
    const sqlite = new Database(dbPath());
    const batchCount = sqlite
      .prepare("SELECT COUNT(*) AS c FROM batches WHERE batch_no = ?")
      .get((body.items[0] as any).batchNo) as { c: number };
    expect(batchCount.c).toBe(0);
    sqlite.close();
    expect(countFor("purchase_bills", ctx.id)).toBe(0);
  });

  it("accepts the same expired batch when blockExpiredPurchase is false", async () => {
    const ctx = seedUser();
    await putPolicy(ctx.token, { ...DEFAULT_POLICY, blockExpiredPurchase: false });
    const med = seedMedicine(ctx.id, { quantity: 5 });

    const res = await postPurchase(ctx.token, purchaseBody(med, daysAgo(5)));
    expect(res.statusCode).toBe(201);
    expect(res.json().success).toBe(true);
  });

  it("warns (but allows) an incoming batch inside warningDays", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { quantity: 5 });
    const res = await postPurchase(ctx.token, purchaseBody(med, inDays(45)));
    expect(res.statusCode).toBe(201);
    expect(res.json().warnings.length).toBe(1);
    expect(res.json().warnings[0].severity).toBe("warning");
  });
});

describe("batch edit (inventory)", () => {
  it("refuses setting an expired batch expiry (no override for edits)", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { quantity: 5 });

    const res = await app.inject({
      method: "PUT",
      url: `/api/inventory/batches/${med.batchId}`,
      headers: auth(ctx.token),
      payload: { expiryDate: daysAgo(1) },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().blocked[0].severity).toBe("blocked");

    // Unchanged in the DB.
    const sqlite = new Database(dbPath());
    const row = sqlite.prepare("SELECT expiry_date FROM batches WHERE id = ?").get(med.batchId) as { expiry_date: string };
    expect(row.expiry_date).toBe("2099-12-31");
    sqlite.close();
  });

  it("allows pushing an expiry further out", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { quantity: 5 });
    const res = await app.inject({
      method: "PUT",
      url: `/api/inventory/batches/${med.batchId}`,
      headers: auth(ctx.token),
      payload: { expiryDate: inDays(400) },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.expiryDate).toBe(inDays(400));
  });
});

describe("POST /api/expiry-policy/evaluate", () => {
  it("computes severity for the UI (blocked / warning / ok)", async () => {
    const ctx = seedUser();

    const expired = await app.inject({
      method: "POST",
      url: "/api/expiry-policy/evaluate",
      headers: auth(ctx.token),
      payload: { expiryDate: daysAgo(1), operation: "sale" },
    });
    expect(expired.statusCode).toBe(200);
    expect(expired.json().data.severity).toBe("blocked");
    expect(expired.json().data.allowed).toBe(false);
    expect(expired.json().data.daysToExpiry).toBeLessThan(0);

    const soon = await app.inject({
      method: "POST",
      url: "/api/expiry-policy/evaluate",
      headers: auth(ctx.token),
      payload: { expiryDate: inDays(30), operation: "sale" },
    });
    expect(soon.json().data.severity).toBe("warning");
    expect(soon.json().data.allowed).toBe(true);

    const far = await app.inject({
      method: "POST",
      url: "/api/expiry-policy/evaluate",
      headers: auth(ctx.token),
      payload: { expiryDate: "2099-12-31", operation: "purchase" },
    });
    expect(far.json().data.severity).toBe("ok");
    expect(far.json().data.allowed).toBe(true);
  });

  it("reflects policy changes (blockWithinDays)", async () => {
    const ctx = seedUser();
    await putPolicy(ctx.token, { ...DEFAULT_POLICY, blockWithinDays: 60 });
    const res = await app.inject({
      method: "POST",
      url: "/api/expiry-policy/evaluate",
      headers: auth(ctx.token),
      payload: { expiryDate: inDays(10), operation: "sale" },
    });
    expect(res.json().data.severity).toBe("blocked");
    expect(res.json().data.reason).toMatch(/block window/);
  });
});

describe("policy coverage: import commit and manual batch creation", () => {
  it("blocks purchase-import commit when a row carries an expired batch", async () => {
    const ctx = seedUser();
    await putPolicy(ctx.token, { ...DEFAULT_POLICY, blockExpiredPurchase: true });
    const med = seedMedicine(ctx.id, { name: "EXPTEST MED" });

    const created = await app.inject({
      method: "POST",
      url: "/api/purchase-imports",
      headers: auth(ctx.token),
      payload: { filename: "x.csv", csv: "product,batch,expiry,qty,rate\nEXPTEST MED,BX,2099-12-31,1,10\n" },
    });
    expect(created.statusCode).toBe(201);
    const importId = created.json().data.importId ?? created.json().data.id;
    expect(importId).toBeTruthy();

    const blockedRes = await app.inject({
      method: "POST",
      url: `/api/purchase-imports/${importId}/commit`,
      headers: auth(ctx.token),
      payload: {
        billNo: "EXP-IMP-1",
        billDate: inDays(0),
        rows: [{ rowIndex: 0, medicineId: med.medicineId, batchNo: "BX", expiryDate: daysAgo(30), quantity: 1, purchasePrice: 10 }],
      },
    });
    expect(blockedRes.statusCode).toBe(400);
    expect(blockedRes.json().error).toMatch(/Expiry policy/);
    expect(blockedRes.json().details?.blocked?.length).toBe(1);

    // Same import commits once the expiry is fixed (import stays draft).
    const okRes = await app.inject({
      method: "POST",
      url: `/api/purchase-imports/${importId}/commit`,
      headers: auth(ctx.token),
      payload: {
        billNo: "EXP-IMP-1",
        billDate: inDays(0),
        rows: [{ rowIndex: 0, medicineId: med.medicineId, batchNo: "BX", expiryDate: inDays(300), quantity: 1, purchasePrice: 10 }],
      },
    });
    expect(okRes.statusCode).toBe(201);
  });

  it("blocks manual batch creation with an expired date", async () => {
    const ctx = seedUser();
    await putPolicy(ctx.token, { ...DEFAULT_POLICY, blockExpiredPurchase: true });
    const med = seedMedicine(ctx.id, { name: "BATCHGUARD MED" });

    const res = await app.inject({
      method: "POST",
      url: "/api/inventory/batches",
      headers: auth(ctx.token),
      payload: { medicineId: med.medicineId, batchNo: "BG1", expiryDate: daysAgo(1), mrp: 20, purchasePrice: 10, sellingPrice: 15, quantity: 5 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().blocked?.length).toBe(1);

    const ok = await app.inject({
      method: "POST",
      url: "/api/inventory/batches",
      headers: auth(ctx.token),
      payload: { medicineId: med.medicineId, batchNo: "BG1", expiryDate: inDays(400), mrp: 20, purchasePrice: 10, sellingPrice: 15, quantity: 5 },
    });
    expect(ok.statusCode).toBe(201);
  });
});
