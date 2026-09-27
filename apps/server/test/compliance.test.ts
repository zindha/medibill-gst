import { afterEach, beforeAll, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import {
  applySchema,
  dbPath,
  seedMedicine,
  seedUser,
  type SeededMedicine,
  type SeededUser,
} from "./helpers.js";
import invoiceRoutes from "../src/routes/invoices.js";
import complianceRoutes from "../src/routes/compliance.js";
import {
  __setGstProviderForTest,
  activeProviderName,
  isGstProviderConfigured,
  type GstProvider,
} from "../src/providers/gst.js";
import { CANCEL_WINDOW_MS, buildEInvoicePayload } from "../src/services/compliance.js";

let app: FastifyInstance;

const STORE_GSTIN = "27AABCU9999L1Z5";
const CUSTOMER_GSTIN = "27ABCDE1234F1Z5";
const INV_DATE = "2026-06-15";

const GST_ENV_VARS = [
  "EINVOICE_PROVIDER",
  "EINVOICE_GSP_ID",
  "EINVOICE_GSP_KEY",
  "EINVOICE_USERNAME",
  "EINVOICE_PASSWORD",
  "EINVOICE_BASE_URL",
  "EWAY_BASE_URL",
];
const savedEnv: Record<string, string | undefined> = {};

function clearGstEnv(): void {
  for (const key of GST_ENV_VARS) delete process.env[key];
}

// ---------------------------------------------------------------------------
// Raw SQL helpers (assert straight from the tables)
// ---------------------------------------------------------------------------
function all<T = any>(sql: string, ...params: any[]): T[] {
  const sqlite = new Database(dbPath());
  try {
    return sqlite.prepare(sql).all(...params) as T[];
  } finally {
    sqlite.close();
  }
}

function run(sql: string, ...params: any[]): void {
  const sqlite = new Database(dbPath());
  try {
    sqlite.prepare(sql).run(...params);
  } finally {
    sqlite.close();
  }
}

function setRole(userId: string, role: string): void {
  run("UPDATE users SET role = ? WHERE id = ?", role, userId);
}

function setStoreGstin(value: string | null): void {
  if (value === null) {
    run("DELETE FROM settings WHERE key = 'store_gstin'");
    return;
  }
  run(
    `INSERT INTO settings (id, key, value, updated_at) VALUES ('st_gstin_test', 'store_gstin', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    value,
    Date.now()
  );
}

function submissionRows(ownerId: string, invoiceId: string) {
  return all(
    "SELECT * FROM compliance_submissions WHERE created_by = ? AND invoice_id = ? ORDER BY kind",
    ownerId,
    invoiceId
  );
}

function auditCount(actorId: string, action: string): number {
  const rows = all<{ c: number }>(
    "SELECT COUNT(*) AS c FROM audit_events WHERE actor_id = ? AND action = ?",
    actorId,
    action
  );
  return rows[0]?.c ?? 0;
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

// ---------------------------------------------------------------------------
// Payload helpers (patterns from accounting.test.ts / invoices.test.ts)
// ---------------------------------------------------------------------------
const PAYLOAD_ITEM = (med: SeededMedicine, over: Record<string, unknown> = {}) => ({
  medicineId: med.medicineId,
  medicineName: "Test Med",
  quantity: 1,
  unit: "Strip",
  mrp: 100,
  rate: 95.24,
  amount: 95.24,
  gstRate: "5",
  gstAmount: 4.76,
  cgst: 2.38,
  sgst: 2.38,
  hsnCode: "30049099",
  ...over,
});

function invoiceBody(med: SeededMedicine, over: Record<string, unknown> = {}) {
  return {
    date: INV_DATE,
    subtotal: 95.24,
    totalGst: 4.76,
    cgst: 2.38,
    sgst: 2.38,
    grandTotal: 100,
    amountPaid: 100,
    paymentMode: "cash",
    status: "paid",
    discountAmount: 0,
    customerName: "Clinic X",
    customerGstin: CUSTOMER_GSTIN,
    items: [PAYLOAD_ITEM(med)],
    ...over,
  };
}

async function postInvoice(
  med: SeededMedicine,
  ctx: SeededUser,
  over: Record<string, unknown> = {}
): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/invoices",
    headers: auth(ctx.token),
    payload: invoiceBody(med, over),
  });
  expect(res.statusCode).toBe(201);
  return res.json().data.id as string;
}

async function generateInvoice(ctx: SeededUser, invoiceId: string) {
  return app.inject({
    method: "POST",
    url: `/api/compliance/invoices/${invoiceId}/generate`,
    headers: auth(ctx.token),
    payload: {},
  });
}

/** A provider whose e-invoice call always fails with `message`. */
function failingProvider(message: string): GstProvider {
  return {
    name: "fake",
    async generateEInvoice() {
      throw new Error(message);
    },
    async cancelEInvoice() {
      throw new Error(message);
    },
    async generateEWay() {
      throw new Error(message);
    },
  };
}

beforeAll(async () => {
  applySchema();
  for (const key of GST_ENV_VARS) savedEnv[key] = process.env[key];
  clearGstEnv();
  setStoreGstin(STORE_GSTIN);
  app = Fastify({ logger: false });
  await app.register(invoiceRoutes, { prefix: "/api/invoices" });
  await app.register(complianceRoutes, { prefix: "/api/compliance" });
});

afterEach(() => {
  __setGstProviderForTest(null);
  clearGstEnv();
  setStoreGstin(STORE_GSTIN);
});

afterAll(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

// ---------------------------------------------------------------------------
// Payload builder / validation
// ---------------------------------------------------------------------------
describe("e-invoice payload builder", () => {
  it("404s for a foreign invoice on generate", async () => {
    const owner = seedUser();
    const other = seedUser();
    const med = seedMedicine(owner.id);
    const invoiceId = await postInvoice(med, owner);

    const res = await generateInvoice(other, invoiceId);
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("Invoice not found");
    expect(submissionRows(other.id, invoiceId)).toHaveLength(0);
  });

  it("rejects a cancelled invoice with 400", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id);
    const invoiceId = await postInvoice(med, ctx);
    run("UPDATE invoices SET status = 'cancelled' WHERE id = ?", invoiceId);

    const res = await generateInvoice(ctx, invoiceId);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("Invoice is cancelled");
  });

  it("requires a customer GSTIN (strict B2B) with a stable message", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id);
    const invoiceId = await postInvoice(med, ctx, { customerGstin: undefined });

    const res = await generateInvoice(ctx, invoiceId);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Customer GSTIN required for e-invoice");
  });

  it("lists every item missing an HSN code by name", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id);
    const invoiceId = await postInvoice(med, ctx, {
      items: [PAYLOAD_ITEM(med, { hsnCode: undefined })],
    });

    const res = await generateInvoice(ctx, invoiceId);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("Missing HSN code for: Test Med");
  });

  it("rejects when the store GSTIN is unset with the Settings hint", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id);
    const invoiceId = await postInvoice(med, ctx);
    setStoreGstin(null);

    const res = await generateInvoice(ctx, invoiceId);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Set store GSTIN in Settings → Taxation");
  });

  it("builds a documented IRN-ready payload with a 64-hex request hash", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id);
    const invoiceId = await postInvoice(med, ctx);

    const { payload, requestHash } = await buildEInvoicePayload(ctx.id, invoiceId);

    expect(payload.version).toBe("1.1");
    expect(payload.TranDtls).toEqual({ TaxSch: "GST", SupTyp: "B2B" });
    expect(payload.DocDtls.Typ).toBe("INV");
    expect(payload.DocDtls.Dt).toMatch(/^\d{2}-\d{2}-\d{4}$/); // DD-MM-YYYY
    expect(payload.SellerDtls.Gstin).toBe(STORE_GSTIN);
    expect(payload.BuyerDtls.Gstin).toBe(CUSTOMER_GSTIN);
    expect(payload.BuyerDtls.Pos).toBe("27"); // state code from GSTIN
    expect(payload.ItemList).toHaveLength(1);

    // AssAmt = line amount − line GST, TotItemVal = line amount
    const row = all<{ amount: number; gst_amount: number }>(
      "SELECT amount, gst_amount FROM invoice_items WHERE invoice_id = ?",
      invoiceId
    )[0];
    expect(payload.ItemList[0].AssAmt).toBeCloseTo(row.amount - row.gst_amount, 2);
    expect(payload.ItemList[0].TotAmt).toBeCloseTo(row.amount, 2);
    expect(payload.ItemList[0].HsnCd).toBe("30049099");

    const inv = all<{ grand_total: number }>(
      "SELECT grand_total FROM invoices WHERE id = ?",
      invoiceId
    )[0];
    expect(payload.ValDtls.TotInvVal).toBeCloseTo(inv.grand_total, 2);
    expect(payload.ValDtls.AssVal).toBeCloseTo(
      payload.ItemList.reduce((sum, item) => sum + item.AssAmt, 0),
      2
    );

    expect(requestHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("maps every line into ItemList and hashes the payload deterministically", async () => {
    const ctx = seedUser();
    const medA = seedMedicine(ctx.id, { name: "Med A" });
    const medB = seedMedicine(ctx.id, { name: "Med B" });
    const invoiceId = await postInvoice(medA, ctx, {
      customerName: "Clinic Two",
      items: [
        PAYLOAD_ITEM(medA, { medicineName: "Med A" }),
        PAYLOAD_ITEM(medB, { medicineName: "Med B", quantity: 2, amount: 190.48 }),
      ],
    });

    const first = await buildEInvoicePayload(ctx.id, invoiceId);
    const second = await buildEInvoicePayload(ctx.id, invoiceId);
    expect(first.payload.ItemList).toHaveLength(2);
    expect(first.payload.ItemList.map((i) => i.SlNo)).toEqual(["1", "2"]);
    expect(first.payload.ItemList[1].PrdDesc).toBe("Med B");
    // Deterministic: the same payload always yields the same request hash.
    expect(first.requestHash).toBe(second.requestHash);
  });

  it("collects an invalid GST rate as a preflight issue and a 400", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id);
    const invoiceId = await postInvoice(med, ctx);
    run("UPDATE invoice_items SET gst_rate = '7' WHERE invoice_id = ?", invoiceId);

    const res = await generateInvoice(ctx, invoiceId);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("Invalid GST rate for: Test Med");

    const status = await app.inject({
      method: "GET",
      url: `/api/compliance/invoices/${invoiceId}`,
      headers: auth(ctx.token),
    });
    expect(status.json().data.payloadReady.ok).toBe(false);
    expect(status.json().data.payloadReady.issues.join("; ")).toContain("Invalid GST rate");
  });

  it("preflights a cancelled invoice and a missing store GSTIN without throwing", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id);
    const invoiceId = await postInvoice(med, ctx);
    run("UPDATE invoices SET status = 'cancelled' WHERE id = ?", invoiceId);
    setStoreGstin(null);

    const status = await app.inject({
      method: "GET",
      url: `/api/compliance/invoices/${invoiceId}`,
      headers: auth(ctx.token),
    });
    expect(status.statusCode).toBe(200);
    const issues = status.json().data.payloadReady.issues;
    expect(issues).toContain("Invoice is cancelled");
    expect(issues).toContain("Set store GSTIN in Settings → Taxation");
    expect(status.json().data.payloadReady.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Generate (fake provider, default env)
// ---------------------------------------------------------------------------
describe("generate e-invoice", () => {
  it("accepts with a FAKE IRN, persists one UNIQUE row and audits", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id);
    const invoiceId = await postInvoice(med, ctx);

    const res = await generateInvoice(ctx, invoiceId);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("accepted");
    expect(body.data.irn).toMatch(/^FAKE/);
    expect(body.data.ackNo).toMatch(/^ACK/);
    expect(body.data.ackDate).toBeTruthy();
    expect(body.data.qrData).toBeTruthy();
    expect(body.data.provider).toBe("fake");
    expect(body.data.requestHash).toMatch(/^[0-9a-f]{64}$/);

    const rows = submissionRows(ctx.id, invoiceId);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("accepted");
    expect(rows[0].submitted_at).toBeTruthy();
    expect(JSON.parse(rows[0].response_json).provider).toBe("fake");

    expect(auditCount(ctx.id, "compliance.einvoice_generated")).toBe(1);
  });

  it("409s a second generate for the same invoice", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id);
    const invoiceId = await postInvoice(med, ctx);

    expect((await generateInvoice(ctx, invoiceId)).statusCode).toBe(201);
    const second = await generateInvoice(ctx, invoiceId);
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toContain("already generated");
    expect(submissionRows(ctx.id, invoiceId)).toHaveLength(1);
  });

  it("reports accepted state and ready payload through GET status", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id);
    const invoiceId = await postInvoice(med, ctx);

    const before = await app.inject({
      method: "GET",
      url: `/api/compliance/invoices/${invoiceId}`,
      headers: auth(ctx.token),
    });
    expect(before.statusCode).toBe(200);
    expect(before.json().data.state).toBe("none");
    expect(before.json().data.payloadReady).toEqual({ ok: true, issues: [] });

    await generateInvoice(ctx, invoiceId);

    const after = await app.inject({
      method: "GET",
      url: `/api/compliance/invoices/${invoiceId}`,
      headers: auth(ctx.token),
    });
    expect(after.json().data.state).toBe("accepted");
    expect(after.json().data.submission.irn).toMatch(/^FAKE/);
  });

  it("preflights payload issues without throwing (missing HSN)", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id);
    const invoiceId = await postInvoice(med, ctx, {
      items: [PAYLOAD_ITEM(med, { hsnCode: undefined })],
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/compliance/invoices/${invoiceId}`,
      headers: auth(ctx.token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.payloadReady.ok).toBe(false);
    expect(res.json().data.payloadReady.issues.join("; ")).toContain(
      "Missing HSN code for: Test Med"
    );
  });

  it("cashiers get 403 on generate", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id);
    const invoiceId = await postInvoice(med, ctx);
    const cashier = seedUser();
    setRole(cashier.id, "cashier");

    const res = await generateInvoice(cashier, invoiceId);
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("Insufficient permissions");
    expect(submissionRows(ctx.id, invoiceId)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Cancel — window, states, audit
// ---------------------------------------------------------------------------
describe("cancel e-invoice", () => {
  it("cancels an accepted e-invoice with cancelled_at and an audit row", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id);
    const invoiceId = await postInvoice(med, ctx);
    expect((await generateInvoice(ctx, invoiceId)).statusCode).toBe(201);

    const res = await app.inject({
      method: "POST",
      url: `/api/compliance/invoices/${invoiceId}/cancel`,
      headers: auth(ctx.token),
      payload: { reason: "Wrong GSTIN on bill" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("cancelled");
    expect(res.json().data.cancelledAt).toBeTruthy();
    expect(auditCount(ctx.id, "compliance.einvoice_cancelled")).toBe(1);

    const rows = submissionRows(ctx.id, invoiceId);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("cancelled");
    expect(rows[0].cancelled_at).toBeTruthy();
  });

  it("409s when no e-invoice was generated yet", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id);
    const invoiceId = await postInvoice(med, ctx);

    const res = await app.inject({
      method: "POST",
      url: `/api/compliance/invoices/${invoiceId}/cancel`,
      headers: auth(ctx.token),
      payload: { reason: "changed my mind" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toContain("No accepted e-invoice");
  });

  it("400s when the 24h cancellation window has passed", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id);
    const invoiceId = await postInvoice(med, ctx);
    expect((await generateInvoice(ctx, invoiceId)).statusCode).toBe(201);

    // Monkeypatch submitted_at to 25h ago (drizzle timestamp mode = seconds).
    const [row] = submissionRows(ctx.id, invoiceId);
    const staleSeconds = Math.floor((Date.now() - 25 * 3600e3) / 1000);
    expect(CANCEL_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
    run("UPDATE compliance_submissions SET submitted_at = ? WHERE id = ?", staleSeconds, row.id);

    const res = await app.inject({
      method: "POST",
      url: `/api/compliance/invoices/${invoiceId}/cancel`,
      headers: auth(ctx.token),
      payload: { reason: "too late" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Cancellation window exceeded (24h)");

    // The provider was never reached — the row is still accepted.
    expect(submissionRows(ctx.id, invoiceId)[0].status).toBe("accepted");
  });

  it("requires a non-empty reason", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id);
    const invoiceId = await postInvoice(med, ctx);
    expect((await generateInvoice(ctx, invoiceId)).statusCode).toBe(201);

    const res = await app.inject({
      method: "POST",
      url: `/api/compliance/invoices/${invoiceId}/cancel`,
      headers: auth(ctx.token),
      payload: { reason: "   " },
    });
    expect(res.statusCode).toBe(400);
  });

  it("cashiers get 403 on cancel", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id);
    const invoiceId = await postInvoice(med, ctx);
    expect((await generateInvoice(ctx, invoiceId)).statusCode).toBe(201);
    const cashier = seedUser();
    setRole(cashier.id, "cashier");

    const res = await app.inject({
      method: "POST",
      url: `/api/compliance/invoices/${invoiceId}/cancel`,
      headers: auth(cashier.token),
      payload: { reason: "nope" },
    });
    expect(res.statusCode).toBe(403);
    expect(submissionRows(ctx.id, invoiceId)[0].status).toBe("accepted");
  });

  it("allows re-generating after a cancellation (row updated in place)", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id);
    const invoiceId = await postInvoice(med, ctx);
    expect((await generateInvoice(ctx, invoiceId)).statusCode).toBe(201);

    const cancel = await app.inject({
      method: "POST",
      url: `/api/compliance/invoices/${invoiceId}/cancel`,
      headers: auth(ctx.token),
      payload: { reason: "wrong bill" },
    });
    expect(cancel.statusCode).toBe(200);
    const cancelledId = submissionRows(ctx.id, invoiceId)[0].id;

    const regen = await generateInvoice(ctx, invoiceId);
    expect(regen.statusCode).toBe(200);
    expect(regen.json().data.status).toBe("accepted");
    expect(regen.json().data.cancelledAt).toBeNull();

    const rows = submissionRows(ctx.id, invoiceId);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(cancelledId);
  });
});

