import { beforeAll, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
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

import outboxRoutes from "../src/routes/outbox.js";
import fileRoutes from "../src/routes/files.js";
import purchaseImportRoutes from "../src/routes/purchaseImports.js";
import productIntelligenceRoutes from "../src/routes/productIntelligence.js";
import procurementRoutes from "../src/routes/procurement.js";
import expiryPolicyRoutes from "../src/routes/expiryPolicies.js";
import prescriptionRoutes from "../src/routes/prescriptions.js";
import stockAuditRoutes from "../src/routes/stockAudits.js";
import labelRoutes from "../src/routes/labels.js";
import messageRoutes from "../src/routes/messages.js";
import refillRoutes from "../src/routes/refills.js";
import invoiceRoutes from "../src/routes/invoices.js";
import accountingRoutes from "../src/routes/accounting.js";
import reconciliationRoutes from "../src/routes/reconciliation.js";
import complianceRoutes from "../src/routes/compliance.js";
import customerEngagementRoutes from "../src/routes/customerEngagement.js";
import customerOrderRoutes from "../src/routes/customerOrders.js";
import publicOrderRoutes from "../src/routes/publicOrders.js";
import deviceRoutes from "../src/routes/devices.js";
import syncRoutes from "../src/routes/sync.js";
import dataMigrationRoutes from "../src/routes/dataMigrations.js";
import bulkBillRoutes from "../src/routes/bulkBills.js";
import scheduledReportRoutes from "../src/routes/scheduledReports.js";
import integrationRoutes from "../src/routes/integrations.js";
import { enqueueOutbox } from "../src/services/outbox.js";
import { DEFAULT_POLICY } from "../src/services/expiryPolicy.js";

/**
 * Task 18 — systematic cross-tenant isolation sweep across every new route
 * surface added by Tasks 0-17.
 *
 * Shape: ONE shared Fastify instance registers all the new route modules; two
 * tenants are seeded (A owns representative data, B is the attacker). Every
 * surface asserts B gets 404 / an empty list / an error — never A's data —
 * and, where cheap, that A can still read its own row (so a 404 proves tenant
 * scoping rather than a broken route).
 *
 * Surfaces that are deliberately install-shared (staff order queue, expiry
 * policy singleton, integrations registry, public storefront) assert the
 * documented shared behaviour with an explanatory comment instead of a 404.
 *
 * Devices and purchase-import cross-tenant behaviour are proven end-to-end in
 * devices-sync.test.ts and purchase-import.test.ts — they are re-asserted here
 * only as one-line smoke checks so this file alone documents the whole sweep.
 */

let app: FastifyInstance;
let A: SeededUser;
let B: SeededUser;
let aMed: SeededMedicine;
let bMed: SeededMedicine;
let aCustomer: string;
let bCustomer: string;
let aInvoice: any;
let aInvoiceNo: string;

const auth = (u: SeededUser) => ({ authorization: `Bearer ${u.token}` });
const get = (url: string, u: SeededUser) => app.inject({ method: "GET", url, headers: auth(u) });
const post = (url: string, u: SeededUser, payload?: unknown) =>
  app.inject({ method: "POST", url, headers: auth(u), payload: payload as any });
const put = (url: string, u: SeededUser, payload?: unknown) =>
  app.inject({ method: "PUT", url, headers: auth(u), payload: payload as any });
const del = (url: string, u: SeededUser) => app.inject({ method: "DELETE", url, headers: auth(u) });

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

function count(sql: string, ...params: any[]): number {
  const rows = all<{ c: number }>(sql, ...params);
  return rows[0]?.c ?? 0;
}

function seedSupplierRow(ownerId: string, name: string): string {
  const id = nanoid(16);
  const now = Date.now();
  run(
    `INSERT INTO suppliers (id, name, is_active, created_by, created_at, updated_at)
     VALUES (?, ?, 1, ?, ?, ?)`,
    id,
    name,
    ownerId,
    now,
    now
  );
  return id;
}

const PAYLOAD_ITEM = (med: SeededMedicine) => ({
  medicineId: med.medicineId,
  medicineName: "Tenant Test Med",
  quantity: 1,
  unit: "Strip",
  mrp: 100,
  rate: 95.24,
  amount: 95.24,
  gstRate: "5",
  gstAmount: 4.76,
  cgst: 2.38,
  sgst: 2.38,
});

function invoiceBody(med: SeededMedicine, over: Record<string, unknown> = {}) {
  return {
    date: "2026-09-20",
    subtotal: 95.24,
    totalGst: 4.76,
    cgst: 2.38,
    sgst: 2.38,
    grandTotal: 100,
    amountPaid: 100,
    paymentMode: "cash",
    status: "paid",
    discountAmount: 0,
    items: [PAYLOAD_ITEM(med)],
    ...over,
  };
}

beforeAll(async () => {
  applySchema();

  app = Fastify({ logger: false });
  await app.register(cookie);
  await app.register(outboxRoutes, { prefix: "/api/outbox" });
  await app.register(fileRoutes, { prefix: "/api/files" });
  await app.register(purchaseImportRoutes, { prefix: "/api/purchase-imports" });
  await app.register(productIntelligenceRoutes, { prefix: "/api/product-intelligence" });
  await app.register(procurementRoutes, { prefix: "/api/procurement" });
  await app.register(expiryPolicyRoutes, { prefix: "/api/expiry-policy" });
  await app.register(prescriptionRoutes, { prefix: "/api/prescriptions" });
  await app.register(stockAuditRoutes, { prefix: "/api/stock-audits" });
  await app.register(labelRoutes, { prefix: "/api/labels" });
  await app.register(messageRoutes, { prefix: "/api/messages" });
  await app.register(refillRoutes, { prefix: "/api/refills" });
  await app.register(invoiceRoutes, { prefix: "/api/invoices" });
  await app.register(accountingRoutes, { prefix: "/api/accounting" });
  await app.register(reconciliationRoutes, { prefix: "/api/reconciliation" });
  await app.register(complianceRoutes, { prefix: "/api/compliance" });
  await app.register(customerEngagementRoutes, { prefix: "/api/customer-engagement" });
  await app.register(customerOrderRoutes, { prefix: "/api/orders" });
  await app.register(publicOrderRoutes, { prefix: "/api/public" });
  await app.register(deviceRoutes, { prefix: "/api/devices" });
  await app.register(syncRoutes, { prefix: "/api/sync" });
  await app.register(dataMigrationRoutes, { prefix: "/api/data-migrations" });
  await app.register(bulkBillRoutes, { prefix: "/api/bulk-bills" });
  await app.register(scheduledReportRoutes, { prefix: "/api/scheduled-reports" });
  await app.register(integrationRoutes, { prefix: "/api/integrations" });

  A = seedUser();
  B = seedUser();
  aMed = seedMedicine(A.id, { name: "TENANT-A DOLO 650", quantity: 30 });
  bMed = seedMedicine(B.id, { name: "TENANT-B AZITHRO 500", quantity: 30 });
  aCustomer = seedCustomer(A.id, { name: "A's Customer" }).id;
  bCustomer = seedCustomer(B.id, { name: "B's Customer" }).id;

  const created = await post("/api/invoices", A, invoiceBody(aMed));
  if (created.statusCode !== 201) {
    throw new Error(`seed invoice failed: ${created.statusCode} ${created.body}`);
  }
  aInvoice = created.json().data;
  aInvoiceNo = aInvoice.invoiceNo;
});

// ===========================================================================
// Task 0 — outbox + file storage foundations
// ===========================================================================
describe("outbox + files (Task 0)", () => {
  it("B never sees A's pending outbox events and cannot ack them", async () => {
    const event = await enqueueOutbox({
      createdBy: A.id,
      type: "message.send",
      aggregateType: "invoice",
      aggregateId: aInvoice.id,
      payload: { secret: "A-only-payload" },
    });

    const pending = await get("/api/outbox/pending", B);
    expect(pending.statusCode).toBe(200);
    const ids = (pending.json().data as any[]).map((e) => e.id);
    expect(ids).not.toContain(event.id);
    expect(pending.body).not.toContain("A-only-payload");

    const ack = await post(`/api/outbox/${event.id}/ack`, B, { status: "done" });
    expect(ack.statusCode).toBe(404);

    const ownerAck = await post(`/api/outbox/${event.id}/ack`, A, { status: "done" });
    expect(ownerAck.statusCode).toBe(200);
    expect(all("SELECT status FROM outbox_events WHERE id = ?", event.id)[0].status).toBe("done");

    const ownerPending = await get("/api/outbox/pending", A);
    expect((ownerPending.json().data as any[]).map((e) => e.id)).not.toContain(event.id);
  });

  it("B gets 404 reading A's stored file; A can still read it", async () => {
    const payload = {
      filename: "a-prescription.png",
      contentType: "image/png",
      data: Buffer.from("tenant-A-private-bytes").toString("base64"),
    };
    const upload = await post("/api/files", A, payload);
    expect(upload.statusCode).toBe(201);
    const fileId = upload.json().data.id;

    const foreign = await get(`/api/files/${fileId}`, B);
    expect(foreign.statusCode).toBe(404);

    const owner = await get(`/api/files/${fileId}`, A);
    expect(owner.statusCode).toBe(200);
    expect(Buffer.from(owner.json().data.data, "base64").toString()).toBe(
      "tenant-A-private-bytes"
    );
  });
});

// ===========================================================================
// Task 1 — purchase import (smoke; full matrix lives in purchase-import.test.ts)
// ===========================================================================
describe("purchase imports (Task 1, smoke)", () => {
  it("B gets 404 on A's import for GET / mappings / commit / DELETE", async () => {
    const csv = "Product,Batch,Expiry,Qty,Rate\nTENANT-A DOLO 650,BTI-1,12/27,5,10";
    const created = await post("/api/purchase-imports", A, { filename: "a.csv", csv });
    expect(created.statusCode).toBe(201);
    const id = created.body ? created.json().data.importId : "";

    expect((await get(`/api/purchase-imports/${id}`, B)).statusCode).toBe(404);
    expect(
      (await put(`/api/purchase-imports/${id}/mappings`, B, { mappings: {}, defaults: {} }))
        .statusCode
    ).toBe(404);
    expect(
      (
        await post(`/api/purchase-imports/${id}/commit`, B, {
          billNo: "TENANT-B-STEAL",
          billDate: "2026-09-20",
          rows: [
            {
              rowIndex: 0,
              medicineId: bMed.medicineId,
              batchNo: "STEAL-1",
              expiryDate: "2027-12-31",
              quantity: 5,
              freeQuantity: 0,
              purchasePrice: 10,
            },
          ],
        })
      ).statusCode
    ).toBe(404);
    expect((await del(`/api/purchase-imports/${id}`, B)).statusCode).toBe(404);
    expect(count("SELECT COUNT(*) AS c FROM purchase_bills WHERE bill_no = 'TENANT-B-STEAL'")).toBe(0);

    expect((await get(`/api/purchase-imports/${id}`, A)).statusCode).toBe(200);
  });
});

// ===========================================================================
// Task 3 — product intelligence
// ===========================================================================
describe("product intelligence (Task 3)", () => {
  it("alternatives 404s a foreign medicineId but serves A's own", async () => {
    const foreign = await get(
      `/api/product-intelligence/alternatives?medicineId=${aMed.medicineId}`,
      B
    );
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json().success).toBe(false);

    const own = await get(
      `/api/product-intelligence/alternatives?medicineId=${aMed.medicineId}`,
      A
    );
    expect(own.statusCode).toBe(200);
    expect(own.json().data.source.medicineId).toBe(aMed.medicineId);
  });

  it("substitute links are invisible to B and B cannot create them", async () => {
    const link = await post("/api/product-intelligence/substitutes", A, {
      medicineId: aMed.medicineId,
      substituteMedicineId: aMed.medicineId === "x" ? "y" : aMed.medicineId,
      reason: "self",
    });
    // self-link is rejected; create a real second medicine for A instead
    const aAlt = seedMedicine(A.id, { name: "TENANT-A PARA 500", quantity: 5 });
    const created = await post("/api/product-intelligence/substitutes", A, {
      medicineId: aMed.medicineId,
      substituteMedicineId: aAlt.medicineId,
      reason: "cheaper salt",
    });
    expect(created.statusCode).toBe(201);
    expect(link.statusCode).toBe(400);

    const foreignRead = await get(
      `/api/product-intelligence/links?medicineId=${aMed.medicineId}`,
      B
    );
    expect(foreignRead.statusCode).toBe(200);
    expect(foreignRead.json().data).toHaveLength(0);
    expect(foreignRead.body).not.toContain("cheaper salt");

    const ownerRead = await get(
      `/api/product-intelligence/links?medicineId=${aMed.medicineId}`,
      A
    );
    expect(ownerRead.json().data).toHaveLength(1);

    const foreignWrite = await post("/api/product-intelligence/substitutes", B, {
      medicineId: aMed.medicineId,
      substituteMedicineId: aAlt.medicineId,
    });
    expect(foreignWrite.statusCode).toBe(404);
  });

  it("B's search never returns A's stocked medicines", async () => {
    const res = await get("/api/product-intelligence/search?q=TENANT-A DOLO", B);
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(Array.isArray(data.stock)).toBe(true);
    // B's own stock bucket is empty for A's search term…
    expect(data.stock).toHaveLength(0);
    // …and no reference-catalog row can smuggle A's tenant medicine id in.
    expect(JSON.stringify(data)).not.toContain(aMed.medicineId);
    expect(JSON.stringify(data)).not.toContain("TENANT-A DOLO 650");

    const ownerRes = await get("/api/product-intelligence/search?q=TENANT-A DOLO", A);
    expect(ownerRes.json().data.stock.map((s: any) => s.medicineId)).toContain(aMed.medicineId);
  });
});

