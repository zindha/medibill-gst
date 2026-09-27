import { beforeAll, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import { applySchema, dbPath, seedUser, type SeededUser } from "./helpers.js";

import purchaseImportRoutes from "../src/routes/purchaseImports.js";
import labelRoutes from "../src/routes/labels.js";
import reportRoutes from "../src/routes/reports.js";

/**
 * Task 18 — performance load tests.
 *
 * Three budgeted scenarios, each measured with Date.now() and logged so the
 * numbers are visible in CI output. Bounds are deliberately lenient (the
 * documented budgets: import < 15s, opening-closing < 5s, statement < 2s,
 * adjustments < 2s, 500-label preview < 2s) so a slow CI machine does not
 * flake; the measured value is printed either way.
 *
 *   1. Purchase import: 5,000-row CSV → create + resolve + commit (5,000
 *      batches inserted), totals correct.
 *   2. Reports at scale: 100,000 inventory transactions (raw better-sqlite3
 *      inserts in 5,000-row batches) → opening-closing / statement /
 *      adjustments stay inside budget.
 *   3. Label preview: 500 labels (2 items × 250) renders in < 2s.
 */

const IMPORT_ROWS = 5_000;
const IMPORT_MEDICINES = 500;
const IMPORT_BUDGET_MS = 15_000;

const TX_ROWS = 100_000;
const TX_BATCH = 5_000;
const TX_MEDICINES = 20;
const OPENING_CLOSING_BUDGET_MS = 5_000;
const STATEMENT_BUDGET_MS = 2_000;
const ADJUSTMENTS_BUDGET_MS = 2_000;

const LABEL_TOTAL = 500;
const LABEL_BUDGET_MS = 2_000;

let app: FastifyInstance;
let importUser: SeededUser;
let scaleUser: SeededUser;
let labelUser: SeededUser;

let loadMedicineIds: string[] = [];
let scaleMedicineIds: string[] = [];
let statementMedicineId = "";

const auth = (u: SeededUser) => ({ authorization: `Bearer ${u.token}` });

function raw() {
  return new Database(dbPath());
}

function all<T = any>(sql: string, ...params: any[]): T[] {
  const db = raw();
  try {
    return db.prepare(sql).all(...params) as T[];
  } finally {
    db.close();
  }
}

function one<T = any>(sql: string, ...params: any[]): T | undefined {
  const db = raw();
  try {
    return db.prepare(sql).get(...params) as T | undefined;
  } finally {
    db.close();
  }
}

async function timedAsync<T>(label: string, budgetMs: number, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  const result = await fn();
  const elapsed = Date.now() - start;
  console.log(`[perf] ${label}: ${elapsed}ms (budget ${budgetMs}ms)`);
  expect(elapsed).toBeLessThan(budgetMs);
  return result;
}

// ---------------------------------------------------------------------------
// Seed helpers (raw SQL in one connection — seeding is not the thing under
// test, so it must not eat the budget)
// ---------------------------------------------------------------------------
function seedLoadMedicines(ownerId: string, count: number): string[] {
  const db = raw();
  const now = Date.now();
  const insertMed = db.prepare(
    `INSERT INTO medicines (id, name, unit, units_per_pack, gst_rate, is_active, created_by, created_at, updated_at)
     VALUES (?, ?, 'Strip', 1, '12', 1, ?, ?, ?)`
  );
  const insertBatch = db.prepare(
    `INSERT INTO batches (id, medicine_id, batch_no, expiry_date, mrp, purchase_price, selling_price,
      quantity, initial_quantity, is_active, created_by, created_at, updated_at)
     VALUES (?, ?, ?, '2027-12-31', 20, 12, 20, 100, 100, 1, ?, ?, ?)`
  );
  const ids: string[] = [];
  const tx = db.transaction(() => {
    for (let i = 1; i <= count; i++) {
      const id = nanoid(16);
      const name = `LOAD MED ${String(i).padStart(4, "0")}`;
      insertMed.run(id, name, ownerId, now, now);
      insertBatch.run(nanoid(16), id, `M${i}`, ownerId, now, now);
      ids.push(id);
    }
  });
  tx();
  db.close();
  return ids;
}

/** 100,000 inventory transactions in 5,000-row batches for one tenant. */
function seedInventoryTransactions(ownerId: string, medicineIds: string[], total: number): void {
  const db = raw();
  const now = Date.now();
  const insert = db.prepare(
    `INSERT INTO inventory_transactions (id, medicine_id, batch_id, type, quantity, balance_after, created_by, created_at)
     VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`
  );
  const start = Date.parse("2026-01-01T00:00:00Z");
  const spanMs = Date.parse("2026-12-31T23:59:59Z") - start;

  db.pragma("synchronous = OFF");
  for (let offset = 0; offset < total; offset += TX_BATCH) {
    const batch = db.transaction(() => {
      for (let i = offset; i < Math.min(offset + TX_BATCH, total); i++) {
        const medicineId = medicineIds[i % medicineIds.length];
        // ~4% adjustments/damage/expired so the adjustments report still has
        // a meaningful result set without serialising 100k rows.
        const type = i % 25 === 0 ? "adjustment" : i % 2 === 0 ? "purchase" : "sales";
        const quantity = type === "sales" ? -1 : 1;
        const createdAt = Math.floor((start + ((i % 365) / 365) * spanMs) / 1000);
        insert.run(nanoid(16), medicineId, type, quantity, 100, ownerId, createdAt);
      }
    });
    batch();
  }
  db.pragma("synchronous = NORMAL");
  db.close();
}

beforeAll(async () => {
  applySchema();
  app = Fastify({ logger: false });
  await app.register(cookie);
  await app.register(purchaseImportRoutes, { prefix: "/api/purchase-imports" });
  await app.register(labelRoutes, { prefix: "/api/labels" });
  await app.register(reportRoutes, { prefix: "/api/reports" });

  importUser = seedUser();
  scaleUser = seedUser();
  labelUser = seedUser();
});

// ===========================================================================
// 1. Purchase import — 5,000 rows
// ===========================================================================
describe("purchase import load (5,000 rows)", () => {
  beforeAll(() => {
    loadMedicineIds = seedLoadMedicines(importUser.id, IMPORT_MEDICINES);
  });

  it(
    "creates, resolves and commits all 5,000 mapped rows inside the 15s budget",
    async () => {
      // CSV: 5,000 rows cycling the 500 seeded medicines (header aliases on
      // purpose so the auto-mapper is exercised too).
      const header = "product,batch,expiry,qty,rate,mrp,gst";
      const lines: string[] = [header];
      for (let i = 0; i < IMPORT_ROWS; i++) {
        const name = `LOAD MED ${String((i % IMPORT_MEDICINES) + 1).padStart(4, "0")}`;
        lines.push(`${name},L${i},12/27,10,12,20,12`);
      }
      const csv = lines.join("\n");

      const start = Date.now();

      // (a) create
      const created = await app.inject({
        method: "POST",
        url: "/api/purchase-imports",
        headers: auth(importUser),
        payload: { filename: "load-test.csv", csv },
      });
      expect(created.statusCode).toBe(201);
      const session = created.json().data;
      expect(session.rows).toHaveLength(IMPORT_ROWS);
      expect(session.errors).toBe(0);
      for (const row of session.rows.slice(0, 25)) {
        expect(row.status).toBe("mapped");
        expect(row.medicineId).toBeTruthy();
      }

      // (b) resolve (GET re-computes and returns every stored row)
      const resolved = await app.inject({
        method: "GET",
        url: `/api/purchase-imports/${session.importId}`,
        headers: auth(importUser),
      });
      expect(resolved.statusCode).toBe(200);
      const rows = resolved.json().data.rows as any[];
      expect(rows).toHaveLength(IMPORT_ROWS);

      // (c) commit — every row mapped, one unique batch each (5,000 inserts)
      const commitRows = rows.map((r) => ({
        rowIndex: r.rowIndex,
        medicineId: r.medicineId,
        batchNo: r.normalized.batch ?? `L${r.rowIndex}`,
        expiryDate: r.normalized.expiryDate ?? "2027-12-31",
        quantity: r.normalized.quantity ?? 10,
        freeQuantity: r.normalized.freeQuantity ?? 0,
        mrp: r.normalized.mrp ?? 20,
        purchasePrice: r.normalized.purchaseRate ?? 12,
        gstRate: r.normalized.gstRate ?? "12",
      }));
      const committed = await app.inject({
        method: "POST",
        url: `/api/purchase-imports/${session.importId}/commit`,
        headers: auth(importUser),
        payload: {
          billNo: "LOAD-BILL-1",
          billDate: "2026-09-20",
          rows: commitRows,
        },
      });
      expect(committed.statusCode).toBe(201);

      const elapsed = Date.now() - start;
      console.log(
        `[perf] purchase import 5,000 rows (create+resolve+commit): ${elapsed}ms (budget ${IMPORT_BUDGET_MS}ms)`
      );
      expect(elapsed).toBeLessThan(IMPORT_BUDGET_MS);

      // Totals: 5,000 rows × (10 × ₹12) = ₹600,000 subtotal, GST on top.
      const bill = one<{ subtotal: number; total_gst: number; grand_total: number }>(
        "SELECT subtotal, total_gst, grand_total FROM purchase_bills WHERE bill_no = 'LOAD-BILL-1'"
      );
      expect(bill).toBeTruthy();
      expect(bill!.subtotal).toBeCloseTo(IMPORT_ROWS * 10 * 12, 2);
      expect(bill!.total_gst).toBeGreaterThan(0);
      expect(bill!.grand_total).toBeCloseTo(bill!.subtotal + bill!.total_gst, 2);

      // Counts: one bill item and one batch per row, over the 500 masters.
      const items = one<{ c: number }>(
        `SELECT COUNT(*) AS c FROM purchase_bill_items pbi
         JOIN purchase_bills pb ON pb.id = pbi.purchase_bill_id
         WHERE pb.bill_no = 'LOAD-BILL-1'`
      );
      expect(items!.c).toBe(IMPORT_ROWS);

      const batches = one<{ c: number }>(
        "SELECT COUNT(*) AS c FROM batches WHERE created_by = ? AND batch_no LIKE 'L%'",
        importUser.id
      );
      expect(batches!.c).toBe(IMPORT_ROWS);

      const masters = one<{ c: number }>(
        "SELECT COUNT(*) AS c FROM medicines WHERE created_by = ?",
        importUser.id
      );
      expect(masters!.c).toBe(IMPORT_MEDICINES);

      expect(loadMedicineIds).toHaveLength(IMPORT_MEDICINES);
    },
    60_000
  );
});

// ===========================================================================
// 2. Reports at scale — 100,000 inventory transactions
// ===========================================================================
describe("reports at scale (100,000 inventory transactions)", () => {
  beforeAll(() => {
    scaleMedicineIds = seedLoadMedicines(scaleUser.id, TX_MEDICINES);
    statementMedicineId = scaleMedicineIds[0];
    const seedStart = Date.now();
    seedInventoryTransactions(scaleUser.id, scaleMedicineIds, TX_ROWS);
    const seeded = one<{ c: number }>(
      "SELECT COUNT(*) AS c FROM inventory_transactions WHERE created_by = ?",
      scaleUser.id
    );
    console.log(
      `[perf] seeded ${seeded!.c} inventory transactions for one tenant in ${Date.now() - seedStart}ms`
    );
    expect(seeded!.c).toBe(TX_ROWS);
  }, 120_000);

  const get = (url: string) =>
    app.inject({ method: "GET", url, headers: auth(scaleUser) });

  it(
    "opening-closing over 100k transactions stays under 5s",
    async () => {
      const res = await timedAsync(
        "GET /reports/stock/opening-closing (100k tx)",
        OPENING_CLOSING_BUDGET_MS,
        () => get("/api/reports/stock/opening-closing?from=2026-01-01&to=2026-12-31")
      );
      expect(res.statusCode).toBe(200);
      const rows = res.json().data.rows as any[];
      expect(rows.length).toBeGreaterThanOrEqual(TX_MEDICINES);
      const first = rows.find((r) => r.medicineId === statementMedicineId);
      expect(first).toBeTruthy();
      expect(typeof first.opening).toBe("number");
      expect(typeof first.closing).toBe("number");
    },
    30_000
  );

  it(
    "stock statement stays under 2s",
    async () => {
      const res = await timedAsync(
        "GET /reports/stock/statement",
        STATEMENT_BUDGET_MS,
        () =>
          get(
            `/api/reports/stock/statement?medicineId=${statementMedicineId}&from=2026-01-01&to=2026-12-31`
          )
      );
      expect(res.statusCode).toBe(200);
      const entries = (res.json().data.entries ?? res.json().data.rows) as any[];
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries.slice(0, 20)) {
        expect(typeof entry.runningBalance).toBe("number");
      }
    },
    30_000
  );

  it(
    "stock adjustments stays under 2s",
    async () => {
      const res = await timedAsync(
        "GET /reports/stock/adjustments",
        ADJUSTMENTS_BUDGET_MS,
        () => get("/api/reports/stock/adjustments?from=2026-01-01&to=2026-12-31")
      );
      expect(res.statusCode).toBe(200);
      const rows = (res.json().data.rows ?? res.json().data.entries) as any[];
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows.slice(0, 50)) {
        expect(["adjustment", "damage", "expired"]).toContain(row.type);
      }
    },
    30_000
  );

  it(
    "sales register responds inside the same envelope at scale",
    async () => {
      const res = await timedAsync("GET /reports/sales/register", OPENING_CLOSING_BUDGET_MS, () =>
        get("/api/reports/sales/register?from=2026-01-01&to=2026-12-31")
      );
      expect(res.statusCode).toBe(200);
    },
    30_000
  );
});

// ===========================================================================
// 3. Label preview — 500 labels
// ===========================================================================
describe("label preview load (500 labels)", () => {
  it(
    "renders 500 labels (2 items × 250) inside the 2s budget",
    async () => {
      const ids = seedLoadMedicines(labelUser.id, 2);

      const res = await timedAsync("POST /labels/preview (500 labels)", LABEL_BUDGET_MS, () =>
        app.inject({
          method: "POST",
          url: "/api/labels/preview",
          headers: auth(labelUser),
          payload: {
            items: [
              { medicineId: ids[0], quantity: 250, template: "40x25mm" },
              { medicineId: ids[1], quantity: 250, template: "40x25mm" },
            ],
          },
        })
      );
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.totalLabels).toBe(LABEL_TOTAL);
      expect(data.labels).toHaveLength(LABEL_TOTAL);
    },
    30_000
  );
});