// ---------------------------------------------------------------------------
// Rejected path + retry
// ---------------------------------------------------------------------------
describe("provider rejection", () => {
  it("marks the row rejected with the provider error and 422s", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id);
    const invoiceId = await postInvoice(med, ctx);
    __setGstProviderForTest(failingProvider("Invalid GSTIN"));

    const res = await generateInvoice(ctx, invoiceId);
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe("Invalid GSTIN");

    const rows = submissionRows(ctx.id, invoiceId);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("rejected");
    expect(rows[0].error).toBe("Invalid GSTIN");
    expect(auditCount(ctx.id, "compliance.einvoice_generated")).toBe(0);
  });

  it("re-generates a rejected row in place (still one UNIQUE row)", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id);
    const invoiceId = await postInvoice(med, ctx);

    __setGstProviderForTest(failingProvider("Invalid GSTIN"));
    expect((await generateInvoice(ctx, invoiceId)).statusCode).toBe(422);
    const rejectedId = submissionRows(ctx.id, invoiceId)[0].id;

    __setGstProviderForTest(null);
    const retry = await generateInvoice(ctx, invoiceId);
    expect(retry.statusCode).toBe(200); // updated, not re-created
    expect(retry.json().data.status).toBe("accepted");
    expect(retry.json().data.irn).toMatch(/^FAKE/);
    expect(retry.json().data.error).toBeNull();

    const rows = submissionRows(ctx.id, invoiceId);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(rejectedId);
    expect(rows[0].status).toBe("accepted");
    expect(auditCount(ctx.id, "compliance.einvoice_generated")).toBe(1);
  });

  it("propagates a provider cancel failure as 422 without changing the row", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id);
    const invoiceId = await postInvoice(med, ctx);
    expect((await generateInvoice(ctx, invoiceId)).statusCode).toBe(201);

    __setGstProviderForTest(failingProvider("Cancel rejected by portal"));
    const res = await app.inject({
      method: "POST",
      url: `/api/compliance/invoices/${invoiceId}/cancel`,
      headers: auth(ctx.token),
      payload: { reason: "oops" },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe("Cancel rejected by portal");
    expect(submissionRows(ctx.id, invoiceId)[0].status).toBe("accepted");
  });
});