// ===========================================================================
// Task 4 — procurement
// ===========================================================================
describe("procurement (Task 4)", () => {
  let aSupplierId: string;

  beforeAll(async () => {
    aSupplierId = seedSupplierRow(A.id, "A's Distributor");
    const billId = nanoid(16);
    const now = Date.now();
    run(
      `INSERT INTO purchase_bills (id, bill_no, supplier_id, supplier_name, bill_date, subtotal, total_gst, grand_total, amount_paid, payment_mode, payment_status, created_by, created_at, updated_at)
       VALUES (?, 'TENANT-A-PO-1', ?, 'A''s Distributor', '2026-08-01', 100, 12, 112, 112, 'cash', 'paid', ?, ?, ?)`,
      billId,
      aSupplierId,
      A.id,
      now,
      now
    );
    run(
      `INSERT INTO purchase_bill_items (id, purchase_bill_id, medicine_id, medicine_name, quantity, rate, amount, gst_rate, gst_amount, cgst, sgst, created_at)
       VALUES (?, ?, ?, 'TENANT-A DOLO 650', 10, 10, 100, '12', 12, 6, 6, ?)`,
      nanoid(16),
      billId,
      aMed.medicineId,
      now
    );
    await post("/api/procurement/quotes", A, {
      supplierId: aSupplierId,
      medicineId: aMed.medicineId,
      quotedRate: 9.5,
      quoteDate: "2026-08-20",
    });
  });

  it("compare / rate-history / quotes expose none of A's rows to B", async () => {
    const ownCompare = await get(
      `/api/procurement/compare?medicineId=${aMed.medicineId}`,
      A
    );
    expect(ownCompare.statusCode).toBe(200);
    expect(ownCompare.json().data.quotes.length).toBeGreaterThan(0);
    expect(ownCompare.body).toContain("A's Distributor");

    const foreignCompare = await get(
      `/api/procurement/compare?medicineId=${aMed.medicineId}`,
      B
    );
    expect(foreignCompare.statusCode).toBe(200);
    expect(foreignCompare.json().data.quotes).toHaveLength(0);
    expect(foreignCompare.body).not.toContain("A's Distributor");

    const ownHistory = await get(
      `/api/procurement/rate-history?medicineId=${aMed.medicineId}`,
      A
    );
    expect(ownHistory.json().data.count).toBeGreaterThan(0);

    const foreignHistory = await get(
      `/api/procurement/rate-history?medicineId=${aMed.medicineId}`,
      B
    );
    expect(foreignHistory.statusCode).toBe(200);
    expect(foreignHistory.json().data.count).toBe(0);

    const ownQuotes = await get("/api/procurement/quotes", A);
    expect(ownQuotes.json().data.count).toBeGreaterThan(0);
    const foreignQuotes = await get("/api/procurement/quotes", B);
    expect(foreignQuotes.statusCode).toBe(200);
    expect(foreignQuotes.json().data.count).toBe(0);

    const ownRec = await get(
      `/api/procurement/recommendation?medicineId=${aMed.medicineId}`,
      A
    );
    expect(ownRec.json().data.suppliersConsidered).toBeGreaterThan(0);
    const foreignRec = await get(
      `/api/procurement/recommendation?medicineId=${aMed.medicineId}`,
      B
    );
    expect(foreignRec.json().data.suppliersConsidered).toBe(0);
  });

  it("foreign supplier metrics + expiry drill-down → 404; B cannot quote A's ids", async () => {
    const metrics = await get(`/api/procurement/suppliers/${aSupplierId}/metrics`, B);
    expect(metrics.statusCode).toBe(404);
    expect(metrics.body).not.toContain("A's Distributor");

    const ownMetrics = await get(`/api/procurement/suppliers/${aSupplierId}/metrics`, A);
    expect(ownMetrics.statusCode).toBe(200);
    expect(ownMetrics.json().data.supplierName).toBe("A's Distributor");

    const expiryItems = await get(`/api/procurement/suppliers/${aSupplierId}/expiry-items`, B);
    expect(expiryItems.statusCode).toBe(404);

    const ownExpiry = await get(`/api/procurement/suppliers/${aSupplierId}/expiry-items`, A);
    expect(ownExpiry.statusCode).toBe(200);

    const foreignQuote = await post("/api/procurement/quotes", B, {
      supplierId: aSupplierId,
      medicineId: aMed.medicineId,
      quotedRate: 1,
    });
    expect(foreignQuote.statusCode).toBe(404);
    expect(count("SELECT COUNT(*) AS c FROM supplier_quotes WHERE created_by = ?", B.id)).toBe(0);
  });
});

