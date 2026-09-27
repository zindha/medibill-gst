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
import paymentRoutes from "../src/routes/payments.js";
import reconciliationRoutes from "../src/routes/reconciliation.js";
import { post, trialBalance } from "../src/services/accounting.js";
import { importStatement, cashBook, bankBook, listStatementRows } from "../src/services/reconciliation.js";

let app: FastifyInstance;

const INV_DATE = "2026-06-15";

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

function countForLocal(table: string, ownerId: string): number {
  const rows = all<{ c: number }>(`SELECT COUNT(*) AS c FROM ${table} WHERE created_by = ?`, ownerId);
  return rows[0]?.c ?? 0;
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
// Payload helpers (patterns from accounting.test.ts)
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
    headers: auth(ctx.token),
    payload: invoiceBody(med, over),
  });
}

async function postPayment(ctx: SeededUser, payload: Record<string, unknown>) {
  return app.inject({ method: "POST", url: "/api/payments", headers: auth(ctx.token), payload });
}

/** Journal fixture: a balanced manual entry on BANK (or CASH). */
async function seedBankLine(userId: string, amount: number, date: string, side: "debit" | "credit" = "debit") {
  const result = await post(userId, {
    date,
    sourceType: "manual",
    description: `bank move ${amount}`,
    lines:
      side === "debit"
        ? [
            { code: "BANK", debit: amount },
            { code: "SALES", credit: amount },
          ]
        : [
            { code: "EXPENSE", debit: amount },
            { code: "BANK", credit: amount },
          ],
  });
  const line = result.entry.lines.find((entryLine) => entryLine.code === "BANK")!;
  return { entryId: result.entryId, lineId: line.id };
}

const CSV_BASIC = [
  "Date,Reference,Description,Amount",
  '15/06/2026,UPI-1,"NEFT, payment from Acme",1500.50',
  "16/06/2026,,Cash withdrawal,-200",
].join("\r\n");

const CSV_DEBIT_CREDIT = [
  "Date,Reference,Description,Debit,Credit",
  "01/07/2026,R1,Deposit,,500",
  "02/07/2026,R2,Withdrawal,250,",
].join("\n");

const CSV_DIRECTION = ["Date,Description,Direction,Amount", "05/07/2026,Adjustment,out,300"].join("\n");

beforeAll(async () => {
  applySchema();
  app = Fastify({ logger: false });
  await app.register(invoiceRoutes, { prefix: "/api/invoices" });
  await app.register(paymentRoutes, { prefix: "/api/payments" });
  await app.register(reconciliationRoutes, { prefix: "/api/reconciliation" });
});

