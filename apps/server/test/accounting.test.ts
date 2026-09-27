import { beforeAll, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import {
  applySchema,
  dbPath,
  seedCustomer,
  seedMedicine,
  seedUser,
  type SeededUser,
  type SeededMedicine,
} from "./helpers.js";
import invoiceRoutes from "../src/routes/invoices.js";
import purchaseRoutes from "../src/routes/purchases.js";
import paymentRoutes from "../src/routes/payments.js";
import returnsRoutes from "../src/routes/returns.js";
import accountingRoutes from "../src/routes/accounting.js";
import {
  SYSTEM_ACCOUNTS,
  ensureChart,
  post,
  trialBalance,
  profitLoss,
  balanceSheet,
  dayBook,
} from "../src/services/accounting.js";

let app: FastifyInstance;

const INV_DATE = "2026-06-15";

// ---------------------------------------------------------------------------
// Raw SQL helpers (read assertions straight from the ledger tables)
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

function sourceEntries(userId: string, sourceType: string, sourceId?: string) {
  if (sourceId !== undefined) {
    return all(
      "SELECT * FROM journal_entries WHERE created_by = ? AND source_type = ? AND source_id = ?",
      userId,
      sourceType,
      sourceId
    );
  }
  return all("SELECT * FROM journal_entries WHERE created_by = ? AND source_type = ?", userId, sourceType);
}

function entryLines(entryId: string) {
  return all<{
    code: string;
    type: string;
    debit: number;
    credit: number;
    party_type: string | null;
    party_id: string | null;
    memo: string | null;
  }>(
    `SELECT a.code, a.type, jl.debit, jl.credit, jl.party_type, jl.party_id, jl.memo
     FROM journal_lines jl JOIN accounts a ON a.id = jl.account_id
     WHERE jl.entry_id = ? ORDER BY a.code`,
    entryId
  );
}

function lineFor(entryId: string, code: string) {
  return entryLines(entryId).find((line) => line.code === code);
}

function auditCount(actorId: string, action: string): number {
  const rows = all<{ c: number }>(
    "SELECT COUNT(*) AS c FROM audit_events WHERE actor_id = ? AND action = ?",
    actorId,
    action
  );
  return rows[0]?.c ?? 0;
}

function seedSupplier(ownerId: string, name = "Acme Drugs"): string {
  const id = `sup-${Math.random().toString(36).slice(2, 12)}`;
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

// ---------------------------------------------------------------------------
// Payload helpers
// ---------------------------------------------------------------------------
const PAYLOAD_ITEM = (med: SeededMedicine) => ({
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
    items: [PAYLOAD_ITEM(med)],
    ...over,
  };
}

async function postInvoice(med: SeededMedicine, ctx: SeededUser, over: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: "/api/invoices",
    headers: { authorization: `Bearer ${ctx.token}` },
    payload: invoiceBody(med, over),
  });
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

beforeAll(async () => {
  applySchema();
  app = Fastify({ logger: false });
  await app.register(invoiceRoutes, { prefix: "/api/invoices" });
  await app.register(purchaseRoutes, { prefix: "/api/purchases" });
  await app.register(paymentRoutes, { prefix: "/api/payments" });
  await app.register(returnsRoutes, { prefix: "/api/returns" });
  await app.register(accountingRoutes, { prefix: "/api/accounting" });
});

// ---------------------------------------------------------------------------
// Chart of accounts
// ---------------------------------------------------------------------------
describe("chart of accounts", () => {
  it("ensureChart seeds all 14 system accounts", async () => {
    const ctx = seedUser();
    const rows = await ensureChart(ctx.id);
    expect(rows).toHaveLength(SYSTEM_ACCOUNTS.length);
    const codes = rows.map((row) => row.code);
    for (const account of SYSTEM_ACCOUNTS) expect(codes).toContain(account.code);
    expect(rows.every((row) => row.isSystem)).toBe(true);
  });

  it("ensureChart is idempotent (no duplicate rows on repeat calls)", async () => {
    const ctx = seedUser();
    await ensureChart(ctx.id);
    await ensureChart(ctx.id);
    const rows = all<{ c: number }>("SELECT COUNT(*) AS c FROM accounts WHERE created_by = ?", ctx.id);
    expect(rows[0].c).toBe(SYSTEM_ACCOUNTS.length);
  });

  it("GET /accounts returns the tenant's chart", async () => {
    const ctx = seedUser();
    const res = await app.inject({ method: "GET", url: "/api/accounting/accounts", headers: auth(ctx.token) });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(SYSTEM_ACCOUNTS.length);
    expect(body.data.map((row: any) => row.code)).toContain("CASH");
  });

  it("POST /accounts creates a manual (non-system) account", async () => {
    const ctx = seedUser();
    const res = await app.inject({
      method: "POST",
      url: "/api/accounting/accounts",
      headers: auth(ctx.token),
      payload: { code: "petty", name: "Petty Cash", type: "asset" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.code).toBe("PETTY"); // normalized to upper case
    expect(res.json().data.isSystem).toBe(false);
  });

  it("POST /accounts rejects a duplicate manual code with 409", async () => {
    const ctx = seedUser();
    const payload = { code: "RENT", name: "Rent Expense", type: "expense" };
    const first = await app.inject({
      method: "POST",
      url: "/api/accounting/accounts",
      headers: auth(ctx.token),
      payload,
    });
    expect(first.statusCode).toBe(201);
    const second = await app.inject({
      method: "POST",
      url: "/api/accounting/accounts",
      headers: auth(ctx.token),
      payload,
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toContain("already exists");
  });

  it("POST /accounts rejects a duplicate SYSTEM code with 409", async () => {
    const ctx = seedUser();
    const res = await app.inject({
      method: "POST",
      url: "/api/accounting/accounts",
      headers: auth(ctx.token),
      payload: { code: "CASH", name: "My Cash", type: "asset" },
    });
    expect(res.statusCode).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// Manual posting + validation
// ---------------------------------------------------------------------------
describe("journal posting", () => {
  const balancedLines = [
    { code: "CASH", debit: 500 },
    { code: "CAPITAL", credit: 500 },
  ];

  it("POST /post accepts a balanced entry and returns its lines", async () => {
    const ctx = seedUser();
    const res = await app.inject({
      method: "POST",
      url: "/api/accounting/post",
      headers: auth(ctx.token),
      payload: { date: "2026-01-05", description: "Owner capital", lines: balancedLines },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.alreadyPosted).toBe(false);
    expect(body.data.entry.lines).toHaveLength(2);

    const entries = sourceEntries(ctx.id, "manual");
    expect(entries).toHaveLength(1);
    const lines = entryLines(entries[0].id);
    expect(lines.find((l) => l.code === "CASH")!.debit).toBeCloseTo(500, 2);
    expect(lines.find((l) => l.code === "CAPITAL")!.credit).toBeCloseTo(500, 2);
  });

  it("rejects an unbalanced entry with 'not balanced'", async () => {
    const ctx = seedUser();
    const res = await app.inject({
      method: "POST",
      url: "/api/accounting/post",
      headers: auth(ctx.token),
      payload: {
        date: "2026-01-05",
        lines: [
          { code: "CASH", debit: 500 },
          { code: "CAPITAL", credit: 400 },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("not balanced");
  });

  it("rejects a line whose debit and credit are both zero", async () => {
    const ctx = seedUser();
    const res = await app.inject({
      method: "POST",
      url: "/api/accounting/post",
      headers: auth(ctx.token),
      payload: {
        date: "2026-01-05",
        lines: [
          { code: "CASH", debit: 100, credit: 100 },
          { code: "CAPITAL", debit: 0, credit: 0 },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/debit or a credit|both a debit and a credit/);
  });

  it("rejects a line with values on both sides", async () => {
    const ctx = seedUser();
    const res = await app.inject({
      method: "POST",
      url: "/api/accounting/post",
      headers: auth(ctx.token),
      payload: {
        date: "2026-01-05",
        lines: [
          { code: "CASH", debit: 100, credit: 100 },
          { code: "CAPITAL", debit: 100, credit: 100 },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("both a debit and a credit");
  });

  it("rejects an unknown account code with 400", async () => {
    const ctx = seedUser();
    const res = await app.inject({
      method: "POST",
      url: "/api/accounting/post",
      headers: auth(ctx.token),
      payload: {
        date: "2026-01-05",
        lines: [
          { code: "NOSUCH", debit: 100 },
          { code: "CAPITAL", credit: 100 },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("Unknown account code");
  });

  it("rejects negative amounts", async () => {
    const ctx = seedUser();
    const res = await app.inject({
      method: "POST",
      url: "/api/accounting/post",
      headers: auth(ctx.token),
      payload: {
        date: "2026-01-05",
        lines: [
          { code: "CASH", debit: -100 },
          { code: "CAPITAL", credit: -100 },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("negative");
  });

  it("posting the same source twice is idempotent (no duplicated lines)", async () => {
    const ctx = seedUser();
    const input = {
      date: "2026-01-06",
      sourceType: "invoice",
      sourceId: "idem-src-1",
      description: "idempotency check",
      lines: [
        { code: "CASH", debit: 100 },
        { code: "SALES", credit: 100 },
      ],
    };
    const first = await post(ctx.id, input);
    expect(first.alreadyPosted).toBe(false);
    const second = await post(ctx.id, input);
    expect(second.alreadyPosted).toBe(true);
    expect(second.entryId).toBe(first.entryId);

    const entries = sourceEntries(ctx.id, "invoice", "idem-src-1");
    expect(entries).toHaveLength(1);
    const lines = all<{ c: number }>("SELECT COUNT(*) AS c FROM journal_lines WHERE entry_id = ?", first.entryId);
    expect(lines[0].c).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Accounting periods
// ---------------------------------------------------------------------------
describe("accounting periods", () => {
  it("closes a period, blocks postings inside it, and reopens", async () => {
    const ctx = seedUser();
    const close = await app.inject({
      method: "POST",
      url: "/api/accounting/periods/close",
      headers: auth(ctx.token),
      payload: { fromDate: "2026-04-01", toDate: "2026-04-30" },
    });
    expect(close.statusCode).toBe(201);

    const list = await app.inject({ method: "GET", url: "/api/accounting/periods", headers: auth(ctx.token) });
    expect(list.json().data).toHaveLength(1);
    expect(auditCount(ctx.id, "accounting.period_closed")).toBe(1);

    const blocked = await app.inject({
      method: "POST",
      url: "/api/accounting/post",
      headers: auth(ctx.token),
      payload: {
        date: "2026-04-15",
        lines: [
          { code: "CASH", debit: 10 },
          { code: "SALES", credit: 10 },
        ],
      },
    });
    expect(blocked.statusCode).toBe(400);
    expect(blocked.json().error).toContain("Period closed");

    const reopen = await app.inject({
      method: "POST",
      url: `/api/accounting/periods/${close.json().data.id}/reopen`,
      headers: auth(ctx.token),
    });
    expect(reopen.statusCode).toBe(200);

    const allowed = await app.inject({
      method: "POST",
      url: "/api/accounting/post",
      headers: auth(ctx.token),
      payload: {
        date: "2026-04-15",
        lines: [
          { code: "CASH", debit: 10 },
          { code: "SALES", credit: 10 },
        ],
      },
    });
    expect(allowed.statusCode).toBe(201);
    expect(auditCount(ctx.id, "accounting.period_reopened")).toBe(1);
  });

  it("rejects a duplicate period range with 409", async () => {
    const ctx = seedUser();
    const payload = { fromDate: "2026-05-01", toDate: "2026-05-31" };
    const first = await app.inject({
      method: "POST",
      url: "/api/accounting/periods/close",
      headers: auth(ctx.token),
      payload,
    });
    expect(first.statusCode).toBe(201);
    const second = await app.inject({
      method: "POST",
      url: "/api/accounting/periods/close",
      headers: auth(ctx.token),
      payload,
    });
    expect(second.statusCode).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// Invoice posting wiring
// ---------------------------------------------------------------------------
describe("invoice posting", () => {
  it("posts a cash sale: CASH debit = grandTotal, SALES + GST_OUTPUT credits", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { quantity: 10 });
    const res = await postInvoice(med, ctx);
    expect(res.statusCode).toBe(201);
    const inv = res.json().data;

    const entries = sourceEntries(ctx.id, "invoice", inv.id);
    expect(entries).toHaveLength(1);
    const lines = entryLines(entries[0].id);
    const cash = lines.find((l) => l.code === "CASH")!;
    const sales = lines.find((l) => l.code === "SALES")!;
    const gst = lines.find((l) => l.code === "GST_OUTPUT")!;

    expect(cash.debit).toBeCloseTo(inv.grandTotal, 2);
    expect(sales.credit).toBeCloseTo(inv.grandTotal - inv.totalGst, 2);
    expect(gst.credit).toBeCloseTo(inv.totalGst, 2);
    // Balanced: total credits == grandTotal
    const creditSum = lines.reduce((sum, l) => sum + l.credit, 0);
    expect(creditSum).toBeCloseTo(inv.grandTotal, 2);
  });

  it("trial balance over the sale date has equal debit and credit totals", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { quantity: 10 });
    const res = await postInvoice(med, ctx);
    expect(res.statusCode).toBe(201);

    const tb = await app.inject({
      method: "GET",
      url: `/api/accounting/trial-balance?from=${INV_DATE}&to=${INV_DATE}`,
      headers: auth(ctx.token),
    });
    expect(tb.statusCode).toBe(200);
    const body = tb.json().data;
    expect(body.totals.totalDebit).toBeCloseTo(body.totals.totalCredit, 2);
    expect(body.totals.totalDebit).toBeGreaterThan(0);
  });

  it("posts a credit sale to AR with the customer party tag", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { quantity: 10 });
    const cust = seedCustomer(ctx.id, { name: "Credit Customer" });
    const res = await postInvoice(med, ctx, {
      customerId: cust.id,
      paymentMode: "credit",
      amountPaid: 0,
      status: "unpaid",
    });
    expect(res.statusCode).toBe(201);
    const inv = res.json().data;

    const entries = sourceEntries(ctx.id, "invoice", inv.id);
    expect(entries).toHaveLength(1);
    const lines = entryLines(entries[0].id);
    const ar = lines.find((l) => l.code === "AR")!;
    expect(ar.debit).toBeCloseTo(inv.grandTotal, 2);
    expect(ar.party_type).toBe("customer");
    expect(ar.party_id).toBe(cust.id);
    expect(lines.find((l) => l.code === "CASH")).toBeUndefined();
  });

  it("cancelling an invoice creates a reversal entry and marks the original reversed", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { quantity: 10 });
    const res = await postInvoice(med, ctx);
    const inv = res.json().data;
    const [original] = sourceEntries(ctx.id, "invoice", inv.id);
    expect(original.reversed_by).toBeNull();

    const cancel = await app.inject({
      method: "POST",
      url: `/api/invoices/${inv.id}/cancel`,
      headers: auth(ctx.token),
    });
    expect(cancel.statusCode).toBe(200);

    const reversals = all(
      "SELECT * FROM journal_entries WHERE created_by = ? AND source_type = 'reversal'",
      ctx.id
    );
    expect(reversals).toHaveLength(1);
    expect(reversals[0].is_reversal).toBe(1);
    expect(reversals[0].source_id).toBe(original.id);

    const [refreshed] = sourceEntries(ctx.id, "invoice", inv.id);
    expect(refreshed.reversed_by).toBe(reversals[0].id);

    // The reversal mirrors every leg, so each account nets to zero (the
    // reversal is dated today per the cancel wiring, so use a full range).
    const tb = await trialBalance(ctx.id);
    expect(tb.totals.totalDebit).toBeCloseTo(tb.totals.totalCredit, 2);
    for (const row of tb.rows) expect(row.balance).toBeCloseTo(0, 2);
  });

  it("double cancel is safe: second cancel rejected, still exactly one reversal", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { quantity: 10 });
    const res = await postInvoice(med, ctx);
    const inv = res.json().data;

    const first = await app.inject({
      method: "POST",
      url: `/api/invoices/${inv.id}/cancel`,
      headers: auth(ctx.token),
    });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({
      method: "POST",
      url: `/api/invoices/${inv.id}/cancel`,
      headers: auth(ctx.token),
    });
    expect(second.statusCode).toBe(400);

    const reversals = all(
      "SELECT * FROM journal_entries WHERE created_by = ? AND source_type = 'reversal'",
      ctx.id
    );
    expect(reversals).toHaveLength(1);
  });

  it("deleting an invoice also reverses its journal entry", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { quantity: 10 });
    const res = await postInvoice(med, ctx);
    const inv = res.json().data;
    const [original] = sourceEntries(ctx.id, "invoice", inv.id);

    const del = await app.inject({
      method: "DELETE",
      url: `/api/invoices/${inv.id}`,
      headers: auth(ctx.token),
    });
    expect(del.statusCode).toBe(200);

    const reversals = all(
      "SELECT * FROM journal_entries WHERE created_by = ? AND source_type = 'reversal'",
      ctx.id
    );
    expect(reversals).toHaveLength(1);
    expect(reversals[0].source_id).toBe(original.id);
    const [refreshed] = sourceEntries(ctx.id, "invoice", inv.id);
    expect(refreshed.reversed_by).toBe(reversals[0].id);
  });

  it("a card sale posts its receipt to BANK, not CASH", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { quantity: 10 });
    const res = await postInvoice(med, ctx, { paymentMode: "card" });
    expect(res.statusCode).toBe(201);
    const inv = res.json().data;

    const [entry] = sourceEntries(ctx.id, "invoice", inv.id);
    const lines = entryLines(entry.id);
    expect(lines.find((l) => l.code === "BANK")!.debit).toBeCloseTo(inv.grandTotal, 2);
    expect(lines.find((l) => l.code === "CASH")).toBeUndefined();
  });

  it("a closed period never blocks the sale: it posts nothing + audits the gap", async () => {
    const ctx = seedUser();
    await app.inject({
      method: "POST",
      url: "/api/accounting/periods/close",
      headers: auth(ctx.token),
      payload: { fromDate: "2026-06-01", toDate: "2026-06-30" },
    });

    const med = seedMedicine(ctx.id, { quantity: 10 });
    const res = await postInvoice(med, ctx);
    expect(res.statusCode).toBe(201); // the sale still succeeds
    const inv = res.json().data;
    expect(sourceEntries(ctx.id, "invoice", inv.id)).toHaveLength(0);
    expect(auditCount(ctx.id, "accounting.post_failed")).toBe(1);
    expect(countForLocal("invoices", ctx.id)).toBe(1);
  });
});

function countForLocal(table: string, ownerId: string): number {
  const rows = all<{ c: number }>(`SELECT COUNT(*) AS c FROM ${table} WHERE created_by = ?`, ownerId);
  return rows[0]?.c ?? 0;
}

// ---------------------------------------------------------------------------
// Purchase posting wiring
// ---------------------------------------------------------------------------
describe("purchase posting", () => {
  function purchasePayload(med: SeededMedicine, over: Record<string, unknown> = {}) {
    return {
      billNo: `ACCT-${Math.random().toString(36).slice(2, 8)}`,
      billDate: "2026-06-20",
      items: [
        {
          medicineId: med.medicineId,
          medicineName: "Test Med",
          batchNo: `B${Math.random().toString(36).slice(2, 8)}`,
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
      amountPaid: 55.36,
      paymentMode: "cash",
      ...over,
    };
  }

  it("posts a cash purchase: INVENTORY + GST_INPUT debits / CASH credit", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { quantity: 5 });
    const payload = purchasePayload(med);
    const res = await app.inject({
      method: "POST",
      url: "/api/purchases",
      headers: auth(ctx.token),
      payload,
    });
    expect(res.statusCode).toBe(201);
    const bill = res.json().data;

    const entries = sourceEntries(ctx.id, "purchase", bill.id);
    expect(entries).toHaveLength(1);
    const lines = entryLines(entries[0].id);
    expect(lines.find((l) => l.code === "INVENTORY")!.debit).toBeCloseTo(50, 2);
    expect(lines.find((l) => l.code === "GST_INPUT")!.debit).toBeCloseTo(5.36, 2);
    expect(lines.find((l) => l.code === "CASH")!.credit).toBeCloseTo(55.36, 2);
    const debitSum = lines.reduce((sum, l) => sum + l.debit, 0);
    const creditSum = lines.reduce((sum, l) => sum + l.credit, 0);
    expect(debitSum).toBeCloseTo(creditSum, 2);
  });

  it("posts a credit purchase to AP with the supplier party tag", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { quantity: 5 });
    const supplierId = seedSupplier(ctx.id);
    const res = await app.inject({
      method: "POST",
      url: "/api/purchases",
      headers: auth(ctx.token),
      payload: purchasePayload(med, { paymentMode: "credit", amountPaid: 0, supplierId }),
    });
    expect(res.statusCode).toBe(201);
    const bill = res.json().data;

    const [entry] = sourceEntries(ctx.id, "purchase", bill.id);
    const lines = entryLines(entry.id);
    const ap = lines.find((l) => l.code === "AP")!;
    expect(ap.credit).toBeCloseTo(55.36, 2);
    expect(ap.party_type).toBe("supplier");
    expect(ap.party_id).toBe(supplierId);
    expect(lines.find((l) => l.code === "CASH")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Payment posting wiring
// ---------------------------------------------------------------------------
describe("payment posting", () => {
  it("posts a received payment: CASH debit / AR credit with customer party", async () => {
    const ctx = seedUser();
    const cust = seedCustomer(ctx.id);
    const res = await app.inject({
      method: "POST",
      url: "/api/payments",
      headers: auth(ctx.token),
      payload: { type: "received", amount: 50, customerId: cust.id, paymentMode: "cash", date: "2026-06-25" },
    });
    expect(res.statusCode).toBe(201);
    const payment = res.json().data;

    const [entry] = sourceEntries(ctx.id, "payment", payment.id);
    const lines = entryLines(entry.id);
    expect(lines.find((l) => l.code === "CASH")!.debit).toBeCloseTo(50, 2);
    const ar = lines.find((l) => l.code === "AR")!;
    expect(ar.credit).toBeCloseTo(50, 2);
    expect(ar.party_type).toBe("customer");
    expect(ar.party_id).toBe(cust.id);
  });

  it("posts an expense: EXPENSE debit (category memo) / CASH credit", async () => {
    const ctx = seedUser();
    const res = await app.inject({
      method: "POST",
      url: "/api/payments",
      headers: auth(ctx.token),
      payload: { type: "expense", amount: 30, category: "Rent", paymentMode: "cash", date: "2026-06-25" },
    });
    expect(res.statusCode).toBe(201);
    const payment = res.json().data;

    const [entry] = sourceEntries(ctx.id, "payment", payment.id);
    const lines = entryLines(entry.id);
    const expense = lines.find((l) => l.code === "EXPENSE")!;
    expect(expense.debit).toBeCloseTo(30, 2);
    expect(expense.memo).toBe("Rent");
    expect(lines.find((l) => l.code === "CASH")!.credit).toBeCloseTo(30, 2);
  });

  it("posts a supplier payment: AP debit / CASH credit with supplier party", async () => {
    const ctx = seedUser();
    const supplierId = seedSupplier(ctx.id);
    const res = await app.inject({
      method: "POST",
      url: "/api/payments",
      headers: auth(ctx.token),
      payload: { type: "paid", amount: 40, supplierId, paymentMode: "cash", date: "2026-06-25" },
    });
    expect(res.statusCode).toBe(201);
    const payment = res.json().data;

    const [entry] = sourceEntries(ctx.id, "payment", payment.id);
    const lines = entryLines(entry.id);
    const ap = lines.find((l) => l.code === "AP")!;
    expect(ap.debit).toBeCloseTo(40, 2);
    expect(ap.party_type).toBe("supplier");
    expect(ap.party_id).toBe(supplierId);
    expect(lines.find((l) => l.code === "CASH")!.credit).toBeCloseTo(40, 2);
  });

  it("skips + audits a received payment with no resolvable party", async () => {
    const ctx = seedUser();
    const res = await app.inject({
      method: "POST",
      url: "/api/payments",
      headers: auth(ctx.token),
      payload: { type: "received", amount: 20, paymentMode: "cash", date: "2026-06-25" },
    });
    expect(res.statusCode).toBe(201);
    const payment = res.json().data;
    expect(sourceEntries(ctx.id, "payment", payment.id)).toHaveLength(0);
    expect(auditCount(ctx.id, "accounting.skipped_no_party")).toBe(1);
  });

  it("skips + audits a credit-mode received payment", async () => {
    const ctx = seedUser();
    const cust = seedCustomer(ctx.id);
    const res = await app.inject({
      method: "POST",
      url: "/api/payments",
      headers: auth(ctx.token),
      payload: { type: "received", amount: 25, customerId: cust.id, paymentMode: "credit", date: "2026-06-25" },
    });
    expect(res.statusCode).toBe(201);
    const payment = res.json().data;
    expect(sourceEntries(ctx.id, "payment", payment.id)).toHaveLength(0);
    expect(auditCount(ctx.id, "accounting.skipped_credit_mode")).toBe(1);
  });

  it("deleting a posted payment reverses its journal entry", async () => {
    const ctx = seedUser();
    const cust = seedCustomer(ctx.id);
    const res = await app.inject({
      method: "POST",
      url: "/api/payments",
      headers: auth(ctx.token),
      payload: { type: "received", amount: 60, customerId: cust.id, paymentMode: "cash", date: "2026-06-26" },
    });
    expect(res.statusCode).toBe(201);
    const payment = res.json().data;
    const [original] = sourceEntries(ctx.id, "payment", payment.id);

    const del = await app.inject({
      method: "DELETE",
      url: `/api/payments/${payment.id}`,
      headers: auth(ctx.token),
    });
    expect(del.statusCode).toBe(200);

    const reversals = all(
      "SELECT * FROM journal_entries WHERE created_by = ? AND source_type = 'reversal'",
      ctx.id
    );
    expect(reversals).toHaveLength(1);
    expect(reversals[0].source_id).toBe(original.id);
    const [refreshed] = sourceEntries(ctx.id, "payment", payment.id);
    expect(refreshed.reversed_by).toBe(reversals[0].id);
  });
});

// ---------------------------------------------------------------------------
// Sales return posting wiring
// ---------------------------------------------------------------------------
describe("sales return posting", () => {
  async function createSale(ctx: SeededUser) {
    const med = seedMedicine(ctx.id, { quantity: 10 });
    const invRes = await postInvoice(med, ctx);
    expect(invRes.statusCode).toBe(201);
    return { med, inv: invRes.json().data };
  }

  async function createReturn(
    ctx: SeededUser,
    med: SeededMedicine,
    inv: any,
    refundAmount: number,
    refundMode: "cash" | "credit"
  ) {
    return app.inject({
      method: "POST",
      url: "/api/returns",
      headers: auth(ctx.token),
      payload: {
        invoiceId: inv.id,
        reason: "Damaged strip",
        refundMode,
        items: [
          {
            medicineId: med.medicineId,
            medicineName: "Test Med",
            batchId: med.batchId,
            quantity: 1,
            rate: 95.24,
            amount: 95.24,
            gstRate: "5",
            gstAmount: inv.totalGst,
            refundAmount,
          },
        ],
        subtotal: inv.subtotal,
        totalGst: inv.totalGst,
        grandTotal: inv.grandTotal,
        refundAmount,
      },
    });
  }

  it("posts a full cash refund with a proportional GST split", async () => {
    const ctx = seedUser();
    const { med, inv } = await createSale(ctx);
    const res = await createReturn(ctx, med, inv, inv.grandTotal, "cash");
    expect(res.statusCode).toBe(201);
    const ret = res.json().data;

    const [entry] = sourceEntries(ctx.id, "sales_return", ret.id);
    const lines = entryLines(entry.id);
    const gstShare = Math.round(inv.totalGst * 100) / 100;
    const taxable = Math.round((inv.grandTotal - gstShare) * 100) / 100;

    expect(lines.find((l) => l.code === "SALES_RETURNS")!.debit).toBeCloseTo(taxable, 2);
    expect(lines.find((l) => l.code === "GST_OUTPUT")!.debit).toBeCloseTo(gstShare, 2);
    expect(lines.find((l) => l.code === "CASH")!.credit).toBeCloseTo(inv.grandTotal, 2);
    const debitSum = lines.reduce((sum, l) => sum + l.debit, 0);
    expect(debitSum).toBeCloseTo(inv.grandTotal, 2);
  });

  it("splits a partial refund proportionally and stays balanced", async () => {
    const ctx = seedUser();
    const { med, inv } = await createSale(ctx);
    const res = await createReturn(ctx, med, inv, 50, "cash");
    expect(res.statusCode).toBe(201);
    const ret = res.json().data;

    const [entry] = sourceEntries(ctx.id, "sales_return", ret.id);
    const lines = entryLines(entry.id);
    const gstShare = Math.round(((50 * inv.totalGst) / inv.grandTotal) * 100) / 100;
    const taxable = Math.round((50 - gstShare) * 100) / 100;

    expect(lines.find((l) => l.code === "SALES_RETURNS")!.debit).toBeCloseTo(taxable, 2);
    expect(lines.find((l) => l.code === "GST_OUTPUT")!.debit).toBeCloseTo(gstShare, 2);
    expect(lines.find((l) => l.code === "CASH")!.credit).toBeCloseTo(50, 2);
    // Split sums exactly back to the refund amount.
    expect(taxable + gstShare).toBeCloseTo(50, 2);
    const debitSum = lines.reduce((sum, l) => sum + l.debit, 0);
    const creditSum = lines.reduce((sum, l) => sum + l.credit, 0);
    expect(debitSum).toBeCloseTo(creditSum, 2);
  });

  it("posts a credit-mode refund against AR", async () => {
    const ctx = seedUser();
    const { med, inv } = await createSale(ctx);
    const res = await createReturn(ctx, med, inv, inv.grandTotal, "credit");
    expect(res.statusCode).toBe(201);
    const ret = res.json().data;

    const [entry] = sourceEntries(ctx.id, "sales_return", ret.id);
    const lines = entryLines(entry.id);
    expect(lines.find((l) => l.code === "AR")!.credit).toBeCloseTo(inv.grandTotal, 2);
    expect(lines.find((l) => l.code === "CASH")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------
describe("reports", () => {
  it("trial balance over a range is balanced for constructed entries", async () => {
    const ctx = seedUser();
    await post(ctx.id, {
      date: "2026-03-05",
      sourceType: "manual",
      lines: [
        { code: "CASH", debit: 1000 },
        { code: "CAPITAL", credit: 1000 },
      ],
    });
    await post(ctx.id, {
      date: "2026-03-06",
      sourceType: "manual",
      lines: [
        { code: "EXPENSE", debit: 250 },
        { code: "CASH", credit: 250 },
      ],
    });
    const tb = await trialBalance(ctx.id, "2026-03-01", "2026-03-31");
    expect(tb.totals.totalDebit).toBeCloseTo(tb.totals.totalCredit, 2);
    expect(tb.totals.totalDebit).toBeCloseTo(1250, 2);
    const cash = tb.rows.find((row) => row.code === "CASH")!;
    expect(cash.balance).toBeCloseTo(750, 2); // asset: debit - credit
  });

  it("profit & loss net equals income - expense", async () => {
    const ctx = seedUser();
    await post(ctx.id, {
      date: "2026-03-05",
      sourceType: "manual",
      lines: [
        { code: "CASH", debit: 100 },
        { code: "SALES", credit: 100 },
      ],
    });
    await post(ctx.id, {
      date: "2026-03-06",
      sourceType: "manual",
      lines: [
        { code: "EXPENSE", debit: 40 },
        { code: "CASH", credit: 40 },
      ],
    });
    const pl = await profitLoss(ctx.id, "2026-03-01", "2026-03-31");
    expect(pl.incomeTotal).toBeCloseTo(100, 2);
    expect(pl.expenseTotal).toBeCloseTo(40, 2);
    expect(pl.net).toBeCloseTo(60, 2);
  });

  it("balance sheet satisfies A = L + E + retained earnings", async () => {
    const ctx = seedUser();
    // Capital injection
    await post(ctx.id, {
      date: "2026-03-01",
      sourceType: "manual",
      lines: [
        { code: "CASH", debit: 1000 },
        { code: "CAPITAL", credit: 1000 },
      ],
    });
    // An expense (cash out)
    await post(ctx.id, {
      date: "2026-03-02",
      sourceType: "manual",
      lines: [
        { code: "EXPENSE", debit: 100 },
        { code: "CASH", credit: 100 },
      ],
    });
    // Revenue on credit
    await post(ctx.id, {
      date: "2026-03-03",
      sourceType: "manual",
      lines: [
        { code: "AR", debit: 500 },
        { code: "SALES", credit: 500 },
      ],
    });
    const bs = await balanceSheet(ctx.id, "2026-03-31");
    expect(bs.totals.assets).toBeCloseTo(1400, 2); // 1000 - 100 + 500
    expect(bs.totals.liabilities).toBeCloseTo(0, 2);
    expect(bs.totals.equity).toBeCloseTo(1000, 2);
    expect(bs.totals.retainedEarnings).toBeCloseTo(400, 2); // 500 income - 100 expense
    expect(bs.totals.imbalance).toBeCloseTo(0, 2);
    expect(bs.totals.assets).toBeCloseTo(
      bs.totals.liabilities + bs.totals.equity + bs.totals.retainedEarnings,
      2
    );
  });

  it("day book lists entries with their expanded lines", async () => {
    const ctx = seedUser();
    await post(ctx.id, {
      date: "2026-03-10",
      sourceType: "manual",
      description: "Opening cash",
      lines: [
        { code: "CASH", debit: 700 },
        { code: "CAPITAL", credit: 700 },
      ],
    });
    const db = await dayBook(ctx.id, "2026-03-01", "2026-03-31");
    expect(db.entries.length).toBeGreaterThanOrEqual(1);
    expect(db.total).toBeGreaterThanOrEqual(db.entries.length);
    const entry = db.entries[0];
    expect(entry.lines.length).toBeGreaterThanOrEqual(2);
    expect(entry.lines.map((line) => line.code).sort()).toEqual(["CAPITAL", "CASH"]);

    const res = await app.inject({
      method: "GET",
      url: "/api/accounting/day-book?from=2026-03-01&to=2026-03-31",
      headers: auth(ctx.token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.entries).toHaveLength(db.entries.length);
  });

  it("GET /entries traces the journal entries for a source", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { quantity: 5 });
    const invRes = await postInvoice(med, ctx);
    const inv = invRes.json().data;

    const res = await app.inject({
      method: "GET",
      url: `/api/accounting/entries?sourceType=invoice&sourceId=${inv.id}`,
      headers: auth(ctx.token),
    });
    expect(res.statusCode).toBe(200);
    const entries = res.json().data;
    expect(entries).toHaveLength(1);
    expect(entries[0].sourceType).toBe("invoice");
    expect(entries[0].lines.length).toBeGreaterThanOrEqual(2);
  });

  it("GET /profit-loss and GET /balance-sheet respond with totals", async () => {
    const ctx = seedUser();
    await post(ctx.id, {
      date: "2026-02-05",
      sourceType: "manual",
      lines: [
        { code: "CASH", debit: 300 },
        { code: "SALES", credit: 300 },
      ],
    });
    const pl = await app.inject({
      method: "GET",
      url: "/api/accounting/profit-loss?from=2026-02-01&to=2026-02-28",
      headers: auth(ctx.token),
    });
    expect(pl.statusCode).toBe(200);
    expect(pl.json().data.net).toBeCloseTo(300, 2);

    const bs = await app.inject({
      method: "GET",
      url: "/api/accounting/balance-sheet?asOf=2026-02-28",
      headers: auth(ctx.token),
    });
    expect(bs.statusCode).toBe(200);
    expect(bs.json().data.totals.assets).toBeCloseTo(300, 2);
  });

  it("GET /balance-sheet without asOf returns 400", async () => {
    const ctx = seedUser();
    const res = await app.inject({
      method: "GET",
      url: "/api/accounting/balance-sheet",
      headers: auth(ctx.token),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("asOf");
  });

  it("trial balance signs balances by account type (income is credit - debit)", async () => {
    const ctx = seedUser();
    await post(ctx.id, {
      date: "2026-01-20",
      sourceType: "manual",
      lines: [
        { code: "AR", debit: 200 },
        { code: "SALES", credit: 200 },
      ],
    });
    const tb = await trialBalance(ctx.id, "2026-01-01", "2026-01-31");
    const ar = tb.rows.find((row) => row.code === "AR")!;
    const sales = tb.rows.find((row) => row.code === "SALES")!;
    expect(ar.balance).toBeCloseTo(200, 2); // asset: debit - credit
    expect(sales.balance).toBeCloseTo(200, 2); // income: credit - debit
    expect(sales.balance).toBeGreaterThan(0);
  });

  it("day book paginates entries", async () => {
    const ctx = seedUser();
    await post(ctx.id, {
      date: "2026-03-11",
      sourceType: "manual",
      lines: [
        { code: "CASH", debit: 10 },
        { code: "CAPITAL", credit: 10 },
      ],
    });
    await post(ctx.id, {
      date: "2026-03-12",
      sourceType: "manual",
      lines: [
        { code: "CASH", debit: 20 },
        { code: "CAPITAL", credit: 20 },
      ],
    });
    const page1 = await dayBook(ctx.id, "2026-03-01", "2026-03-31", 1, 1);
    const page2 = await dayBook(ctx.id, "2026-03-01", "2026-03-31", 2, 1);
    expect(page1.total).toBe(2);
    expect(page1.entries).toHaveLength(1);
    expect(page2.entries).toHaveLength(1);
    expect(page1.entries[0].id).not.toBe(page2.entries[0].id);
  });
});

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------
describe("roles", () => {
  it("admin can post manually; cashier gets 403", async () => {
    const admin = seedUser();
    const ok = await app.inject({
      method: "POST",
      url: "/api/accounting/post",
      headers: auth(admin.token),
      payload: {
        date: "2026-01-10",
        lines: [
          { code: "CASH", debit: 20 },
          { code: "SALES", credit: 20 },
        ],
      },
    });
    expect(ok.statusCode).toBe(201);

    const cashier = seedUser();
    setRole(cashier.id, "cashier");
    const denied = await app.inject({
      method: "POST",
      url: "/api/accounting/post",
      headers: auth(cashier.token),
      payload: {
        date: "2026-01-10",
        lines: [
          { code: "CASH", debit: 20 },
          { code: "SALES", credit: 20 },
        ],
      },
    });
    expect(denied.statusCode).toBe(403);
  });

  it("cashier cannot reverse entries; admin can (idempotent)", async () => {
    const admin = seedUser();
    const created = await post(admin.id, {
      date: "2026-01-11",
      sourceType: "purchase",
      sourceId: "rev-src-1",
      lines: [
        { code: "INVENTORY", debit: 60 },
        { code: "CASH", credit: 60 },
      ],
    });
    const cashier = seedUser();
    setRole(cashier.id, "cashier");
    const denied = await app.inject({
      method: "POST",
      url: `/api/accounting/entries/${created.entryId}/reverse`,
      headers: auth(cashier.token),
      payload: { reason: "nope" },
    });
    expect(denied.statusCode).toBe(403);

    const first = await app.inject({
      method: "POST",
      url: `/api/accounting/entries/${created.entryId}/reverse`,
      headers: auth(admin.token),
      payload: { reason: "test reversal" },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().data.alreadyReversed).toBe(false);
    expect(first.json().data.found).toBe(true);

    const second = await app.inject({
      method: "POST",
      url: `/api/accounting/entries/${created.entryId}/reverse`,
      headers: auth(admin.token),
      payload: { reason: "again" },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().data.alreadyReversed).toBe(true);
  });

  it("cashier cannot close a period", async () => {
    const cashier = seedUser();
    setRole(cashier.id, "cashier");
    const res = await app.inject({
      method: "POST",
      url: "/api/accounting/periods/close",
      headers: auth(cashier.token),
      payload: { fromDate: "2026-07-01", toDate: "2026-07-31" },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Tenant isolation
// ---------------------------------------------------------------------------
describe("tenant isolation", () => {
  it("user B never sees user A's accounts, entries, reports or periods", async () => {
    const a = seedUser();
    const b = seedUser();

    // A: manual account, a posted source entry, a closed period.
    await app.inject({
      method: "POST",
      url: "/api/accounting/accounts",
      headers: auth(a.token),
      payload: { code: "SECRETA", name: "Secret A", type: "asset" },
    });
    const created = await post(a.id, {
      date: "2026-08-05",
      sourceType: "invoice",
      sourceId: "tenant-a-src",
      lines: [
        { code: "CASH", debit: 999 },
        { code: "SALES", credit: 999 },
      ],
    });
    await app.inject({
      method: "POST",
      url: "/api/accounting/periods/close",
      headers: auth(a.token),
      payload: { fromDate: "2026-08-01", toDate: "2026-08-31" },
    });

    // B: accounts
    const accounts = await app.inject({
      method: "GET",
      url: "/api/accounting/accounts",
      headers: auth(b.token),
    });
    const codes = accounts.json().data.map((row: any) => row.code);
    expect(codes).not.toContain("SECRETA");
    expect(accounts.json().data).toHaveLength(SYSTEM_ACCOUNTS.length);

    // B: trial balance / P&L / balance sheet show none of A's movement
    const tb = await app.inject({
      method: "GET",
      url: "/api/accounting/trial-balance?from=2026-08-01&to=2026-08-31",
      headers: auth(b.token),
    });
    expect(tb.json().data.totals.totalDebit).toBe(0);

    const pl = await app.inject({
      method: "GET",
      url: "/api/accounting/profit-loss?from=2026-08-01&to=2026-08-31",
      headers: auth(b.token),
    });
    expect(pl.json().data.incomeTotal).toBe(0);

    const bs = await app.inject({
      method: "GET",
      url: "/api/accounting/balance-sheet?asOf=2026-08-31",
      headers: auth(b.token),
    });
    expect(bs.json().data.totals.assets).toBe(0);

    // B: day book is empty
    const dayBookRes = await app.inject({
      method: "GET",
      url: "/api/accounting/day-book?from=2026-08-01&to=2026-08-31",
      headers: auth(b.token),
    });
    expect(dayBookRes.json().data.total).toBe(0);

    // B: trace by A's source returns nothing
    const trace = await app.inject({
      method: "GET",
      url: "/api/accounting/entries?sourceType=invoice&sourceId=tenant-a-src",
      headers: auth(b.token),
    });
    expect(trace.json().data).toHaveLength(0);

    // B: direct entry fetch 404s
    const direct = await app.inject({
      method: "GET",
      url: `/api/accounting/entries/${created.entryId}`,
      headers: auth(b.token),
    });
    expect(direct.statusCode).toBe(404);

    // B: periods list empty (A's closed period invisible)
    const periods = await app.inject({
      method: "GET",
      url: "/api/accounting/periods",
      headers: auth(b.token),
    });
    expect(periods.json().data).toHaveLength(0);
  });
});