// ===========================================================================
// Task 5 — expiry policy (INSTALL-WIDE singleton by design)
// ===========================================================================
describe("expiry policy (Task 5 — shared by design)", () => {
  it("is a per-install singleton: B sees exactly the policy A wrote", async () => {
    const written = { ...DEFAULT_POLICY, warningDays: 45 };
    const save = await put("/api/expiry-policy", A, written);
    expect(save.statusCode).toBe(200);

    const readByB = await get("/api/expiry-policy", B);
    expect(readByB.statusCode).toBe(200);
    // Documented: the settings table has no tenant column — one policy row
    // serves every user of this single-store install. This is NOT a leak.
    expect(readByB.json().data.policy.warningDays).toBe(45);
    expect(readByB.json().data.policy).toEqual(written);

    // Restore defaults for the rest of the file.
    await put("/api/expiry-policy", B, DEFAULT_POLICY);
  });
});

// ===========================================================================
// Task 6 — prescriptions
// ===========================================================================
describe("prescriptions (Task 6)", () => {
  let aPrescriptionId: string;

  beforeAll(async () => {
    const res = await post("/api/prescriptions", A, {
      patientName: "A's Patient",
      date: "2026-09-10",
      notes: "A-private-clinical-note",
    });
    if (res.statusCode !== 201) throw new Error(`seed prescription failed: ${res.body}`);
    aPrescriptionId = res.json().data.id;
  });

  it("B's list is empty and A's record is unreachable on every verb", async () => {
    const list = await get("/api/prescriptions", B);
    expect(list.statusCode).toBe(200);
    expect(list.json().total).toBe(0);
    expect(list.json().data).toHaveLength(0);
    expect(list.body).not.toContain("A-private-clinical-note");

    const ownerList = await get("/api/prescriptions", A);
    expect(ownerList.json().total).toBeGreaterThan(0);

    expect((await get(`/api/prescriptions/${aPrescriptionId}`, B)).statusCode).toBe(404);
    expect(
      (await put(`/api/prescriptions/${aPrescriptionId}`, B, { patientName: "hijacked" })).statusCode
    ).toBe(404);
    expect((await post(`/api/prescriptions/${aPrescriptionId}/verify`, B)).statusCode).toBe(404);
    expect(
      (await post(`/api/prescriptions/${aPrescriptionId}/reject`, B, { reason: "not mine" }))
        .statusCode
    ).toBe(404);
    expect(
      (await post(`/api/prescriptions/${aPrescriptionId}/dispense`, B, { invoiceId: aInvoice.id }))
        .statusCode
    ).toBe(404);
    expect((await del(`/api/prescriptions/${aPrescriptionId}`, B)).statusCode).toBe(404);

    // A's row is untouched and still owned by A.
    const row = all("SELECT patient_name, status, created_by FROM prescriptions WHERE id = ?", aPrescriptionId)[0];
    expect(row.patient_name).toBe("A's Patient");
    expect(row.status).toBe("pending");
    expect(row.created_by).toBe(A.id);
  });

  it("B cannot link A's prescription to its own invoice", async () => {
    const res = await post("/api/prescriptions", B, {
      patientName: "B Patient",
      date: "2026-09-11",
      imageFileId: "whatever",
    });
    expect([201, 400]).toContain(res.statusCode);
    // And an invoice sale referencing A's prescription from B is refused.
    const invoice = await post("/api/invoices", B, {
      ...invoiceBody(bMed),
      prescriptionId: aPrescriptionId,
    });
    expect(invoice.statusCode).toBe(400);
    expect(invoice.json().error).toMatch(/Prescription|prescription/i);
  });
});