// ---------------------------------------------------------------------------
// Not configured (NIC + missing credentials)
// ---------------------------------------------------------------------------
describe("provider not configured", () => {
  it("503s and records a pending row with the missing env names", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id);
    const invoiceId = await postInvoice(med, ctx);

    __setGstProviderForTest(null);
    process.env.EINVOICE_PROVIDER = "nic";
    // Credentials deliberately absent.

    const res = await generateInvoice(ctx, invoiceId);
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe("E-invoice provider not configured");

    const rows = submissionRows(ctx.id, invoiceId);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("pending");
    expect(rows[0].error).toContain("EINVOICE_GSP_ID");
    expect(auditCount(ctx.id, "compliance.einvoice_generated")).toBe(0);
  });

  it("NIC with full credentials resolves a provider (no env leak to clients)", () => {
    process.env.EINVOICE_PROVIDER = "nic";
    process.env.EINVOICE_GSP_ID = "g1";
    process.env.EINVOICE_GSP_KEY = "k1";
    process.env.EINVOICE_USERNAME = "u1";
    process.env.EINVOICE_PASSWORD = "p1";
    process.env.EINVOICE_BASE_URL = "https://nic.example/invoice";

    const health = isGstProviderConfigured();
    expect(health.provider).toBe("nic");
    expect(health.einvoice).toBe(true);
    expect(health.missingEinvoice).toEqual([]);
    expect(activeProviderName()).toBe("nic");
  });
});