// ---------------------------------------------------------------------------
// Cash Book
// ---------------------------------------------------------------------------
describe("cash book", () => {
  it("builds inflow/outflow/closing from journal lines and keeps a running balance", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { quantity: 10 });
    const invoice = await postInvoice(med, ctx);
    expect(invoice.statusCode).toBe(201);
    // The server recomputes the grand total from the item lines (GST-inclusive),
    // so the ledger row carries the authoritative amount, not the client's.
    const sale = invoice.json().data.grandTotal as number;
    expect(sale).toBeGreaterThan(0);

    const expense = await postPayment(ctx, {
      type: "expense",
      amount: 30,
      category: "Rent",
      paymentMode: "cash",
      date: "2026-06-16",
    });
    expect(expense.statusCode).toBe(201);

    const book = await cashBook(ctx.id, "2026-06-01", "2026-06-30");
    expect(book.book).toBe("cash");
    expect(book.from).toBe("2026-06-01");
    expect(book.to).toBe("2026-06-30");
    expect(book.opening).toBeCloseTo(0, 2);
    expect(book.inflow).toBeCloseTo(sale, 2);
    expect(book.outflow).toBeCloseTo(30, 2);
    expect(book.closing).toBeCloseTo(sale - 30, 2);
    expect(book.closing).toBeCloseTo(book.opening + book.inflow - book.outflow, 2);
    expect(book.rows).toHaveLength(2);

    expect(book.rows[0].date).toBe(INV_DATE);
    expect(book.rows[0].debit).toBeCloseTo(sale, 2);
    expect(book.rows[0].credit).toBe(0);
    expect(book.rows[0].runningBalance).toBeCloseTo(sale, 2);
    expect(book.rows[0].accountParties.map((party) => party.code).sort()).toEqual(["GST_OUTPUT", "SALES"]);
    expect(book.rows[0].sourceType).toBe("invoice");

    expect(book.rows[1].date).toBe("2026-06-16");
    expect(book.rows[1].credit).toBeCloseTo(30, 2);
    expect(book.rows[1].runningBalance).toBeCloseTo(sale - 30, 2);
    expect(book.rows[1].accountParties.map((party) => party.code)).toEqual(["EXPENSE"]);
    expect(book.rows[1].accountParties[0].memo).toBe("Rent");

    expect(book.summary.rowCount).toBe(2);
    expect(book.summary.inCount).toBe(1);
    expect(book.summary.outCount).toBe(1);
    expect(book.summary.net).toBeCloseTo(sale - 30, 2);
  });

  it("opening counts entries dated before `from`", async () => {
    const ctx = seedUser();
    await post(ctx.id, {
      date: "2026-05-01",
      sourceType: "manual",
      lines: [
        { code: "CASH", debit: 500 },
        { code: "CAPITAL", credit: 500 },
      ],
    });
    await post(ctx.id, {
      date: "2026-05-10",
      sourceType: "manual",
      lines: [
        { code: "EXPENSE", debit: 100 },
        { code: "CASH", credit: 100 },
      ],
    });
    await post(ctx.id, {
      date: "2026-06-05",
      sourceType: "manual",
      lines: [
        { code: "CASH", debit: 50 },
        { code: "SALES", credit: 50 },
      ],
    });

    const book = await cashBook(ctx.id, "2026-06-01", "2026-06-30");
    expect(book.opening).toBeCloseTo(400, 2);
    expect(book.inflow).toBeCloseTo(50, 2);
    expect(book.outflow).toBeCloseTo(0, 2);
    expect(book.closing).toBeCloseTo(450, 2);
    expect(book.rows).toHaveLength(1);
    expect(book.rows[0].runningBalance).toBeCloseTo(450, 2);
  });

  it("closing equals the trial-balance CASH balance (books are built from the journal)", async () => {
    const ctx = seedUser();
    await post(ctx.id, {
      date: "2026-06-01",
      sourceType: "manual",
      lines: [
        { code: "CASH", debit: 1000 },
        { code: "CAPITAL", credit: 1000 },
      ],
    });
    await post(ctx.id, {
      date: "2026-06-10",
      sourceType: "manual",
      lines: [
        { code: "EXPENSE", debit: 250 },
        { code: "CASH", credit: 250 },
      ],
    });

    const book = await cashBook(ctx.id, "2026-06-01", "2026-06-30");
    const tb = await trialBalance(ctx.id);
    const cash = tb.rows.find((row) => row.code === "CASH")!;
    expect(book.closing).toBeCloseTo(cash.balance, 2);
    expect(book.closing).toBeCloseTo(750, 2);
  });

  it("a cash-received payment shows up as a cash inflow", async () => {
    const ctx = seedUser();
    const customer = seedCustomer(ctx.id);
    const res = await postPayment(ctx, {
      type: "received",
      amount: 120,
      customerId: customer.id,
      paymentMode: "cash",
      date: "2026-06-20",
    });
    expect(res.statusCode).toBe(201);

    const book = await cashBook(ctx.id, "2026-06-01", "2026-06-30");
    expect(book.inflow).toBeCloseTo(120, 2);
    expect(book.outflow).toBeCloseTo(0, 2);
    expect(book.closing).toBeCloseTo(book.opening + book.inflow - book.outflow, 2);
    expect(book.rows).toHaveLength(1);
    expect(book.rows[0].debit).toBeCloseTo(120, 2);
    expect(book.rows[0].accountParties.map((party) => party.code)).toEqual(["AR"]);
    expect(book.rows[0].accountParties[0].partyId).toBe(customer.id);
  });

  it("an empty range returns zeroed totals and no rows", async () => {
    const ctx = seedUser();
    const book = await cashBook(ctx.id, "2026-01-01", "2026-01-31");
    expect(book.rows).toHaveLength(0);
    expect(book.opening).toBe(0);
    expect(book.inflow).toBe(0);
    expect(book.outflow).toBe(0);
    expect(book.closing).toBe(0);
    expect(book.summary.rowCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Bank Book
// ---------------------------------------------------------------------------
describe("bank book", () => {
  it("a bank_transfer payment lands in the bank book as an inflow", async () => {
    const ctx = seedUser();
    const customer = seedCustomer(ctx.id);
    const res = await postPayment(ctx, {
      type: "received",
      amount: 250,
      customerId: customer.id,
      paymentMode: "bank_transfer",
      date: "2026-07-05",
    });
    expect(res.statusCode).toBe(201);

    const bank = await bankBook(ctx.id, "2026-07-01", "2026-07-31");
    expect(bank.book).toBe("bank");
    expect(bank.inflow).toBeCloseTo(250, 2);
    expect(bank.outflow).toBeCloseTo(0, 2);
    expect(bank.closing).toBeCloseTo(250, 2);
    expect(bank.rows).toHaveLength(1);
    expect(bank.rows[0].debit).toBeCloseTo(250, 2);
    expect(bank.rows[0].sourceType).toBe("payment");
    expect(bank.rows[0].accountParties.map((party) => party.code)).toEqual(["AR"]);

    // The same money never shows up in the cash book.
    const cash = await cashBook(ctx.id, "2026-07-01", "2026-07-31");
    expect(cash.rows).toHaveLength(0);
    expect(cash.inflow).toBe(0);
  });

  it("bank payments post as outflows; cash payments stay out of the bank book", async () => {
    const ctx = seedUser();
    const bankExpense = await postPayment(ctx, {
      type: "expense",
      amount: 40,
      category: "Internet",
      paymentMode: "card",
      date: "2026-07-06",
    });
    expect(bankExpense.statusCode).toBe(201);
    const cashExpense = await postPayment(ctx, {
      type: "expense",
      amount: 10,
      category: "Tea",
      paymentMode: "cash",
      date: "2026-07-06",
    });
    expect(cashExpense.statusCode).toBe(201);

    const bank = await bankBook(ctx.id, "2026-07-01", "2026-07-31");
    expect(bank.rows).toHaveLength(1);
    expect(bank.outflow).toBeCloseTo(40, 2);
    expect(bank.inflow).toBeCloseTo(0, 2);
    expect(bank.closing).toBeCloseTo(-40, 2);

    const cash = await cashBook(ctx.id, "2026-07-01", "2026-07-31");
    expect(cash.rows).toHaveLength(1);
    expect(cash.outflow).toBeCloseTo(10, 2);

    const tb = await trialBalance(ctx.id);
    const bankAccount = tb.rows.find((row) => row.code === "BANK")!;
    expect(bank.closing).toBeCloseTo(bankAccount.balance, 2);
  });

  it("GET /api/reconciliation/bank serves the book over HTTP", async () => {
    const ctx = seedUser();
    await post(ctx.id, {
      date: "2026-08-04",
      sourceType: "manual",
      lines: [
        { code: "BANK", debit: 900 },
        { code: "CAPITAL", credit: 900 },
      ],
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/reconciliation/bank?from=2026-08-01&to=2026-08-31",
      headers: auth(ctx.token),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.book).toBe("bank");
    expect(body.data.inflow).toBeCloseTo(900, 2);
    expect(body.data.rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Statement import
// ---------------------------------------------------------------------------
describe("bank statement import", () => {
  it("parses a header row, quoted commas, CRLF and DD/MM/YYYY dates", async () => {
    const ctx = seedUser();
    const result = await importStatement(ctx.id, CSV_BASIC);

    expect(result.imported).toBe(2);
    expect(result.duplicates).toBe(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toEqual({ line: 1, reason: "Header row" });

    const rows = await listStatementRows(ctx.id);
    expect(rows).toHaveLength(2);
    expect(rows[0].statementDate).toBe("2026-06-15");
    expect(rows[0].reference).toBe("UPI-1");
    expect(rows[0].description).toBe("NEFT, payment from Acme");
    expect(rows[0].amount).toBeCloseTo(1500.5, 2);
    expect(rows[0].direction).toBe("in");
    expect(rows[0].matched).toBe(false);
    expect(rows[1].statementDate).toBe("2026-06-16");
    expect(rows[1].amount).toBeCloseTo(-200, 2);
    expect(rows[1].direction).toBe("out");
    expect(rows[1].reference).toBeNull();
    expect(JSON.parse(all<any>("SELECT raw FROM bank_statement_rows WHERE id = ?", rows[0].id)[0].raw)).toBeInstanceOf(
      Array
    );
  });

  it("turns debit/credit columns into a signed amount", async () => {
    const ctx = seedUser();
    const result = await importStatement(ctx.id, CSV_DEBIT_CREDIT);
    expect(result.imported).toBe(2);

    const rows = await listStatementRows(ctx.id);
    expect(rows[0].amount).toBeCloseTo(500, 2);
    expect(rows[0].direction).toBe("in");
    expect(rows[1].amount).toBeCloseTo(-250, 2);
    expect(rows[1].direction).toBe("out");
  });

  it("lets an explicit direction column force the sign", async () => {
    const ctx = seedUser();
    const result = await importStatement(ctx.id, CSV_DIRECTION);
    expect(result.imported).toBe(1);

    const [row] = await listStatementRows(ctx.id);
    expect(row.amount).toBeCloseTo(-300, 2);
    expect(row.direction).toBe("out");
    expect(row.statementDate).toBe("2026-07-05");
  });

  it("re-importing the same file counts duplicates and stores no extra rows", async () => {
    const ctx = seedUser();
    const first = await importStatement(ctx.id, CSV_BASIC);
    expect(first.imported).toBe(2);
    expect(first.duplicates).toBe(0);

    const second = await importStatement(ctx.id, CSV_BASIC);
    expect(second.imported).toBe(0);
    expect(second.duplicates).toBe(2);
    expect(second.skipped).toHaveLength(1);

    expect(countForLocal("bank_statement_rows", ctx.id)).toBe(2);
    expect(
      all<{ c: number }>("SELECT COUNT(*) AS c FROM bank_statement_rows WHERE created_by = ?", ctx.id)[0].c
    ).toBe(2);
  });

  it("collects invalid lines as skipped with a reason", async () => {
    const ctx = seedUser();
    const csv = [
      "Date,Reference,Description,Amount",
      "not-a-date,,Bad row,100",
      "20/06/2026,,Bad amount,abc",
      "21/06/2026,,Zero,0",
      "22/06/2026,,Good,42",
    ].join("\n");

    const result = await importStatement(ctx.id, csv);
    expect(result.imported).toBe(1);
    expect(result.skipped.map((row) => row.line)).toEqual([1, 2, 3, 4]);
    expect(result.skipped[1].reason).toContain("Invalid date");
    expect(result.skipped[2].reason).toContain("Invalid amount");
    expect(result.skipped[3].reason).toContain("Zero");
    expect(countForLocal("bank_statement_rows", ctx.id)).toBe(1);
  });

  it("POST /api/reconciliation/import works and rejects an empty payload", async () => {
    const ctx = seedUser();
    const res = await app.inject({
      method: "POST",
      url: "/api/reconciliation/import",
      headers: auth(ctx.token),
      payload: { csv: CSV_BASIC },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.imported).toBe(2);

    const bad = await app.inject({
      method: "POST",
      url: "/api/reconciliation/import",
      headers: auth(ctx.token),
      payload: {},
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toBe("Validation error");
  });
});

// ---------------------------------------------------------------------------
// Statement rows listing
// ---------------------------------------------------------------------------
describe("statement rows", () => {
  it("filters by date range, search text and unreconciledOnly", async () => {
    const ctx = seedUser();
    await importStatement(ctx.id, CSV_BASIC);
    await importStatement(
      ctx.id,
      ["Date,Reference,Description,Amount", "10/08/2026,NEFT-9,Salary payout,-5000"].join("\n")
    );

    const allRows = await listStatementRows(ctx.id);
    expect(allRows).toHaveLength(3);

    const june = await listStatementRows(ctx.id, { from: "2026-06-01", to: "2026-06-30" });
    expect(june).toHaveLength(2);

    const searched = await listStatementRows(ctx.id, { q: "salary" });
    expect(searched).toHaveLength(1);
    expect(searched[0].reference).toBe("NEFT-9");

    const unmatched = await listStatementRows(ctx.id, { unreconciledOnly: true });
    expect(unmatched).toHaveLength(3);

    const res = await app.inject({
      method: "GET",
      url: "/api/reconciliation/rows?from=2026-06-01&to=2026-06-30&unreconciledOnly=true&q=NEFT-1",
      headers: auth(ctx.token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(0); // June rows have no NEFT-9
  });
});

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------
describe("suggest matches", () => {
  it("suggests an exact same-direction BANK line within 5 days as 0.9", async () => {
    const ctx = seedUser();
    const near = await seedBankLine(ctx.id, 500, "2026-07-05");
    await seedBankLine(ctx.id, 500, "2026-07-20"); // outside the ±5 day window
    await importStatement(
      ctx.id,
      ["Date,Reference,Description,Amount", "06/07/2026,UPI-7,Incoming RTGS,500"].join("\n")
    );
    const [row] = await listStatementRows(ctx.id, { q: "RTGS" });

    const result = await app.inject({
      method: "GET",
      url: `/api/reconciliation/suggest?bankRowId=${row.id}`,
      headers: auth(ctx.token),
    });
    expect(result.statusCode).toBe(200);
    const data = result.json().data;
    expect(data.candidates.length).toBeGreaterThanOrEqual(1);
    expect(data.candidates[0].journalLineId).toBe(near.lineId);
    expect(data.candidates[0].confidence).toBe(0.9);
    expect(data.candidates[0].lineAmount).toBeCloseTo(500, 2);
    expect(data.candidates[0].sourceType).toBe("manual");
    // The out-of-window line is never offered.
    const ids = data.candidates.map((c: any) => c.journalLineId);
    const far = all<{ id: string }>(
      `SELECT jl.id FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       JOIN accounts a ON a.id = jl.account_id
       WHERE jl.created_by = ? AND je.date = '2026-07-20' AND a.code = 'BANK'`,
      ctx.id
    );
    expect(ids).not.toContain(far[0]?.id);
  });

  it("never suggests a line whose direction disagrees with the statement row", async () => {
    const ctx = seedUser();
    await seedBankLine(ctx.id, 300, "2026-07-05", "debit"); // money in
    await importStatement(
      ctx.id,
      ["Date,Description,Amount", "06/07/2026,Money out,-300"].join("\n")
    );
    const [outRow] = await listStatementRows(ctx.id, { q: "Money out" });

    const outSuggestions = await app.inject({
      method: "GET",
      url: `/api/reconciliation/suggest?bankRowId=${outRow.id}`,
      headers: auth(ctx.token),
    });
    expect(outSuggestions.statusCode).toBe(200);
    expect(outSuggestions.json().data.candidates).toHaveLength(0);

    // A credit line (money out) IS suggested for the same outflow row.
    const creditLine = await seedBankLine(ctx.id, 300, "2026-07-05", "credit");
    const retry = await app.inject({
      method: "GET",
      url: `/api/reconciliation/suggest?bankRowId=${outRow.id}`,
      headers: auth(ctx.token),
    });
    expect(retry.json().data.candidates).toHaveLength(1);
    expect(retry.json().data.candidates[0].journalLineId).toBe(creditLine.lineId);
    expect(retry.json().data.candidates[0].confidence).toBe(0.9);
  });

  it("404s for a statement row owned by another tenant", async () => {
    const a = seedUser();
    const b = seedUser();
    await importStatement(a.id, CSV_BASIC);
    const [row] = await listStatementRows(a.id);

    const res = await app.inject({
      method: "GET",
      url: `/api/reconciliation/suggest?bankRowId=${row.id}`,
      headers: auth(b.token),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toContain("Statement row not found");
  });

  it("excludes journal lines that are already matched", async () => {
    const ctx = seedUser();
    const line = await seedBankLine(ctx.id, 700, "2026-09-05");
    await importStatement(ctx.id, ["Date,Description,Amount", "06/09/2026,Incoming,700"].join("\n"));
    const [row] = await listStatementRows(ctx.id);

    const before = await app.inject({
      method: "GET",
      url: `/api/reconciliation/suggest?bankRowId=${row.id}`,
      headers: auth(ctx.token),
    });
    expect(before.json().data.candidates).toHaveLength(1);

    const matched = await app.inject({
      method: "POST",
      url: "/api/reconciliation/match",
      headers: auth(ctx.token),
      payload: { bankRowId: row.id, journalLineId: line.lineId },
    });
    expect(matched.statusCode).toBe(200);

    const after = await app.inject({
      method: "GET",
      url: `/api/reconciliation/suggest?bankRowId=${row.id}`,
      headers: auth(ctx.token),
    });
    expect(after.json().data.candidates).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Match / unmatch
// ---------------------------------------------------------------------------
describe("match and unmatch", () => {
  async function fixture(opts: { rowAmount?: number; lineAmount?: number; rowDate?: string; lineDate?: string } = {}) {
    const ctx = seedUser();
    const rowAmount = opts.rowAmount ?? 450;
    const lineAmount = opts.lineAmount ?? 450;
    const rowDate = opts.rowDate ?? "06/07/2026";
    const lineDate = opts.lineDate ?? "2026-07-05";
    await importStatement(
      ctx.id,
      ["Date,Description,Amount", `${rowDate},Incoming NEFT,${rowAmount}`].join("\n")
    );
    const [row] = await listStatementRows(ctx.id);
    const line = await seedBankLine(ctx.id, lineAmount, lineDate);
    return { ctx, row, line };
  }

  it("matches a row to a journal line, records an audit and drops the unmatched count", async () => {
    const { ctx, row, line } = await fixture();
    const statusBefore = await app.inject({
      method: "GET",
      url: "/api/reconciliation/status",
      headers: auth(ctx.token),
    });
    expect(statusBefore.json().data.totals).toMatchObject({
      statementRows: 1,
      matched: 0,
      unmatchedRows: 1,
      unmatchedJournalLines: 1,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/reconciliation/match",
      headers: auth(ctx.token),
      payload: { bankRowId: row.id, journalLineId: line.lineId, notes: "exact RTGS" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.bankRowId).toBe(row.id);
    expect(res.json().data.journalLineId).toBe(line.lineId);
    expect(res.json().data.notes).toBe("exact RTGS");
    expect(res.json().data.forced).toBe(false);
    expect(auditCount(ctx.id, "reconciliation.match")).toBe(1);

    const rows = await listStatementRows(ctx.id);
    expect(rows[0].matched).toBe(true);
    expect(rows[0].match?.journalLineId).toBe(line.lineId);

    const statusAfter = await app.inject({
      method: "GET",
      url: "/api/reconciliation/status",
      headers: auth(ctx.token),
    });
    expect(statusAfter.json().data.totals).toMatchObject({
      statementRows: 1,
      matched: 1,
      unmatchedRows: 0,
      unmatchedJournalLines: 0,
    });
    expect(statusAfter.json().data.unmatchedRows).toHaveLength(0);
    expect(statusAfter.json().data.unmatchedJournalLines).toHaveLength(0);
  });

  it("rejects an amount mismatch with 400 'Amount mismatch'", async () => {
    const { ctx, row, line } = await fixture({ rowAmount: 450, lineAmount: 300 });
    const res = await app.inject({
      method: "POST",
      url: "/api/reconciliation/match",
      headers: auth(ctx.token),
      payload: { bankRowId: row.id, journalLineId: line.lineId },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Amount mismatch");
    expect(countForLocal("reconciliation_matches", ctx.id)).toBe(0);
  });

  it("force-matches a mismatch with notes (admin 200), but requires the notes", async () => {
    const { ctx, row, line } = await fixture({ rowAmount: 450, lineAmount: 300 });

    const missingNotes = await app.inject({
      method: "POST",
      url: "/api/reconciliation/match",
      headers: auth(ctx.token),
      payload: { bankRowId: row.id, journalLineId: line.lineId, force: true },
    });
    expect(missingNotes.statusCode).toBe(400);
    expect(missingNotes.json().error).toContain("Force match requires notes");

    const forced = await app.inject({
      method: "POST",
      url: "/api/reconciliation/match",
      headers: auth(ctx.token),
      payload: { bankRowId: row.id, journalLineId: line.lineId, force: true, notes: "bank fee deducted" },
    });
    expect(forced.statusCode).toBe(200);
    expect(forced.json().data.forced).toBe(true);
    expect(countForLocal("reconciliation_matches", ctx.id)).toBe(1);
  });

  it("blocks a second match of the same statement row (409) and of the same journal line (409)", async () => {
    const { ctx, row, line } = await fixture();
    const otherLine = await seedBankLine(ctx.id, 450, "2026-07-08");
    await importStatement(ctx.id, ["Date,Description,Amount", "09/07/2026,Second row,450"].join("\n"));
    const rows = await listStatementRows(ctx.id);
    const otherRow = rows[1];

    const first = await app.inject({
      method: "POST",
      url: "/api/reconciliation/match",
      headers: auth(ctx.token),
      payload: { bankRowId: row.id, journalLineId: line.lineId },
    });
    expect(first.statusCode).toBe(200);

    const sameRow = await app.inject({
      method: "POST",
      url: "/api/reconciliation/match",
      headers: auth(ctx.token),
      payload: { bankRowId: row.id, journalLineId: otherLine.lineId },
    });
    expect(sameRow.statusCode).toBe(409);
    expect(sameRow.json().error).toContain("already matched");

    const sameLine = await app.inject({
      method: "POST",
      url: "/api/reconciliation/match",
      headers: auth(ctx.token),
      payload: { bankRowId: otherRow.id, journalLineId: line.lineId },
    });
    expect(sameLine.statusCode).toBe(409);
    expect(sameLine.json().error).toContain("already matched");

    expect(countForLocal("reconciliation_matches", ctx.id)).toBe(1);
  });

  it("404s when either side belongs to another tenant", async () => {
    const a = seedUser();
    const b = seedUser();
    await importStatement(a.id, CSV_BASIC);
    const [aRow] = await listStatementRows(a.id);
    const aLine = await seedBankLine(a.id, 1500.5, "2026-06-14");

    const foreignRow = await app.inject({
      method: "POST",
      url: "/api/reconciliation/match",
      headers: auth(b.token),
      payload: { bankRowId: aRow.id, journalLineId: aLine.lineId },
    });
    expect(foreignRow.statusCode).toBe(404);
    expect(foreignRow.json().error).toContain("Statement row not found");

    // B owns its own row but points it at A's journal line.
    await importStatement(b.id, ["Date,Description,Amount", "15/06/2026,Own row,1500.5"].join("\n"));
    const [bRow] = await listStatementRows(b.id);
    const foreignLine = await app.inject({
      method: "POST",
      url: "/api/reconciliation/match",
      headers: auth(b.token),
      payload: { bankRowId: bRow.id, journalLineId: aLine.lineId },
    });
    expect(foreignLine.statusCode).toBe(404);
    expect(foreignLine.json().error).toContain("Journal line not found");
  });

  it("unmatch removes the link, allows a rematch and never touches the journal", async () => {
    const { ctx, row, line } = await fixture();
    const journalBefore = all<{ c: number }>("SELECT COUNT(*) AS c FROM journal_lines WHERE created_by = ?", ctx.id);
    const entriesBefore = all<{ c: number }>(
      "SELECT COUNT(*) AS c FROM journal_entries WHERE created_by = ?",
      ctx.id
    );

    const matched = await app.inject({
      method: "POST",
      url: "/api/reconciliation/match",
      headers: auth(ctx.token),
      payload: { bankRowId: row.id, journalLineId: line.lineId },
    });
    const matchId = matched.json().data.id;

    const unmatchRes = await app.inject({
      method: "POST",
      url: "/api/reconciliation/unmatch",
      headers: auth(ctx.token),
      payload: { matchId },
    });
    expect(unmatchRes.statusCode).toBe(200);
    expect(unmatchRes.json().data.unmatch).toBe(true);
    expect(auditCount(ctx.id, "reconciliation.unmatch")).toBe(1);
    expect(countForLocal("reconciliation_matches", ctx.id)).toBe(0);

    // Journal is untouched — matching/unmatching is link bookkeeping only.
    expect(all<{ c: number }>("SELECT COUNT(*) AS c FROM journal_lines WHERE created_by = ?", ctx.id)[0].c).toBe(
      journalBefore[0].c
    );
    expect(
      all<{ c: number }>("SELECT COUNT(*) AS c FROM journal_entries WHERE created_by = ?", ctx.id)[0].c
    ).toBe(entriesBefore[0].c);

    // Rematch works after unmatching.
    const rematch = await app.inject({
      method: "POST",
      url: "/api/reconciliation/match",
      headers: auth(ctx.token),
      payload: { bankRowId: row.id, journalLineId: line.lineId },
    });
    expect(rematch.statusCode).toBe(200);
    expect(countForLocal("reconciliation_matches", ctx.id)).toBe(1);
  });

  it("unmatch 404s for a foreign match id", async () => {
    const a = seedUser();
    const b = seedUser();
    await importStatement(a.id, CSV_BASIC);
    const [aRow] = await listStatementRows(a.id);
    const aLine = await seedBankLine(a.id, 1500.5, "2026-06-14");
    const matched = await app.inject({
      method: "POST",
      url: "/api/reconciliation/match",
      headers: auth(a.token),
      payload: { bankRowId: aRow.id, journalLineId: aLine.lineId },
    });
    const matchId = matched.json().data.id;

    const res = await app.inject({
      method: "POST",
      url: "/api/reconciliation/unmatch",
      headers: auth(b.token),
      payload: { matchId },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toContain("Match not found");
    expect(countForLocal("reconciliation_matches", a.id)).toBe(1);
  });

  it("rejects malformed match payloads with 400", async () => {
    const ctx = seedUser();
    const res = await app.inject({
      method: "POST",
      url: "/api/reconciliation/match",
      headers: auth(ctx.token),
      payload: { bankRowId: "" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Validation error");
  });
});

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------
describe("reconciliation status", () => {
  it("counts rows and unmatched lines on both sides through a full cycle", async () => {
    const ctx = seedUser();
    await importStatement(
      ctx.id,
      [
        "Date,Reference,Description,Amount",
        "01/08/2026,UPI-1,In one,100",
        "02/08/2026,UPI-2,In two,200",
        "03/08/2026,UPI-3,In three,300",
      ].join("\n")
    );
    const lineOne = await seedBankLine(ctx.id, 100, "2026-08-01");
    const lineTwo = await seedBankLine(ctx.id, 200, "2026-08-02");
    const rows = await listStatementRows(ctx.id);

    const status = async (url = "/api/reconciliation/status?from=2026-08-01&to=2026-08-31") => {
      const res = await app.inject({ method: "GET", url, headers: auth(ctx.token) });
      expect(res.statusCode).toBe(200);
      return res.json().data;
    };

    const initial = await status();
    expect(initial.totals).toEqual({
      statementRows: 3,
      matched: 0,
      unmatchedRows: 3,
      unmatchedJournalLines: 2,
    });
    expect(initial.unmatchedRows).toHaveLength(3);
    expect(initial.unmatchedJournalLines).toHaveLength(2);
    expect(initial.from).toBe("2026-08-01");

    await app.inject({
      method: "POST",
      url: "/api/reconciliation/match",
      headers: auth(ctx.token),
      payload: { bankRowId: rows[0].id, journalLineId: lineOne.lineId },
    });
    const afterOne = await status();
    expect(afterOne.totals.matched).toBe(1);
    expect(afterOne.totals.unmatchedRows).toBe(2);
    expect(afterOne.totals.unmatchedJournalLines).toBe(1);

    await app.inject({
      method: "POST",
      url: "/api/reconciliation/match",
      headers: auth(ctx.token),
      payload: { bankRowId: rows[1].id, journalLineId: lineTwo.lineId },
    });
    const afterTwo = await status();
    expect(afterTwo.totals).toEqual({
      statementRows: 3,
      matched: 2,
      unmatchedRows: 1,
      unmatchedJournalLines: 0,
    });
    expect(afterTwo.unmatchedRows.map((row: any) => row.reference)).toEqual(["UPI-3"]);

    // Rows outside the range are not counted.
    const july = await status("/api/reconciliation/status?from=2026-07-01&to=2026-07-31");
    expect(july.totals.statementRows).toBe(0);
    expect(july.totals.unmatchedJournalLines).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------
describe("roles", () => {
  it("cashier is read-only: import/match/unmatch → 403, books still readable", async () => {
    const admin = seedUser();
    await importStatement(admin.id, CSV_BASIC);
    const [row] = await listStatementRows(admin.id);
    const line = await seedBankLine(admin.id, 1500.5, "2026-06-14");

    const cashier = seedUser();
    setRole(cashier.id, "cashier");

    const read = await app.inject({
      method: "GET",
      url: "/api/reconciliation/cash",
      headers: auth(cashier.token),
    });
    expect(read.statusCode).toBe(200);

    const importRes = await app.inject({
      method: "POST",
      url: "/api/reconciliation/import",
      headers: auth(cashier.token),
      payload: { csv: CSV_BASIC },
    });
    expect(importRes.statusCode).toBe(403);
    expect(importRes.json().error).toBe("Insufficient permissions");

    const matchRes = await app.inject({
      method: "POST",
      url: "/api/reconciliation/match",
      headers: auth(cashier.token),
      payload: { bankRowId: row.id, journalLineId: line.lineId, force: true, notes: "cashier force attempt" },
    });
    expect(matchRes.statusCode).toBe(403);

    // A pharmacist can import and match.
    const pharmacist = seedUser();
    setRole(pharmacist.id, "pharmacist");
    const pharmacistMatch = await app.inject({
      method: "POST",
      url: "/api/reconciliation/match",
      headers: auth(pharmacist.token),
      payload: { bankRowId: row.id, journalLineId: line.lineId },
    });
    // The row belongs to the admin, not the pharmacist → 404 (tenant scope
    // applies before role), and importing still works for a pharmacist.
    expect(pharmacistMatch.statusCode).toBe(404);
    const pharmacistImport = await app.inject({
      method: "POST",
      url: "/api/reconciliation/import",
      headers: auth(pharmacist.token),
      payload: { csv: CSV_BASIC },
    });
    expect(pharmacistImport.statusCode).toBe(201);
    expect(pharmacistImport.json().data.imported).toBe(2);
  });

  it("cashier cannot unmatch", async () => {
    const admin = seedUser();
    await importStatement(admin.id, CSV_BASIC);
    const [row] = await listStatementRows(admin.id);
    const line = await seedBankLine(admin.id, 1500.5, "2026-06-14");
    const matched = await app.inject({
      method: "POST",
      url: "/api/reconciliation/match",
      headers: auth(admin.token),
      payload: { bankRowId: row.id, journalLineId: line.lineId },
    });
    expect(matched.statusCode).toBe(200);
    const matchId = matched.json().data.id;

    const cashier = seedUser();
    setRole(cashier.id, "cashier");
    const res = await app.inject({
      method: "POST",
      url: "/api/reconciliation/unmatch",
      headers: auth(cashier.token),
      payload: { matchId },
    });
    expect(res.statusCode).toBe(403);
    expect(countForLocal("reconciliation_matches", admin.id)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Tenant isolation across every route
// ---------------------------------------------------------------------------
describe("tenant isolation", () => {
  it("user B sees none of user A's books, rows, status or matches", async () => {
    const a = seedUser();
    const b = seedUser();

    await post(a.id, {
      date: "2026-09-02",
      sourceType: "manual",
      lines: [
        { code: "CASH", debit: 800 },
        { code: "CAPITAL", credit: 800 },
      ],
    });
    await post(a.id, {
      date: "2026-09-03",
      sourceType: "manual",
      lines: [
        { code: "BANK", debit: 600 },
        { code: "CAPITAL", credit: 600 },
      ],
    });
    await importStatement(a.id, CSV_BASIC);
    const [aRow] = await listStatementRows(a.id);
    const aLine = await seedBankLine(a.id, 1500.5, "2026-06-14");
    const aMatch = await app.inject({
      method: "POST",
      url: "/api/reconciliation/match",
      headers: auth(a.token),
      payload: { bankRowId: aRow.id, journalLineId: aLine.lineId },
    });
    expect(aMatch.statusCode).toBe(200);
    const aMatchId = aMatch.json().data.id;

    // Books: B's cash/bank books are empty in A's range.
    const cash = await app.inject({
      method: "GET",
      url: "/api/reconciliation/cash?from=2026-09-01&to=2026-09-30",
      headers: auth(b.token),
    });
    expect(cash.statusCode).toBe(200);
    expect(cash.json().data.rows).toHaveLength(0);
    expect(cash.json().data.inflow).toBe(0);
    expect(cash.json().data.closing).toBe(0);

    const bank = await app.inject({
      method: "GET",
      url: "/api/reconciliation/bank?from=2026-09-01&to=2026-09-30",
      headers: auth(b.token),
    });
    expect(bank.json().data.rows).toHaveLength(0);
    expect(bank.json().data.inflow).toBe(0);

    // Rows: B has none of A's statement rows.
    const rows = await app.inject({
      method: "GET",
      url: "/api/reconciliation/rows",
      headers: auth(b.token),
    });
    expect(rows.statusCode).toBe(200);
    expect(rows.json().data).toHaveLength(0);
    expect(countForLocal("bank_statement_rows", b.id)).toBe(0);

    // Status: zeroed totals + empty lists.
    const status = await app.inject({
      method: "GET",
      url: "/api/reconciliation/status?from=2026-06-01&to=2026-09-30",
      headers: auth(b.token),
    });
    expect(status.json().data.totals).toEqual({
      statementRows: 0,
      matched: 0,
      unmatchedRows: 0,
      unmatchedJournalLines: 0,
    });
    expect(status.json().data.unmatchedRows).toHaveLength(0);
    expect(status.json().data.unmatchedJournalLines).toHaveLength(0);

    // Suggest / match / unmatch: A's ids 404 for B.
    const suggest = await app.inject({
      method: "GET",
      url: `/api/reconciliation/suggest?bankRowId=${aRow.id}`,
      headers: auth(b.token),
    });
    expect(suggest.statusCode).toBe(404);

    const match = await app.inject({
      method: "POST",
      url: "/api/reconciliation/match",
      headers: auth(b.token),
      payload: { bankRowId: aRow.id, journalLineId: aLine.lineId },
    });
    expect(match.statusCode).toBe(404);

    const unmatch = await app.inject({
      method: "POST",
      url: "/api/reconciliation/unmatch",
      headers: auth(b.token),
      payload: { matchId: aMatchId },
    });
    expect(unmatch.statusCode).toBe(404);

    // A's data is intact.
    expect(countForLocal("bank_statement_rows", a.id)).toBe(2);
    expect(countForLocal("reconciliation_matches", a.id)).toBe(1);
    const aCash = await cashBook(a.id, "2026-09-01", "2026-09-30");
    expect(aCash.inflow).toBeCloseTo(800, 2);
  });
});

// ---------------------------------------------------------------------------
// Import edge cases
// ---------------------------------------------------------------------------
describe("import edge cases", () => {
  it("normalizes ISO and DD-MM-YYYY dates", async () => {
    const ctx = seedUser();
    const csv = ["Date,Description,Amount", "2026-09-10,ISO date,10", "11-09-2026,Dash date,20"].join("\n");
    const result = await importStatement(ctx.id, csv);
    expect(result.imported).toBe(2);

    const rows = await listStatementRows(ctx.id);
    expect(rows.map((row) => row.statementDate)).toEqual(["2026-09-10", "2026-09-11"]);
    expect(rows.map((row) => row.amount)).toEqual([10, 20]);
  });

  it("falls back to positional columns when the file has no header", async () => {
    const ctx = seedUser();
    const csv = "07/09/2026,UPI-42,Wallet top-up,1200";
    const result = await importStatement(ctx.id, csv);
    expect(result.imported).toBe(1);
    expect(result.skipped).toHaveLength(0);

    const [row] = await listStatementRows(ctx.id);
    expect(row.statementDate).toBe("2026-09-07");
    expect(row.reference).toBe("UPI-42");
    expect(row.description).toBe("Wallet top-up");
    expect(row.amount).toBeCloseTo(1200, 2);
    expect(row.direction).toBe("in");
  });

  it("counts duplicate rows inside a single file as duplicates", async () => {
    const ctx = seedUser();
    const csv = [
      "Date,Description,Amount",
      "12/09/2026,Same row,640",
      "12/09/2026,Same row,640",
    ].join("\n");
    const result = await importStatement(ctx.id, csv);
    expect(result.imported).toBe(1);
    expect(result.duplicates).toBe(1);
    expect(countForLocal("bank_statement_rows", ctx.id)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Suggestion edge cases
// ---------------------------------------------------------------------------
describe("suggestion edge cases", () => {
  it("returns at most five candidates", async () => {
    const ctx = seedUser();
    for (let i = 0; i < 7; i++) {
      await seedBankLine(ctx.id, 750, `2026-09-0${Math.min(9, i + 3)}`);
    }
    await importStatement(ctx.id, ["Date,Description,Amount", "06/09/2026,Incoming,750"].join("\n"));
    const [row] = await listStatementRows(ctx.id);

    const res = await app.inject({
      method: "GET",
      url: `/api/reconciliation/suggest?bankRowId=${row.id}`,
      headers: auth(ctx.token),
    });
    expect(res.statusCode).toBe(200);
    const candidates = res.json().data.candidates;
    expect(candidates).toHaveLength(5);
    expect(candidates.every((c: any) => c.confidence === 0.9)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// HTTP guards + amount tolerance
// ---------------------------------------------------------------------------
describe("http guards", () => {
  it("every reconciliation route requires an auth token", async () => {
    const calls: Array<{ method: "GET" | "POST"; url: string; payload?: unknown }> = [
      { method: "GET", url: "/api/reconciliation/cash" },
      { method: "GET", url: "/api/reconciliation/bank" },
      { method: "GET", url: "/api/reconciliation/rows" },
      { method: "GET", url: "/api/reconciliation/status" },
      { method: "GET", url: "/api/reconciliation/suggest?bankRowId=x" },
      { method: "POST", url: "/api/reconciliation/import", payload: { csv: "Date,Amount" } },
      { method: "POST", url: "/api/reconciliation/match", payload: { bankRowId: "a", journalLineId: "b" } },
      { method: "POST", url: "/api/reconciliation/unmatch", payload: { matchId: "m" } },
    ];
    for (const call of calls) {
      const res = await app.inject({ method: call.method, url: call.url, payload: call.payload as any });
      expect(res.statusCode, `${call.method} ${call.url}`).toBe(401);
    }
  });

  it("accepts a match within a one-paisa tolerance", async () => {
    const ctx = seedUser();
    await importStatement(ctx.id, ["Date,Description,Amount", "14/09/2026,In,100.01"].join("\n"));
    const [row] = await listStatementRows(ctx.id);
    const line = await seedBankLine(ctx.id, 100, "2026-09-13");

    const res = await app.inject({
      method: "POST",
      url: "/api/reconciliation/match",
      headers: auth(ctx.token),
      payload: { bankRowId: row.id, journalLineId: line.lineId },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.forced).toBe(false);
  });

  it("excludes matched rows from unreconciledOnly=true listings", async () => {
    const ctx = seedUser();
    await importStatement(ctx.id, CSV_BASIC);
    const rows = await listStatementRows(ctx.id);
    const line = await seedBankLine(ctx.id, 1500.5, "2026-06-14");

    const before = await app.inject({
      method: "GET",
      url: "/api/reconciliation/rows?unreconciledOnly=true",
      headers: auth(ctx.token),
    });
    expect(before.json().data).toHaveLength(2);

    await app.inject({
      method: "POST",
      url: "/api/reconciliation/match",
      headers: auth(ctx.token),
      payload: { bankRowId: rows[0].id, journalLineId: line.lineId },
    });

    const after = await app.inject({
      method: "GET",
      url: "/api/reconciliation/rows?unreconciledOnly=true",
      headers: auth(ctx.token),
    });
    expect(after.json().data).toHaveLength(1);
    expect(after.json().data[0].id).toBe(rows[1].id);
    expect(after.json().data[0].matched).toBe(false);

    const all = await app.inject({
      method: "GET",
      url: "/api/reconciliation/rows",
      headers: auth(ctx.token),
    });
    expect(all.json().data.filter((row: any) => row.matched)).toHaveLength(1);
  });
});