// ===========================================================================
// Task 7 — stock audits
// ===========================================================================
describe("stock audits (Task 7)", () => {
  let aAuditId: string;
  let aCountId: string;

  beforeAll(async () => {
    const res = await post("/api/stock-audits", A, { note: "A private stock-take" });
    if (res.statusCode !== 201) throw new Error(`seed audit failed: ${res.body}`);
    aAuditId = res.json().data.id;
    const countRes = await post(`/api/stock-audits/${aAuditId}/counts`, A, {
      medicineId: aMed.medicineId,
      batchId: aMed.batchId,
      countedQuantity: 27,
    });
    if (countRes.statusCode !== 200 && countRes.statusCode !== 201) {
      throw new Error(`seed count failed: ${countRes.body}`);
    }
    aCountId = countRes.json().data.id;
  });

  it("B's audit list is empty and A's session/counts are unreachable", async () => {
    const list = await get("/api/stock-audits", B);
    expect(list.statusCode).toBe(200);
    expect(list.json().total).toBe(0);
    expect(list.json().data).toHaveLength(0);
    expect(list.body).not.toContain("A private stock-take");

    const ownerList = await get("/api/stock-audits", A);
    expect(ownerList.json().total).toBe(1);

    expect((await get(`/api/stock-audits/${aAuditId}`, B)).statusCode).toBe(404);
    expect(
      (await post(`/api/stock-audits/${aAuditId}/counts`, B, {
        medicineId: bMed.medicineId,
        batchId: bMed.batchId,
        countedQuantity: 1,
      })).statusCode
    ).toBe(404);
    expect(
      (await put(`/api/stock-audits/counts/${aCountId}`, B, { countedQuantity: 1 })).statusCode
    ).toBe(404);
    expect(
      (await post(`/api/stock-audits/${aAuditId}/approve`, B, { reason: "steal" })).statusCode
    ).toBe(404);
    expect(
      (await post(`/api/stock-audits/${aAuditId}/cancel`, B, { reason: "sabotage" })).statusCode
    ).toBe(404);

    // A's count is unchanged and its audit is still open.
    expect(all("SELECT status FROM stock_audits WHERE id = ?", aAuditId)[0].status).toBe("open");
    expect(
      all("SELECT counted_quantity FROM stock_audit_counts WHERE id = ?", aCountId)[0].counted_quantity
    ).toBe(27);
  });
});