// ---------------------------------------------------------------------------
// E-way bill
// ---------------------------------------------------------------------------
describe("e-way bill", () => {
  it("requires an accepted e-invoice first", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id);
    const invoiceId = await postInvoice(med, ctx);

    const res = await app.inject({
      method: "POST",
      url: `/api/compliance/invoices/${invoiceId}/eway`,
      headers: auth(ctx.token),
      payload: { distanceKm: 42, vehicleNo: "MH-01-AB-1234" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Generate e-invoice first");
    expect(submissionRows(ctx.id, invoiceId)).toHaveLength(0);
  });

  it("generates with vehicle_json after the e-invoice is accepted", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id);
    const invoiceId = await postInvoice(med, ctx);
    expect((await generateInvoice(ctx, invoiceId)).statusCode).toBe(201);

    const res = await app.inject({
      method: "POST",
      url: `/api/compliance/invoices/${invoiceId}/eway`,
      headers: auth(ctx.token),
      payload: {
        distanceKm: 42,
        transporterName: "Swift Cargo",
        transporterGstin: "27AAACS1234A1Z5",
        vehicleNo: "MH-01-AB-1234",
        reason: "Delivery",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.status).toBe("accepted");
    expect(res.json().data.kind).toBe("ewaybill");
    expect(res.json().data.ackNo).toMatch(/^EWB/);
    expect(res.json().data.irn).toMatch(/^FAKE/);

    const rows = submissionRows(ctx.id, invoiceId);
    expect(rows).toHaveLength(2); // einvoice + ewaybill, UNIQUE per kind
    const eway = rows.find((r) => r.kind === "ewaybill")!;
    const vehicle = JSON.parse(eway.vehicle_json);
    expect(vehicle.distanceKm).toBe(42);
    expect(vehicle.transporterName).toBe("Swift Cargo");
    expect(vehicle.vehicleNo).toBe("MH-01-AB-1234");
    expect(auditCount(ctx.id, "compliance.ewaybill_generated")).toBe(1);
  });

  it("409s a duplicate e-way bill and validates distanceKm", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id);
    const invoiceId = await postInvoice(med, ctx);
    expect((await generateInvoice(ctx, invoiceId)).statusCode).toBe(201);

    const first = await app.inject({
      method: "POST",
      url: `/api/compliance/invoices/${invoiceId}/eway`,
      headers: auth(ctx.token),
      payload: { distanceKm: 10 },
    });
    expect(first.statusCode).toBe(201);

    const dup = await app.inject({
      method: "POST",
      url: `/api/compliance/invoices/${invoiceId}/eway`,
      headers: auth(ctx.token),
      payload: { distanceKm: 10 },
    });
    expect(dup.statusCode).toBe(409);

    const invalid = await app.inject({
      method: "POST",
      url: `/api/compliance/invoices/${invoiceId}/eway`,
      headers: auth(ctx.token),
      payload: { distanceKm: 0 },
    });
    expect(invalid.statusCode).toBe(400);
  });

  it("cashiers get 403 on e-way generation", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id);
    const invoiceId = await postInvoice(med, ctx);
    expect((await generateInvoice(ctx, invoiceId)).statusCode).toBe(201);
    const cashier = seedUser();
    setRole(cashier.id, "cashier");

    const res = await app.inject({
      method: "POST",
      url: `/api/compliance/invoices/${invoiceId}/eway`,
      headers: auth(cashier.token),
      payload: { distanceKm: 5 },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Cross-tenant isolation
// ---------------------------------------------------------------------------
describe("cross-tenant isolation", () => {
  it("404s every per-invoice endpoint for a foreign invoice", async () => {
    const owner = seedUser();
    const other = seedUser();
    const med = seedMedicine(owner.id);
    const invoiceId = await postInvoice(med, owner);
    expect((await generateInvoice(owner, invoiceId)).statusCode).toBe(201);

    const status = await app.inject({
      method: "GET",
      url: `/api/compliance/invoices/${invoiceId}`,
      headers: auth(other.token),
    });
    expect(status.statusCode).toBe(404);

    const cancel = await app.inject({
      method: "POST",
      url: `/api/compliance/invoices/${invoiceId}/cancel`,
      headers: auth(other.token),
      payload: { reason: "not mine" },
    });
    expect(cancel.statusCode).toBe(404);

    const eway = await app.inject({
      method: "POST",
      url: `/api/compliance/invoices/${invoiceId}/eway`,
      headers: auth(other.token),
      payload: { distanceKm: 3 },
    });
    expect(eway.statusCode).toBe(404);

    // The owner's row is untouched.
    expect(submissionRows(owner.id, invoiceId)[0].status).toBe("accepted");
    expect(submissionRows(other.id, invoiceId)).toHaveLength(0);
  });

  it("scopes the submissions listing to the tenant", async () => {
    const owner = seedUser();
    const other = seedUser();
    const medA = seedMedicine(owner.id);
    const medB = seedMedicine(other.id);
    const invA = await postInvoice(medA, owner);
    const invB = await postInvoice(medB, other);
    expect((await generateInvoice(owner, invA)).statusCode).toBe(201);
    expect((await generateInvoice(other, invB)).statusCode).toBe(201);

    const mine = await app.inject({
      method: "GET",
      url: "/api/compliance/submissions",
      headers: auth(owner.token),
    });
    expect(mine.statusCode).toBe(200);
    const rows = mine.json().data;
    expect(rows).toHaveLength(1);
    expect(rows[0].invoiceId).toBe(invA);
    expect(rows[0].invoiceNo).toBeTruthy();

    const statusFiltered = await app.inject({
      method: "GET",
      url: "/api/compliance/submissions?status=accepted",
      headers: auth(owner.token),
    });
    expect(statusFiltered.json().data).toHaveLength(1);

    const noneFiltered = await app.inject({
      method: "GET",
      url: "/api/compliance/submissions?status=rejected",
      headers: auth(owner.token),
    });
    expect(noneFiltered.json().data).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Providers health (booleans only — never secrets)
// ---------------------------------------------------------------------------
describe("providers health", () => {
  it("defaults to the fake provider with both capabilities enabled", async () => {
    const ctx = seedUser();
    const res = await app.inject({
      method: "GET",
      url: "/api/compliance/providers",
      headers: auth(ctx.token),
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.provider).toBe("fake");
    expect(data.einvoice).toBe(true);
    expect(data.eway).toBe(true);
    expect(data.baseUrlsConfigured).toBe(true);
    expect(typeof data.einvoice).toBe("boolean");
    expect(typeof data.eway).toBe("boolean");
  });

  it("returns booleans and env NAMES only — no key/token/secret/password fields", async () => {
    const ctx = seedUser();
    process.env.EINVOICE_PROVIDER = "nic";
    const res = await app.inject({
      method: "GET",
      url: "/api/compliance/providers",
      headers: auth(ctx.token),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    const keys: string[] = [];
    const walk = (value: unknown) => {
      if (Array.isArray(value)) {
        value.forEach(walk);
      } else if (value && typeof value === "object") {
        for (const [k, v] of Object.entries(value)) {
          keys.push(k);
          walk(v);
        }
      }
    };
    walk(body);
    for (const key of keys) expect(key).not.toMatch(/token|key|secret|password/i);

    const data = body.data;
    expect(data.provider).toBe("nic");
    expect(data.einvoice).toBe(false);
    expect(data.eway).toBe(false);
    expect(data.missingEinvoice).toContain("EINVOICE_GSP_ID");
    expect(data.missingEinvoice).toContain("EINVOICE_BASE_URL");
    // Names only — the raw env values are never echoed back.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("EINVOICE_GSP_KEY=");
  });

  it("requires auth", async () => {
    const res = await app.inject({ method: "GET", url: "/api/compliance/providers" });
    expect(res.statusCode).toBe(401);
  });

  it("reports partial NIC configuration as false with missing EWAY_BASE_URL", () => {
    process.env.EINVOICE_PROVIDER = "nic";
    process.env.EINVOICE_GSP_ID = "g1";
    process.env.EINVOICE_GSP_KEY = "k1";
    process.env.EINVOICE_USERNAME = "u1";
    process.env.EINVOICE_PASSWORD = "p1";
    process.env.EINVOICE_BASE_URL = "https://nic.example/invoice";
    // EWAY_BASE_URL intentionally missing.

    const health = isGstProviderConfigured();
    expect(health.einvoice).toBe(true);
    expect(health.eway).toBe(false);
    expect(health.missingEway).toEqual(["EWAY_BASE_URL"]);
  });

  it("defaults to fake with both capabilities when no env is set", () => {
    const health = isGstProviderConfigured();
    expect(health.provider).toBe("fake");
    expect(health.einvoice).toBe(true);
    expect(health.eway).toBe(true);
    expect(health.missingEinvoice).toEqual([]);
    expect(health.missingEway).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Fake provider adapter contract
// ---------------------------------------------------------------------------
describe("fake GST provider", () => {
  const samplePayload = () => ({
    version: "1.1",
    TranDtls: { TaxSch: "GST", SupTyp: "B2B" },
    DocDtls: { Typ: "INV", No: "MB-2026-000001", Dt: "15-06-2026" },
    SellerDtls: { Gstin: STORE_GSTIN, LglNm: "Store", Std: "27" },
    BuyerDtls: { Gstin: CUSTOMER_GSTIN, LglNm: "Clinic X", Pos: "27" },
    ItemList: [],
    ValDtls: { AssVal: 0, CgstVal: 0, SgstVal: 0, IgstVal: 0, TotInvVal: 0 },
  });

  it("issues unique 12+ char FAKE IRNs with base64 QR payloads", async () => {
    const { fakeGstProvider } = await import("../src/providers/gst.js");
    const first = await fakeGstProvider.generateEInvoice(samplePayload());
    const second = await fakeGstProvider.generateEInvoice(samplePayload());

    expect(first.irn).toMatch(/^FAKE/);
    expect(first.irn.length).toBeGreaterThanOrEqual(12);
    expect(first.irn).not.toBe(second.irn);
    expect(first.ackNo).toMatch(/^ACK/);
    expect(first.ackDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const decoded = JSON.parse(Buffer.from(first.qrData, "base64").toString("utf8"));
    expect(decoded.irn).toBe(first.irn);
    expect(decoded.gstin).toBe(STORE_GSTIN);
  });

  it("cancels unconditionally and issues EWB e-way bills valid for 24h", async () => {
    const { fakeGstProvider } = await import("../src/providers/gst.js");
    const cancel = await fakeGstProvider.cancelEInvoice("FAKEABC123", "test");
    expect(cancel.raw).toMatchObject({ provider: "fake", cancelled: true });

    const before = Date.now();
    const eway = await fakeGstProvider.generateEWay({ Irn: "FAKEABC123", Distance: 10 });
    expect(eway.ewayBillNo).toMatch(/^EWB/);
    const valid = Date.parse(eway.validUpto);
    expect(valid).toBeGreaterThanOrEqual(before + 24 * 3600e3 - 5000);
    expect(valid).toBeLessThanOrEqual(Date.now() + 24 * 3600e3 + 5000);
    expect(eway.raw).toMatchObject({ provider: "fake" });
  });

  it("is the default provider from the factory and honors the test override", async () => {
    const { getGstProvider } = await import("../src/providers/gst.js");
    expect(getGstProvider().name).toBe("fake");

    const override: GstProvider = {
      name: "nic",
      async generateEInvoice() {
        throw new Error("should not be reached");
      },
      async cancelEInvoice() {
        return { raw: {} };
      },
      async generateEWay() {
        return { ewayBillNo: "EWBX", validUpto: "", raw: {} };
      },
    };
    __setGstProviderForTest(override);
    expect(getGstProvider()).toBe(override);

    __setGstProviderForTest(null);
    expect(getGstProvider().name).toBe("fake");
  });
});

// ---------------------------------------------------------------------------
// Auth + listing filters
// ---------------------------------------------------------------------------
describe("auth and listing filters", () => {
  it("requires a token on every compliance endpoint", async () => {
    const urls = [
      "/api/compliance/providers",
      "/api/compliance/submissions",
      "/api/compliance/invoices/any",
    ];
    for (const url of urls) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode).toBe(401);
    }
    const post = await app.inject({ method: "POST", url: "/api/compliance/invoices/any/generate" });
    expect(post.statusCode).toBe(401);
  });

  it("filters submissions by date range and rejects an unknown status", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id);
    const invoiceId = await postInvoice(med, ctx);
    expect((await generateInvoice(ctx, invoiceId)).statusCode).toBe(201);

    // listSubmissions parses from/to as LOCAL midnights (`${from}T00:00:00`),
    // so the range must use the local calendar date — toISOString() is UTC and
    // misses the window for the first ~5.5h of each day in positive offsets.
    const today = new Date().toLocaleDateString("en-CA");
    const inRange = await app.inject({
      method: "GET",
      url: `/api/compliance/submissions?from=${today}&to=${today}`,
      headers: auth(ctx.token),
    });
    expect(inRange.statusCode).toBe(200);
    expect(inRange.json().data).toHaveLength(1);

    const outOfRange = await app.inject({
      method: "GET",
      url: "/api/compliance/submissions?from=2000-01-01&to=2000-01-02",
      headers: auth(ctx.token),
    });
    expect(outOfRange.json().data).toHaveLength(0);

    const badStatus = await app.inject({
      method: "GET",
      url: "/api/compliance/submissions?status=bogus",
      headers: auth(ctx.token),
    });
    expect(badStatus.statusCode).toBe(400);
  });

  it("404s status for an unknown invoice id", async () => {
    const ctx = seedUser();
    const res = await app.inject({
      method: "GET",
      url: "/api/compliance/invoices/does-not-exist",
      headers: auth(ctx.token),
    });
    expect(res.statusCode).toBe(404);
  });

  it("surfaces a 503 on cancel when the provider is not configured", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id);
    const invoiceId = await postInvoice(med, ctx);
    expect((await generateInvoice(ctx, invoiceId)).statusCode).toBe(201);

    __setGstProviderForTest(null);
    process.env.EINVOICE_PROVIDER = "nic";

    const res = await app.inject({
      method: "POST",
      url: `/api/compliance/invoices/${invoiceId}/cancel`,
      headers: auth(ctx.token),
      payload: { reason: "switching provider" },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe("E-invoice provider not configured");
    // Row untouched by the failed cancel.
    expect(submissionRows(ctx.id, invoiceId)[0].status).toBe("accepted");
  });

  it("surfaces a 503 on e-way generation when the provider is not configured", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id);
    const invoiceId = await postInvoice(med, ctx);
    expect((await generateInvoice(ctx, invoiceId)).statusCode).toBe(201);

    __setGstProviderForTest(null);
    process.env.EINVOICE_PROVIDER = "nic";

    const res = await app.inject({
      method: "POST",
      url: `/api/compliance/invoices/${invoiceId}/eway`,
      headers: auth(ctx.token),
      payload: { distanceKm: 8 },
    });
    expect(res.statusCode).toBe(503);
    const eway = submissionRows(ctx.id, invoiceId).find((r) => r.kind === "ewaybill");
    expect(eway?.status).toBe("pending");
    expect(eway?.error).toContain("EINVOICE_GSP_ID");
  });
});
