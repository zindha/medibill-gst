import { beforeAll, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import {
  applySchema,
  dbPath,
  getBatchQuantity,
  seedMedicine,
  seedUser,
  type SeededUser,
} from "./helpers.js";
import stockAuditRoutes from "../src/routes/stockAudits.js";

let app: FastifyInstance;
let ctx: SeededUser;

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

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

function raw() {
  return new Database(dbPath());
}

function setBatchQuantity(batchId: string, quantity: number): void {
  const db = raw();
  db.prepare("UPDATE batches SET quantity = ? WHERE id = ?").run(quantity, batchId);
  db.close();
}

function setBatchPurchasePrice(batchId: string, price: number): void {
  const db = raw();
  db.prepare("UPDATE batches SET purchase_price = ? WHERE id = ?").run(price, batchId);
  db.close();
}

function txForBatch(batchId: string): any[] {
  const db = raw();
  const rows = db
    .prepare("SELECT * FROM inventory_transactions WHERE batch_id = ?")
    .all(batchId);
  db.close();
  return rows;
}

function auditRowsFor(auditId: string): any[] {
  const db = raw();
  const rows = db
    .prepare("SELECT * FROM stock_audit_counts WHERE audit_id = ?")
    .all(auditId);
  db.close();
  return rows;
}

function auditRow(auditId: string): any {
  const db = raw();
  const row = db.prepare("SELECT * FROM stock_audits WHERE id = ?").get(auditId);
  db.close();
  return row;
}

const createAudit = (token: string, body: Record<string, unknown> = {}) =>
  app.inject({
    method: "POST",
    url: "/api/stock-audits",
    headers: auth(token),
    payload: body as any,
  });

const postCount = (
  token: string,
  auditId: string,
  body: Record<string, unknown>
) =>
  app.inject({
    method: "POST",
    url: `/api/stock-audits/${auditId}/counts`,
    headers: auth(token),
    payload: body as any,
  });

const getAudit = (token: string, auditId: string) =>
  app.inject({ method: "GET", url: `/api/stock-audits/${auditId}`, headers: auth(token) });

const approve = (token: string, auditId: string, body: Record<string, unknown>) =>
  app.inject({
    method: "POST",
    url: `/api/stock-audits/${auditId}/approve`,
    headers: auth(token),
    payload: body as any,
  });

const cancel = (token: string, auditId: string, body: Record<string, unknown> = {}) =>
  app.inject({
    method: "POST",
    url: `/api/stock-audits/${auditId}/cancel`,
    headers: auth(token),
    payload: body as any,
  });

const listAudits = (token: string, query = "") =>
  app.inject({ method: "GET", url: `/api/stock-audits${query}`, headers: auth(token) });

beforeAll(async () => {
  applySchema();
  ctx = seedUser();
  app = Fastify({ logger: false });
  await app.register(stockAuditRoutes, { prefix: "/api/stock-audits" });
});

describe("stock audit sessions", () => {
  it("creates an open session with note and startedAt", async () => {
    const res = await createAudit(ctx.token, { note: "Monthly physical count" });
    expect(res.statusCode).toBe(201);
    const audit = res.json().data;
    expect(audit.status).toBe("open");
    expect(audit.note).toBe("Monthly physical count");
    expect(audit.startedAt).toBeTruthy();
    expect(audit.approvedAt).toBeNull();
    expect(audit.approvedBy).toBeNull();
  });

  it("lists sessions tenant-scoped — another user sees none of them", async () => {
    const mine = await createAudit(ctx.token, { note: "A's audit" });
    expect(mine.statusCode).toBe(201);

    const other = seedUser();
    const theirs = await listAudits(other.token);
    expect(theirs.statusCode).toBe(200);
    expect(theirs.json().total).toBe(0);
    expect(theirs.json().data).toEqual([]);

    const ours = await listAudits(ctx.token);
    expect(ours.json().total).toBeGreaterThan(0);
    const ids = (ours.json().data as any[]).map((a) => a.id);
    expect(ids).toContain(mine.json().data.id);
  });

  it("filters the list by status", async () => {
    const open = await createAudit(ctx.token, {});
    const openRes = await listAudits(ctx.token, "?status=open");
    expect((openRes.json().data as any[]).map((a) => a.id)).toContain(open.json().data.id);

    const approvedRes = await listAudits(ctx.token, "?status=approved");
    expect((approvedRes.json().data as any[]).some((a) => a.id === open.json().data.id)).toBe(false);
  });

  it("returns a per-audit counts summary on list rows", async () => {
    const audit = (await createAudit(ctx.token, {})).json().data;
    const med = seedMedicine(ctx.id, { name: "SUMMED", quantity: 10 });
    await postCount(ctx.token, audit.id, {
      medicineId: med.medicineId,
      batchId: med.batchId,
      countedQuantity: 8,
    });

    const res = await listAudits(ctx.token, "?status=open");
    const row = (res.json().data as any[]).find((a) => a.id === audit.id);
    expect(row.summary).toBeTruthy();
    expect(row.summary.counted).toBe(1);
    expect(row.summary.totalRows).toBeGreaterThanOrEqual(1);
    expect(row.summary.varianceRows).toBe(1);
    expect(typeof row.summary.totalVarianceValue).toBe("number");
  });

  it("404s a foreign audit id", async () => {
    const other = seedUser();
    const theirAudit = (await createAudit(other.token, {})).json().data;
    const res = await getAudit(ctx.token, theirAudit.id);
    expect(res.statusCode).toBe(404);
  });
});

describe("counting", () => {
  it("freezes expected at the current quantity on first count", async () => {
    const audit = (await createAudit(ctx.token, {})).json().data;
    const med = seedMedicine(ctx.id, { name: "FREEZE", quantity: 10 });

    const res = await postCount(ctx.token, audit.id, {
      medicineId: med.medicineId,
      batchId: med.batchId,
      countedQuantity: 8,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.created).toBe(true);
    expect(res.json().data.expectedQuantity).toBe(10);
    expect(res.json().data.countedQuantity).toBe(8);

    setBatchQuantity(med.batchId, 7);
    const detail = await getAudit(ctx.token, audit.id);
    const row = (detail.json().data.rows as any[])[0];
    expect(row.expectedQuantity).toBe(10);
    expect(row.currentBatchQuantity).toBe(7);
  });

  it("updates the same row on a repeat count (UNIQUE audit+batch respected)", async () => {
    const audit = (await createAudit(ctx.token, {})).json().data;
    const med = seedMedicine(ctx.id, { name: "RECOUNT", quantity: 10 });

    await postCount(ctx.token, audit.id, {
      medicineId: med.medicineId,
      batchId: med.batchId,
      countedQuantity: 9,
    });
    const second = await postCount(ctx.token, audit.id, {
      medicineId: med.medicineId,
      batchId: med.batchId,
      countedQuantity: 6,
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().data.created).toBe(false);
    expect(second.json().data.countedQuantity).toBe(6);
    expect(second.json().data.recount).toBe(6);
    expect(second.json().data.expectedQuantity).toBe(10);

    const rows = auditRowsFor(audit.id);
    expect(rows.length).toBe(1);
    expect(rows[0].counted_quantity).toBe(6);
    expect(rows[0].expected_quantity).toBe(10);
  });

  it("computes variance against the frozen expected and returns live quantity", async () => {
    const audit = (await createAudit(ctx.token, {})).json().data;
    const med = seedMedicine(ctx.id, { name: "VARIANCE", quantity: 10 });
    setBatchPurchasePrice(med.batchId, 40);

    await postCount(ctx.token, audit.id, {
      medicineId: med.medicineId,
      batchId: med.batchId,
      countedQuantity: 8,
    });

    const detail = await getAudit(ctx.token, audit.id);
    expect(detail.statusCode).toBe(200);
    const body = detail.json().data;
    expect(body.audit.id).toBe(audit.id);
    expect(body.rows.length).toBe(1);
    expect(body.rows[0].variance).toBe(-2);
    expect(body.rows[0].currentBatchQuantity).toBe(10);
    expect(body.rows[0].medicineName).toBe("VARIANCE");
    expect(body.rows[0].batchNo).toBe("B1");
    expect(body.rows[0].expiryDate).toBe("2099-12-31");
    expect(body.summary.varianceRows).toBe(1);
    expect(body.summary.totalVarianceValue).toBe(-80);

    setBatchQuantity(med.batchId, 5);
    const after = await getAudit(ctx.token, audit.id);
    expect(after.json().data.rows[0].variance).toBe(-2);
    expect(after.json().data.rows[0].currentBatchQuantity).toBe(5);
  });

  it("lists batches created after the audit as uncounted (not part of variance)", async () => {
    const audit = (await createAudit(ctx.token, {})).json().data;
    const counted = seedMedicine(ctx.id, { name: "COUNTED-NEW", quantity: 4 });
    const later = seedMedicine(ctx.id, { name: "LATER-NEW", quantity: 6 });

    await postCount(ctx.token, audit.id, {
      medicineId: counted.medicineId,
      batchId: counted.batchId,
      countedQuantity: 4,
    });

    const detail = await getAudit(ctx.token, audit.id);
    const body = detail.json().data;
    expect(body.rows.length).toBe(1);
    const uncountedIds = (body.uncounted as any[]).map((u) => u.id);
    expect(uncountedIds).toContain(later.batchId);
    expect(uncountedIds).not.toContain(counted.batchId);
    expect(body.summary.counted).toBe(1);
  });

  it("rejects a count on a foreign batch with 400", async () => {
    const audit = (await createAudit(ctx.token, {})).json().data;
    const other = seedUser();
    const foreign = seedMedicine(other.id, { name: "FOREIGN", quantity: 5 });

    const res = await postCount(ctx.token, audit.id, {
      medicineId: foreign.medicineId,
      batchId: foreign.batchId,
      countedQuantity: 1,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/Batch not found/i);
    expect(auditRowsFor(audit.id).length).toBe(0);
  });

  it("rejects a medicineId that does not match the batch with 400", async () => {
    const audit = (await createAudit(ctx.token, {})).json().data;
    const medA = seedMedicine(ctx.id, { name: "MISMATCH-A", quantity: 5 });
    const medB = seedMedicine(ctx.id, { name: "MISMATCH-B", quantity: 5 });

    const res = await postCount(ctx.token, audit.id, {
      medicineId: medB.medicineId,
      batchId: medA.batchId,
      countedQuantity: 3,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/medicineId/i);
    expect(auditRowsFor(audit.id).length).toBe(0);
  });

  it("updates an existing count through PUT /counts/:countId", async () => {
    const audit = (await createAudit(ctx.token, {})).json().data;
    const med = seedMedicine(ctx.id, { name: "PUT-COUNT", quantity: 10 });
    const created = await postCount(ctx.token, audit.id, {
      medicineId: med.medicineId,
      batchId: med.batchId,
      countedQuantity: 7,
    });
    const countId = created.json().data.id;

    const res = await app.inject({
      method: "PUT",
      url: `/api/stock-audits/counts/${countId}`,
      headers: auth(ctx.token),
      payload: { countedQuantity: 12 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.countedQuantity).toBe(12);
    expect(res.json().data.recount).toBe(12);

    const detail = await getAudit(ctx.token, audit.id);
    expect(detail.json().data.rows[0].variance).toBe(2);
  });

  it("rejects a negative counted quantity with 400", async () => {
    const audit = (await createAudit(ctx.token, {})).json().data;
    const med = seedMedicine(ctx.id, { name: "NEGATIVE", quantity: 5 });
    const res = await postCount(ctx.token, audit.id, {
      medicineId: med.medicineId,
      batchId: med.batchId,
      countedQuantity: -1,
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("approval", () => {
  it("applies non-zero deltas as adjustment transactions and freezes the audit", async () => {
    const audit = (await createAudit(ctx.token, {})).json().data;
    const medA = seedMedicine(ctx.id, { name: "APPROVE-A", quantity: 10 });
    const medB = seedMedicine(ctx.id, { name: "APPROVE-B", quantity: 5 });

    await postCount(ctx.token, audit.id, {
      medicineId: medA.medicineId,
      batchId: medA.batchId,
      countedQuantity: 8,
    });
    await postCount(ctx.token, audit.id, {
      medicineId: medB.medicineId,
      batchId: medB.batchId,
      countedQuantity: 5,
    });

    const res = await approve(ctx.token, audit.id, { reason: "September stock take" });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.adjustments.length).toBe(1);
    expect(res.json().data.audit.status).toBe("approved");

    expect(getBatchQuantity(medA.batchId)).toBe(8);
    expect(getBatchQuantity(medB.batchId)).toBe(5);

    const txs = txForBatch(medA.batchId);
    expect(txs.length).toBe(1);
    expect(txs[0].type).toBe("adjustment");
    expect(txs[0].quantity).toBe(-2);
    expect(txs[0].balance_after).toBe(8);
    expect(txs[0].reason).toContain(audit.id);
    expect(txs[0].created_by).toBe(ctx.id);

    expect(txForBatch(medB.batchId).length).toBe(0);

    const stored = auditRow(audit.id);
    expect(stored.status).toBe("approved");
    expect(stored.approved_by).toBe(ctx.id);
    expect(stored.approved_at).toBeTruthy();
  });

  it("records a stock_audit.approve audit event", async () => {
    const audit = (await createAudit(ctx.token, {})).json().data;
    const med = seedMedicine(ctx.id, { name: "AUDIT-EV", quantity: 3 });
    await postCount(ctx.token, audit.id, {
      medicineId: med.medicineId,
      batchId: med.batchId,
      countedQuantity: 2,
    });
    await approve(ctx.token, audit.id, { reason: "checked" });

    const db = raw();
    const ev = db
      .prepare(
        "SELECT * FROM audit_events WHERE action = 'stock_audit.approve' AND entity_id = ?"
      )
      .get(audit.id) as any;
    db.close();
    expect(ev).toBeTruthy();
    expect(ev.actor_id).toBe(ctx.id);
    const meta = JSON.parse(ev.metadata);
    expect(meta.auditId).toBe(audit.id);
    expect(meta.adjustments).toBe(1);
    expect(Array.isArray(meta.deltas)).toBe(true);
  });

  it("rejects a second approval with 409", async () => {
    const audit = (await createAudit(ctx.token, {})).json().data;
    const med = seedMedicine(ctx.id, { name: "TWICE", quantity: 4 });
    await postCount(ctx.token, audit.id, {
      medicineId: med.medicineId,
      batchId: med.batchId,
      countedQuantity: 3,
    });
    await approve(ctx.token, audit.id, { reason: "first" });
    const second = await approve(ctx.token, audit.id, { reason: "second" });
    expect(second.statusCode).toBe(409);
  });

  it("rejects counts after approval with 409", async () => {
    const audit = (await createAudit(ctx.token, {})).json().data;
    const med = seedMedicine(ctx.id, { name: "IMMUTABLE", quantity: 4 });
    await postCount(ctx.token, audit.id, {
      medicineId: med.medicineId,
      batchId: med.batchId,
      countedQuantity: 2,
    });
    await approve(ctx.token, audit.id, { reason: "done" });

    const res = await postCount(ctx.token, audit.id, {
      medicineId: med.medicineId,
      batchId: med.batchId,
      countedQuantity: 4,
    });
    expect(res.statusCode).toBe(409);
    expect(auditRowsFor(audit.id)[0].counted_quantity).toBe(2);

    const countId = auditRowsFor(audit.id)[0].id;
    const put = await app.inject({
      method: "PUT",
      url: `/api/stock-audits/counts/${countId}`,
      headers: auth(ctx.token),
      payload: { countedQuantity: 99 },
    });
    expect(put.statusCode).toBe(409);
  });

  it("requires a reason", async () => {
    const audit = (await createAudit(ctx.token, {})).json().data;
    const res = await approve(ctx.token, audit.id, {});
    expect(res.statusCode).toBe(400);
  });

  it("blocks approval for cashiers with 403", async () => {
    const cashier = seedUserWithRole("cashier");
    const audit = (await createAudit(cashier.token, {})).json().data;
    const med = seedMedicine(cashier.id, { name: "CASHIER-MED", quantity: 5 });
    await postCount(cashier.token, audit.id, {
      medicineId: med.medicineId,
      batchId: med.batchId,
      countedQuantity: 4,
    });

    const res = await approve(cashier.token, audit.id, { reason: "let me" });
    expect(res.statusCode).toBe(403);

    const stored = auditRow(audit.id);
    expect(stored.status).toBe("open");
    expect(getBatchQuantity(med.batchId)).toBe(5);
    expect(txForBatch(med.batchId).length).toBe(0);
  });

  it("leaves uncounted batches untouched by approval (partial count)", async () => {
    const audit = (await createAudit(ctx.token, {})).json().data;
    const counted = seedMedicine(ctx.id, { name: "PARTIAL-A", quantity: 10 });
    const uncounted = seedMedicine(ctx.id, { name: "PARTIAL-B", quantity: 20 });

    await postCount(ctx.token, audit.id, {
      medicineId: counted.medicineId,
      batchId: counted.batchId,
      countedQuantity: 7,
    });

    const res = await approve(ctx.token, audit.id, { reason: "partial" });
    expect(res.statusCode).toBe(200);

    expect(getBatchQuantity(counted.batchId)).toBe(7);
    expect(txForBatch(counted.batchId).length).toBe(1);

    expect(getBatchQuantity(uncounted.batchId)).toBe(20);
    expect(txForBatch(uncounted.batchId).length).toBe(0);
  });

  it("allows a pharmacist to approve", async () => {
    const pharmacist = seedUserWithRole("pharmacist");
    const audit = (await createAudit(pharmacist.token, {})).json().data;
    const med = seedMedicine(pharmacist.id, { name: "PHARM-MED", quantity: 6 });
    await postCount(pharmacist.token, audit.id, {
      medicineId: med.medicineId,
      batchId: med.batchId,
      countedQuantity: 5,
    });

    const res = await approve(pharmacist.token, audit.id, { reason: "reviewed" });
    expect(res.statusCode).toBe(200);
    expect(auditRow(audit.id).status).toBe("approved");
    expect(auditRow(audit.id).approved_by).toBe(pharmacist.id);
  });
});

describe("cancellation", () => {
  it("cancels an open audit as admin and keeps the count rows", async () => {
    const audit = (await createAudit(ctx.token, {})).json().data;
    const med = seedMedicine(ctx.id, { name: "CANCEL-MED", quantity: 8 });
    await postCount(ctx.token, audit.id, {
      medicineId: med.medicineId,
      batchId: med.batchId,
      countedQuantity: 6,
    });

    const res = await cancel(ctx.token, audit.id, { reason: "wrong day" });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("cancelled");
    expect(auditRow(audit.id).status).toBe("cancelled");
    expect(auditRowsFor(audit.id).length).toBe(1);
    expect(getBatchQuantity(med.batchId)).toBe(8);
    expect(txForBatch(med.batchId).length).toBe(0);
  });

  it("rejects counts on a cancelled audit with 409", async () => {
    const audit = (await createAudit(ctx.token, {})).json().data;
    const med = seedMedicine(ctx.id, { name: "CANCEL-COUNT", quantity: 3 });
    await cancel(ctx.token, audit.id);

    const res = await postCount(ctx.token, audit.id, {
      medicineId: med.medicineId,
      batchId: med.batchId,
      countedQuantity: 1,
    });
    expect(res.statusCode).toBe(409);
  });

  it("cannot cancel an already cancelled audit", async () => {
    const audit = (await createAudit(ctx.token, {})).json().data;
    await cancel(ctx.token, audit.id);
    const second = await cancel(ctx.token, audit.id);
    expect(second.statusCode).toBe(409);
  });

  it("blocks cancellation for cashiers with 403", async () => {
    const cashier = seedUserWithRole("cashier");
    const audit = (await createAudit(cashier.token, {})).json().data;
    const res = await cancel(cashier.token, audit.id);
    expect(res.statusCode).toBe(403);
    expect(auditRow(audit.id).status).toBe("open");
  });
});