// ===========================================================================
// Task 8 — labels (smoke; unit case lives in labels.test.ts)
// ===========================================================================
describe("labels (Task 8, smoke)", () => {
  it("B cannot preview labels from A's medicine", async () => {
    const foreign = await post("/api/labels/preview", B, {
      items: [{ medicineId: aMed.medicineId, quantity: 1, template: "40x25mm" }],
    });
    expect(foreign.statusCode).toBe(404);

    const own = await post("/api/labels/preview", A, {
      items: [{ medicineId: aMed.medicineId, quantity: 1, template: "40x25mm" }],
    });
    expect(own.statusCode).toBe(200);
    expect(own.json().data.labels.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Task 9 — messages, preferences, refills + invoice share
// ===========================================================================
describe("messaging + refills + share (Task 9)", () => {
  let aDeliveryId: string;
  let aRefillId: string;

  beforeAll(async () => {
    const send = await post("/api/messages/send", A, {
      channel: "sms",
      recipient: "+911111111111",
      template: "invoice_share",
      variables: { customerName: "A", invoiceNo: aInvoiceNo },
    });
    if (send.statusCode !== 201) throw new Error(`seed message failed: ${send.body}`);
    aDeliveryId = send.json().data.id;

    await put("/api/messages/preferences", A, {
      customerId: aCustomer,
      channel: "whatsapp",
      optedOut: true,
    });

    const refill = await post("/api/refills", A, {
      customerName: "A Refill Customer",
      customerPhone: "+912222222222",
      medicineName: "TENANT-A DOLO 650",
      lastPurchaseDate: "2026-08-01",
      reminderDate: new Date().toISOString().split("T")[0],
    });
    if (refill.statusCode !== 201) throw new Error(`seed refill failed: ${refill.body}`);
    aRefillId = refill.json().data.id;
  });

  it("delivery history, preferences and retry are tenant-scoped", async () => {
    const history = await get("/api/messages", B);
    expect(history.statusCode).toBe(200);
    expect(history.json().total).toBe(0);
    expect(history.json().data).toHaveLength(0);

    const ownerHistory = await get("/api/messages", A);
    expect(ownerHistory.json().total).toBeGreaterThan(0);

    const prefs = await get("/api/messages/preferences", B);
    expect(prefs.statusCode).toBe(200);
    expect(prefs.json().data).toHaveLength(0);
    expect(prefs.body).not.toContain(aCustomer);

    const ownerPrefs = await get("/api/messages/preferences", A);
    expect(ownerPrefs.json().data).toHaveLength(1);

    // B cannot write a preference against A's customer either.
    const foreignPref = await put("/api/messages/preferences", B, {
      customerId: aCustomer,
      channel: "whatsapp",
      optedOut: false,
    });
    expect(foreignPref.statusCode).toBe(404);

    // B's retry is a 404 and mutates nothing (delivery row byte-identical).
    const beforeRetry = all("SELECT * FROM message_deliveries WHERE id = ?", aDeliveryId)[0];
    const retry = await post(`/api/messages/${aDeliveryId}/retry`, B);
    expect(retry.statusCode).toBe(404);
    expect(all("SELECT * FROM message_deliveries WHERE id = ?", aDeliveryId)[0]).toEqual(
      beforeRetry
    );
  });

  it("refill lists + send only ever touch the caller's rows", async () => {
    const list = await get("/api/refills", B);
    expect(list.statusCode).toBe(200);
    expect(list.json().data).toHaveLength(0);
    expect(list.body).not.toContain("TENANT-A DOLO 650");

    expect((await post(`/api/refills/${aRefillId}/send`, B, { channel: "sms" })).statusCode).toBe(
      404
    );

    // send-due is scoped to the caller: B has nothing due → 0 queued.
    const bDue = await post("/api/refills/send-due", B, { channel: "sms" });
    expect(bDue.statusCode).toBe(200);
    expect(bDue.json().data.queued).toBe(0);

    const aDue = await post("/api/refills/send-due", A, { channel: "sms" });
    expect(aDue.statusCode).toBe(200);
    expect(aDue.json().data.queued).toBe(1);
    expect(aDue.json().data.deliveryIds).toHaveLength(1);
    expect(count("SELECT COUNT(*) AS c FROM message_deliveries WHERE created_by = ?", A.id)).toBe(2);
    expect(count("SELECT COUNT(*) AS c FROM message_deliveries WHERE created_by = ?", B.id)).toBe(0);
  });

  it("B cannot share A's invoice (404 before any message is queued)", async () => {
    const before = count("SELECT COUNT(*) AS c FROM message_deliveries");
    const res = await post(`/api/invoices/${aInvoice.id}/share`, B, { channels: ["sms"] });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("Invoice not found");
    expect(count("SELECT COUNT(*) AS c FROM message_deliveries")).toBe(before);
  });
});

// ===========================================================================
// Invoices by number — cross-tenant read FIXED in Task 18
// ===========================================================================
describe("invoice lookup by number (Task 18 fix)", () => {
  it("B gets 404 for A's invoice number while A still resolves its own", async () => {
    const foreign = await get(`/api/invoices/number/${aInvoiceNo}`, B);
    expect(foreign.statusCode).toBe(404);
    expect(foreign.body).not.toContain(aInvoice.id);

    const owner = await get(`/api/invoices/number/${aInvoiceNo}`, A);
    expect(owner.statusCode).toBe(200);
    expect(owner.json().data.id).toBe(aInvoice.id);

    // Direct id lookup is scoped too (regression guard).
    expect((await get(`/api/invoices/${aInvoice.id}`, B)).statusCode).toBe(404);
    expect((await del(`/api/invoices/${aInvoice.id}`, B)).statusCode).toBe(404);
  });
});

// ===========================================================================
// Task 10 — customer engagement
// ===========================================================================
describe("customer engagement (Task 10)", () => {
  let aOfferId: string;
  let aCampaignId: string;

  beforeAll(async () => {
    await post("/api/customer-engagement/loyalty/earn", A, {
      customerId: aCustomer,
      points: 100,
      reason: "seed",
    });
    const offer = await post("/api/customer-engagement/offers", A, {
      name: "A's secret offer",
      type: "percent",
      value: 10,
      startsOn: "2026-09-01",
      endsOn: "2026-12-31",
    });
    if (offer.statusCode !== 201) throw new Error(`seed offer failed: ${offer.body}`);
    aOfferId = offer.json().data.id;

    const campaign = await post("/api/customer-engagement/campaigns", A, {
      name: "A's campaign",
      channel: "sms",
      audience: { type: "all" },
    });
    if (campaign.statusCode !== 201) throw new Error(`seed campaign failed: ${campaign.body}`);
    aCampaignId = campaign.json().data.id;
  });

  it("insights + loyalty are scoped: foreign customerId → 404, own balance empty", async () => {
    const insights = await get(`/api/customer-engagement/insights/${aCustomer}`, B);
    expect(insights.statusCode).toBe(404);
    expect(insights.body).not.toContain("A's Customer");

    const ownInsights = await get(`/api/customer-engagement/insights/${aCustomer}`, A);
    expect(ownInsights.statusCode).toBe(200);

    const foreignLoyalty = await get(`/api/customer-engagement/loyalty?customerId=${aCustomer}`, B);
    expect(foreignLoyalty.statusCode).toBe(404);
    expect(foreignLoyalty.body).not.toContain("100");

    const ownLoyalty = await get(`/api/customer-engagement/loyalty?customerId=${aCustomer}`, A);
    expect(ownLoyalty.statusCode).toBe(200);
    expect(ownLoyalty.json().data.balance).toBe(100);

    // B's own customer has an empty ledger — no A rows leaked into it.
    const bLoyalty = await get(`/api/customer-engagement/loyalty?customerId=${bCustomer}`, B);
    expect(bLoyalty.statusCode).toBe(200);
    expect(bLoyalty.json().data.balance).toBe(0);
    expect(bLoyalty.json().data.entries).toHaveLength(0);

    // Earning against A's customer from B is refused.
    const earn = await post("/api/customer-engagement/loyalty/earn", B, {
      customerId: aCustomer,
      points: 1,
    });
    expect(earn.statusCode).toBe(404);
    expect(
      count(
        "SELECT COUNT(*) AS c FROM loyalty_ledger WHERE created_by = ? AND customer_id = ?",
        B.id,
        aCustomer
      )
    ).toBe(0);
  });

  it("offers and campaigns: B reads only its own and every foreign id 404s", async () => {
    const offers = await get("/api/customer-engagement/offers", B);
    expect(offers.statusCode).toBe(200);
    expect(offers.json().data).toHaveLength(0);
    expect(offers.body).not.toContain("A's secret offer");

    const ownOffers = await get("/api/customer-engagement/offers", A);
    expect(ownOffers.json().data.map((o: any) => o.id)).toContain(aOfferId);

    expect(
      (await put(`/api/customer-engagement/offers/${aOfferId}`, B, { value: 99 })).statusCode
    ).toBe(404);
    expect(
      (await post(`/api/customer-engagement/offers/${aOfferId}/deactivate`, B)).statusCode
    ).toBe(404);
    expect(
      (await post(`/api/customer-engagement/offers/${aOfferId}/evaluate`, B, { subtotal: 100 }))
        .statusCode
    ).toBe(404);
    expect(all("SELECT value FROM offers WHERE id = ?", aOfferId)[0].value).toBe(10);

    const campaigns = await get("/api/customer-engagement/campaigns", B);
    expect(campaigns.statusCode).toBe(200);
    expect(campaigns.json().data).toHaveLength(0);
    expect(campaigns.body).not.toContain("A's campaign");

    expect((await get(`/api/customer-engagement/campaigns/${aCampaignId}`, B)).statusCode).toBe(404);
    expect(
      (await post(`/api/customer-engagement/campaigns/${aCampaignId}/send`, B)).statusCode
    ).toBe(404);
    expect(
      (await post(`/api/customer-engagement/campaigns/${aCampaignId}/cancel`, B)).statusCode
    ).toBe(404);
    expect(
      all("SELECT status FROM campaigns WHERE id = ?", aCampaignId)[0].status
    ).toBe("draft");
  });
});

// ===========================================================================
// Tasks 11-12 — accounting + reconciliation
// ===========================================================================
describe("accounting (Task 11)", () => {
  let aEntryId: string;

  beforeAll(async () => {
    const posted = await post("/api/accounting/post", A, {
      date: "2026-09-01",
      description: "A private capital",
      lines: [
        { code: "CASH", debit: 5000 },
        { code: "CAPITAL", credit: 5000 },
      ],
    });
    if (posted.statusCode !== 201) throw new Error(`seed journal failed: ${posted.body}`);
    aEntryId = posted.json().data.entry.entryId ?? posted.json().data.entryId;
    if (!aEntryId) {
      const rows = all<{ id: string }>(
        "SELECT id FROM journal_entries WHERE created_by = ? AND source_type = 'manual' ORDER BY created_at DESC",
        A.id
      );
      aEntryId = rows[0].id;
    }
  });

  it("B's reports total zero, day book is empty and A's entry is unreachable", async () => {
    const tb = await get("/api/accounting/trial-balance?from=2026-08-01&to=2026-10-31", B);
    expect(tb.statusCode).toBe(200);
    expect(tb.json().data.totals.totalDebit).toBe(0);
    expect(tb.json().data.totals.totalCredit).toBe(0);

    const ownTb = await get("/api/accounting/trial-balance?from=2026-08-01&to=2026-10-31", A);
    expect(ownTb.json().data.totals.totalDebit).toBeGreaterThan(0);

    const pl = await get("/api/accounting/profit-loss?from=2026-08-01&to=2026-10-31", B);
    expect(pl.json().data.incomeTotal).toBe(0);

    const bs = await get("/api/accounting/balance-sheet?asOf=2026-10-31", B);
    expect(bs.json().data.totals.assets).toBe(0);

    const dayBook = await get("/api/accounting/day-book?from=2026-08-01&to=2026-10-31", B);
    expect(dayBook.json().data.total).toBe(0);
    expect(dayBook.json().data.entries).toHaveLength(0);
    expect(dayBook.body).not.toContain("A private capital");

    const trace = await get("/api/accounting/entries?sourceType=manual", B);
    expect(trace.json().data).toHaveLength(0);

    const direct = await get(`/api/accounting/entries/${aEntryId}`, B);
    expect(direct.statusCode).toBe(404);

    const reverse = await post(`/api/accounting/entries/${aEntryId}/reverse`, B, {
      reason: "sabotage",
    });
    expect(reverse.statusCode).toBe(404);
  });

  it("B's chart is seeded per-user on first use and never carries A's manual account", async () => {
    const res = await get("/api/accounting/accounts", B);
    expect(res.statusCode).toBe(200);
    const codes = (res.json().data as any[]).map((row) => row.code);
    // ensureChart seeds the 14 system accounts for B on first read — by design.
    expect(codes).toContain("CASH");
    expect(codes).not.toContain("A-MANUAL-CODE");

    const own = await post("/api/accounting/accounts", A, {
      code: "A-MANUAL-CODE",
      name: "A private asset",
      type: "asset",
    });
    expect(own.statusCode).toBe(201);

    const after = await get("/api/accounting/accounts", B);
    expect((after.json().data as any[]).map((row) => row.code)).not.toContain("A-MANUAL-CODE");
    expect(
      count("SELECT COUNT(*) AS c FROM accounts WHERE created_by = ? AND code = 'A-MANUAL-CODE'", B.id)
    ).toBe(0);
  });

  it("manual posts stay invisible to the other tenant", async () => {
    const posted = await post("/api/accounting/post", B, {
      date: "2026-09-02",
      lines: [
        { code: "CASH", debit: 75 },
        { code: "CAPITAL", credit: 75 },
      ],
    });
    expect(posted.statusCode).toBe(201);

    const dayBookA = await get("/api/accounting/day-book?from=2026-08-01&to=2026-10-31", A);
    expect(dayBookA.body).not.toContain('"credit":75');
    const tbA = await get("/api/accounting/trial-balance?from=2026-09-02&to=2026-09-02", A);
    expect(tbA.json().data.totals.totalDebit).toBe(0);
  });
});

describe("reconciliation (Task 12)", () => {
  const CSV = [
    "Date,Reference,Description,Amount",
    "15/09/2026,UPI-A1,A private credit,1500.50",
  ].join("\r\n");

  beforeAll(async () => {
    await post("/api/accounting/post", A, {
      date: "2026-09-15",
      lines: [
        { code: "BANK", debit: 1200 },
        { code: "CAPITAL", credit: 1200 },
      ],
    });
    const imported = await post("/api/reconciliation/import", A, { csv: CSV });
    if (imported.statusCode !== 201) throw new Error(`seed statement failed: ${imported.body}`);
  });

  it("B's books, statement rows and status contain none of A's data", async () => {
    const cashA = await get("/api/reconciliation/cash?from=2026-09-01&to=2026-09-30", A);
    expect(cashA.statusCode).toBe(200);
    const bankA = await get("/api/reconciliation/bank?from=2026-09-01&to=2026-09-30", A);
    expect(bankA.json().data.rows.length).toBeGreaterThan(0);

    const cashB = await get("/api/reconciliation/cash?from=2026-09-01&to=2026-09-30", B);
    expect(cashB.statusCode).toBe(200);
    // B's cash book shows ONLY B's own movement (its ₹75 manual entry) — A's
    // ₹5,000 capital injection and ₹100 sale receipt never appear.
    expect(cashB.json().data.inflow).toBeCloseTo(75, 2);
    expect(cashB.body).not.toContain("A private capital");
    const aCashLineIds = all<{ id: string }>(
      `SELECT jl.id AS id FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       JOIN accounts acc ON acc.id = jl.account_id
       WHERE je.created_by = ? AND acc.code = 'CASH'`,
      A.id
    ).map((r) => r.id);
    expect(aCashLineIds.length).toBeGreaterThan(0);
    for (const row of cashB.json().data.rows as any[]) {
      expect(aCashLineIds).not.toContain(row.lineId);
    }

    const bankB = await get("/api/reconciliation/bank?from=2026-09-01&to=2026-09-30", B);
    expect(bankB.json().data.rows).toHaveLength(0);
    expect(bankB.json().data.inflow).toBe(0);

    const rowsB = await get("/api/reconciliation/rows", B);
    expect(rowsB.statusCode).toBe(200);
    expect(rowsB.json().data).toHaveLength(0);
    expect(rowsB.body).not.toContain("UPI-A1");
    expect(rowsB.body).not.toContain("A private credit");

    const rowsA = await get("/api/reconciliation/rows", A);
    expect(rowsA.json().data.length).toBeGreaterThan(0);
    const aRowId = rowsA.json().data[0].id;

    const statusB = await get("/api/reconciliation/status", B);
    expect(statusB.statusCode).toBe(200);
    expect(statusB.json().data.totals).toMatchObject({
      statementRows: 0,
      matched: 0,
      unmatchedRows: 0,
      unmatchedJournalLines: 0,
    });

    // Suggesting matches for A's statement row from B is a 404.
    const suggest = await get(`/api/reconciliation/suggest?bankRowId=${aRowId}`, B);
    expect(suggest.statusCode).toBe(404);
  });
});

// ===========================================================================
// Task 13 — compliance
// ===========================================================================
describe("compliance (Task 13)", () => {
  beforeAll(() => {
    run(
      `INSERT INTO compliance_submissions (id, created_by, invoice_id, kind, status, provider, irn, created_at, updated_at)
       VALUES (?, ?, ?, 'einvoice', 'accepted', 'fake', 'FAKE-IRN-A', ?, ?)`,
      nanoid(16),
      A.id,
      aInvoice.id,
      Date.now(),
      Date.now()
    );
  });

  it("every per-invoice endpoint 404s for a foreign invoice", async () => {
    const status = await get(`/api/compliance/invoices/${aInvoice.id}`, B);
    expect(status.statusCode).toBe(404);
    expect(status.body).not.toContain("FAKE-IRN-A");

    const generate = await post(`/api/compliance/invoices/${aInvoice.id}/generate`, B);
    expect(generate.statusCode).toBe(404);

    const cancel = await post(`/api/compliance/invoices/${aInvoice.id}/cancel`, B, {
      reason: "not mine",
    });
    expect(cancel.statusCode).toBe(404);

    const eway = await post(`/api/compliance/invoices/${aInvoice.id}/eway`, B, { distanceKm: 5 });
    expect(eway.statusCode).toBe(404);

    const ownStatus = await get(`/api/compliance/invoices/${aInvoice.id}`, A);
    expect(ownStatus.statusCode).toBe(200);
    expect(ownStatus.json().data.state).toBe("accepted");
  });

  it("submissions listing is empty for B while A sees its own row", async () => {
    const foreign = await get("/api/compliance/submissions", B);
    expect(foreign.statusCode).toBe(200);
    expect(foreign.json().total).toBe(0);
    expect(foreign.json().data).toHaveLength(0);
    expect(foreign.body).not.toContain("FAKE-IRN-A");

    const own = await get("/api/compliance/submissions", A);
    expect(own.json().total).toBe(1);
    expect(own.json().data[0].invoiceId).toBe(aInvoice.id);
  });
});

// ===========================================================================
// Task 14 — staff order queue (INSTALL-SHARED) + public storefront scoping
// ===========================================================================
describe("orders (Task 14 — shared queue by design)", () => {
  let aOrderId: string;

  beforeAll(async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/public/orders",
      payload: {
        storeId: A.id,
        customerName: "Walk-in Order Customer",
        phone: "+913333333333",
        items: [{ medicineId: aMed.medicineId, quantity: 1 }],
      },
    });
    if (res.statusCode !== 201) throw new Error(`seed order failed: ${res.body}`);
    aOrderId = res.json().data.id;
  });

  it("staff queue is deliberately INSTALL-SHARED (documented, not a leak)", async () => {
    // DOCUMENTED DECISION (routes/customerOrders.ts): the order queue is a
    // shared counter task — list/get/transition are NOT tenant-filtered, so
    // every staff user of this single-store install sees and moves every order.
    const asB = await get("/api/orders", B);
    expect(asB.statusCode).toBe(200);
    expect(asB.json().data.map((o: any) => o.id)).toContain(aOrderId);

    const detail = await get(`/api/orders/${aOrderId}`, B);
    expect(detail.statusCode).toBe(200);
  });

  it("public catalog is scoped to storeId — B's store never exposes A's medicines", async () => {
    const forA = await app.inject({
      method: "GET",
      url: `/api/public/medicines?storeId=${encodeURIComponent(A.id)}&q=TENANT-A`,
    });
    expect(forA.statusCode).toBe(200);
    expect(forA.json().data.map((r: any) => r.medicineId)).toContain(aMed.medicineId);

    const forB = await app.inject({
      method: "GET",
      url: `/api/public/medicines?storeId=${encodeURIComponent(B.id)}&q=TENANT-A`,
    });
    expect(forB.statusCode).toBe(200);
    expect(forB.json().data).toHaveLength(0);
    expect(forB.body).not.toContain(aMed.medicineId);
    expect(forB.body).not.toContain("TENANT-A DOLO 650");

    const bOwn = await app.inject({
      method: "GET",
      url: `/api/public/medicines?storeId=${encodeURIComponent(B.id)}&q=TENANT-B`,
    });
    expect(bOwn.json().data.map((r: any) => r.medicineId)).toContain(bMed.medicineId);

    // storeId=A must never return B's medicines either (the mirror case).
    const aLookingForB = await app.inject({
      method: "GET",
      url: `/api/public/medicines?storeId=${encodeURIComponent(A.id)}&q=TENANT-B`,
    });
    expect(aLookingForB.statusCode).toBe(200);
    expect(aLookingForB.json().data).toHaveLength(0);
    expect(aLookingForB.body).not.toContain(bMed.medicineId);

    // Wrong storeId on the public status view is an identical 404.
    const status = await app.inject({
      method: "GET",
      url: `/api/public/orders/${aOrderId}?storeId=${encodeURIComponent(B.id)}`,
    });
    expect(status.statusCode).toBe(404);
    expect(status.body).not.toContain("+913333333333");
  });
});

// ===========================================================================
// Task 15 — devices + sync (smoke; full matrix in devices-sync.test.ts)
// ===========================================================================
describe("devices + sync (Task 15, smoke)", () => {
  it("a cashier sees only its own devices", async () => {
    const cashierA: SeededUser = seedUser();
    const cashierB: SeededUser = seedUser();
    run("UPDATE users SET role = 'cashier' WHERE id = ?", cashierA.id);
    run("UPDATE users SET role = 'cashier' WHERE id = ?", cashierB.id);

    const regA = await post("/api/devices/register", cashierA, {
      deviceName: "A-POS",
      platform: "Windows",
      appVersion: "1.0.0",
    });
    const regB = await post("/api/devices/register", cashierB, {
      deviceName: "B-POS",
      platform: "Windows",
      appVersion: "1.0.0",
    });
    expect(regA.statusCode).toBe(201);
    expect(regB.statusCode).toBe(201);

    const seen = await get("/api/devices", cashierB);
    expect(seen.statusCode).toBe(200);
    const names = (seen.json().data as any[]).map((d) => d.deviceName);
    expect(names).toContain("B-POS");
    expect(names).not.toContain("A-POS");
    expect(seen.body).not.toContain(regA.json().data.deviceToken);
  });

  it("B's sync pull never contains A's operations", async () => {
    const push = await post("/api/sync/push", A, {
      operations: [
        {
          operationId: "tenant-a-op-1",
          entity: "setting",
          action: "update",
          payload: { key: "a_only_key", value: 1 },
        },
      ],
    });
    expect(push.statusCode).toBe(200);
    expect(push.json().data.applied).toBe(1);

    const pullB = await get("/api/sync/pull", B);
    expect(pullB.statusCode).toBe(200);
    const ids = (pullB.json().data.ops as any[]).map((o) => o.operationId);
    expect(ids).not.toContain("tenant-a-op-1");
    expect(pullB.body).not.toContain("a_only_key");

    const pullA = await get("/api/sync/pull", A);
    expect((pullA.json().data.ops as any[]).map((o) => o.operationId)).toContain("tenant-a-op-1");
  });
});

// ===========================================================================
// Task 16 — data migration + bulk bills
// ===========================================================================
describe("data migration (Task 16)", () => {
  let aImportId: string;

  beforeAll(async () => {
    const csv = "name,phone\nA Imported Customer,91111111111\n";
    const res = await post("/api/data-migrations", A, {
      entityType: "customers",
      filename: "a-customers.csv",
      csv,
    });
    if (res.statusCode !== 201) throw new Error(`seed import failed: ${res.body}`);
    aImportId = res.json().data.importId;
  });

  it("B sees an empty session list and 404s on every session verb", async () => {
    const list = await get("/api/data-migrations", B);
    expect(list.statusCode).toBe(200);
    expect(list.json().data).toHaveLength(0);
    expect(list.body).not.toContain("a-customers.csv");

    const ownerList = await get("/api/data-migrations", A);
    expect(ownerList.json().data.length).toBeGreaterThan(0);

    expect((await get(`/api/data-migrations/${aImportId}`, B)).statusCode).toBe(404);
    expect((await post(`/api/data-migrations/${aImportId}/preview`, B)).statusCode).toBe(404);
    expect((await post(`/api/data-migrations/${aImportId}/commit`, B)).statusCode).toBe(404);
    expect((await post(`/api/data-migrations/${aImportId}/rollback`, B)).statusCode).toBe(404);
    expect((await del(`/api/data-migrations/${aImportId}`, B)).statusCode).toBe(404);

    expect(all("SELECT status FROM data_imports WHERE id = ?", aImportId)[0].status).toBe("draft");
    expect(count("SELECT COUNT(*) AS c FROM customers WHERE created_by = ?", B.id)).toBe(1);
  });
});

describe("bulk bills (Task 16)", () => {
  it("B's filters match only B's invoices", async () => {
    const filters = { from: "2000-01-01", to: "2099-12-31" };
    const patch = { notes: "bulk note" };

    const foreign = await post("/api/bulk-bills/preview", B, { filters, patch });
    expect(foreign.statusCode).toBe(200);
    expect(foreign.json().data.total).toBe(0);
    expect(foreign.json().data.invoices).toHaveLength(0);
    expect(foreign.body).not.toContain(aInvoice.invoiceNo);

    const own = await post("/api/bulk-bills/preview", A, { filters, patch });
    expect(own.statusCode).toBe(200);
    expect(own.json().data.total).toBeGreaterThan(0);

    // A confirmed commit from B still cannot touch A's rows.
    const commit = await post("/api/bulk-bills/commit", B, {
      filters,
      patch,
      confirm: "CONFIRM",
    });
    expect(commit.statusCode).toBe(200);
    expect(commit.json().data.updated ?? commit.json().data.total).toBe(0);
    expect(all("SELECT notes FROM invoices WHERE id = ?", aInvoice.id)[0].notes ?? "").not.toBe(
      "bulk note"
    );
  });
});

// ===========================================================================
// Task 17 — scheduled reports + integrations
// ===========================================================================
describe("scheduled reports (Task 17)", () => {
  let aReportId: string;

  beforeAll(async () => {
    const res = await post("/api/scheduled-reports", A, {
      name: "A's daily sales",
      reportType: "sales",
      schedule: { kind: "daily", time: "09:00" },
      recipients: [{ channel: "email", address: "a@example.com" }],
      format: "csv",
      filters: { daysBack: 30 },
    });
    if (res.statusCode !== 201) throw new Error(`seed report failed: ${res.body}`);
    aReportId = res.json().data.id;
  });

  it("B's list is empty and every report id 404s for B", async () => {
    const list = await get("/api/scheduled-reports", B);
    expect(list.statusCode).toBe(200);
    expect(list.json().data).toHaveLength(0);
    expect(list.body).not.toContain("A's daily sales");

    const ownerList = await get("/api/scheduled-reports", A);
    expect(ownerList.json().data.map((r: any) => r.id)).toContain(aReportId);

    expect((await get(`/api/scheduled-reports/${aReportId}`, B)).statusCode).toBe(404);
    expect((await get(`/api/scheduled-reports/${aReportId}/runs`, B)).statusCode).toBe(404);
    expect(
      (await put(`/api/scheduled-reports/${aReportId}`, B, { name: "hijacked" })).statusCode
    ).toBe(404);
    expect((await post(`/api/scheduled-reports/${aReportId}/run`, B)).statusCode).toBe(404);
    expect((await del(`/api/scheduled-reports/${aReportId}`, B)).statusCode).toBe(404);

    expect(all("SELECT name FROM scheduled_reports WHERE id = ?", aReportId)[0].name).toBe(
      "A's daily sales"
    );
  });
});

describe("integrations (Task 17 — per-install registry by design)", () => {
  it("registry is install-wide but secrets are never returned in clear text", async () => {
    // DOCUMENTED (services/integrations.ts header): the settings table has no
    // tenant column — one configuration per install, like expiry policy. The
    // security property that matters is that NO decrypted secret ever leaves
    // the server for any caller.
    const connect = await post("/api/integrations/sms/connect", A, {
      config: { sender: "MEDIBILL" },
      secrets: { webhookUrl: "https://hooks.example/super-secret-token" },
    });
    expect(connect.statusCode).toBe(200);

    const asB = await get("/api/integrations/sms", B);
    expect(asB.statusCode).toBe(200);
    expect(asB.json().data.secrets.webhookUrl).toBe("•••");
    expect(asB.body).not.toContain("super-secret-token");
    expect(asB.body).not.toContain("enc:v1:");

    const own = await get("/api/integrations/sms", A);
    expect(own.json().data.secrets.webhookUrl).toBe("•••");
    expect(own.body).not.toContain("super-secret-token");

    // Unknown provider id → 404 for everyone.
    expect((await get("/api/integrations/not-a-provider", B)).statusCode).toBe(404);

    const list = await get("/api/integrations", B);
    expect(list.statusCode).toBe(200);
    expect(list.json().data.providers.length).toBeGreaterThan(0);

    // Cleanup so the rest of the run sees a pristine registry.
    expect((await post("/api/integrations/sms/disconnect", A)).statusCode).toBe(200);
    expect(count("SELECT COUNT(*) AS c FROM settings WHERE key = 'integration:sms'")).toBe(0);
  });
});
