import { beforeAll, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import { applySchema, dbPath, seedCustomer, seedMedicine, seedUser, type SeededUser } from "./helpers.js";
import accountingRoutes from "../src/routes/accounting.js";
import { balanceSheet, post, profitLoss, suggestOpeningLines, trialBalance } from "../src/services/accounting.js";

let app: FastifyInstance;

const auth = (u: SeededUser) => ({ authorization: `Bearer ${u.token}` });

function run(sql: string, ...params: any[]): void {
  const db = new Database(dbPath());
  try {
    db.prepare(sql).run(...params);
  } finally {
    db.close();
  }
}

function all<T = any>(sql: string, ...params: any[]): T[] {
  const db = new Database(dbPath());
  try {
    return db.prepare(sql).all(...params) as T[];
  } finally {
    db.close();
  }
}

const setRole = (userId: string, role: string) => run("UPDATE users SET role = ? WHERE id = ?", role, userId);

function seedSupplier(ownerId: string, name: string, balance = 0): string {
  const id = `sup-${nanoid(10)}`;
  const now = Date.now();
  run(
    `INSERT INTO suppliers (id, name, balance, is_active, created_by, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?, ?)`,
    id,
    name,
    balance,
    ownerId,
    now,
    now
  );
  return id;
}

function postOpening(u: SeededUser, date: string, lines: Array<{ code: string; debit?: number; credit?: number }>) {
  return app.inject({
    method: "POST",
    url: "/api/accounting/opening",
    headers: auth(u),
    payload: { date, lines },
  });
}

const balancedOpening = () => [
  { code: "INVENTORY", debit: 1000 },
  { code: "CAPITAL", credit: 1000 },
];

const code0Credit = () => ({ code: "CAPITAL", credit: 1 });

beforeAll(async () => {
  applySchema();
  app = Fastify({ logger: false });
  await app.register(accountingRoutes, { prefix: "/api/accounting" });
});

describe("POST /api/accounting/opening", () => {
  it("posts a balanced opening entry with a date-keyed source id", async () => {    const u = seedUser();
    const res = await postOpening(u, "2026-04-01", balancedOpening());
    expect(res.statusCode).toBe(201);
    expect(res.json().data.alreadyPosted).toBe(false);

    const entries = all(
      "SELECT * FROM journal_entries WHERE created_by = ? AND source_type = 'opening'",
      u.id
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].source_id).toBe("opening:2026-04-01");
    expect(entries[0].date).toBe("2026-04-01");

    const lines = all<{ code: string; debit: number; credit: number }>(
      `SELECT a.code, jl.debit, jl.credit FROM journal_lines jl
       JOIN accounts a ON a.id = jl.account_id WHERE jl.entry_id = ? ORDER BY a.code`,
      entries[0].id
    );
    expect(lines.find((l) => l.code === "INVENTORY")!.debit).toBeCloseTo(1000, 2);
    expect(lines.find((l) => l.code === "CAPITAL")!.credit).toBeCloseTo(1000, 2);
  });

  it("rejects an unbalanced opening with 400", async () => {
    const u = seedUser();
    const res = await postOpening(u, "2026-04-02", [
      { code: "INVENTORY", debit: 500 },
      { code: "CAPITAL", credit: 400 },
    ]);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("not balanced");
    expect(
      all("SELECT id FROM journal_entries WHERE created_by = ? AND source_type = 'opening'", u.id)
    ).toHaveLength(0);
  });

  it("rejects a duplicate date with 400 'Opening balances already posted'", async () => {
    const u = seedUser();
    const first = await postOpening(u, "2026-04-03", balancedOpening());
    expect(first.statusCode).toBe(201);

    const second = await postOpening(u, "2026-04-03", balancedOpening());
    expect(second.statusCode).toBe(400);
    expect(second.json().error).toContain("Opening balances already posted for 2026-04-03");

    expect(
      all("SELECT id FROM journal_entries WHERE created_by = ? AND source_type = 'opening'", u.id)
    ).toHaveLength(1);
  });

  it("rejects a date inside a closed period with 400 'Period closed'", async () => {
    const u = seedUser();
    const close = await app.inject({
      method: "POST",
      url: "/api/accounting/periods/close",
      headers: auth(u),
      payload: { fromDate: "2026-03-01", toDate: "2026-03-31" },
    });
    expect(close.statusCode).toBe(201);

    const res = await postOpening(u, "2026-03-15", balancedOpening());
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("Period closed");
    expect(
      all("SELECT id FROM journal_entries WHERE created_by = ? AND source_type = 'opening'", u.id)
    ).toHaveLength(0);
  });

  it("cashier gets 403; admin posts", async () => {
    const cashier = seedUser();
    setRole(cashier.id, "cashier");
    const denied = await postOpening(cashier, "2026-04-04", balancedOpening());
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error).toMatch(/permission/i);

    const admin = seedUser();
    const ok = await postOpening(admin, "2026-04-04", balancedOpening());
    expect(ok.statusCode).toBe(201);
  });

  it("posting the same (createdBy, 'opening', opening:<date>) key twice is idempotent at the service level", async () => {
    const u = seedUser();
    const res = await postOpening(u, "2026-04-05", balancedOpening());
    expect(res.statusCode).toBe(201);

    // The raw post() core short-circuits on the same source key...
    const again = await post(u.id, {
      date: "2026-04-05",
      sourceType: "opening",
      sourceId: "opening:2026-04-05",
      lines: [{ code: "CASH", debit: 1 }, code0Credit()],
    });
    expect(again.alreadyPosted).toBe(true);

    // ...and the guarded route refuses with 400 (covered above). Either way
    // only one entry ever exists for the key.
    const entries = all(
      "SELECT id FROM journal_entries WHERE created_by = ? AND source_type = 'opening' AND source_id = 'opening:2026-04-05'",
      u.id
    );
    expect(entries).toHaveLength(1);
  });
});

describe("GET /api/accounting/opening/suggest", () => {
  it("suggests INVENTORY/AR/AP from current stock + ledgers with CAPITAL balancing", async () => {
    const u = seedUser();

    // Stock: two batches with known purchase prices.
    const med = seedMedicine(u.id, { quantity: 10, batches: [{ quantity: 4 }] });
    run("UPDATE batches SET purchase_price = 10 WHERE medicine_id = ? AND batch_no = 'B1'", med.medicineId);
    run("UPDATE batches SET purchase_price = 25 WHERE medicine_id = ? AND batch_no = 'B2'", med.medicineId);
    const inventoryValue = 10 * 10 + 25 * 4; // 200

    // Customers: one positive (counts), one negative (ignored).
    const custPos = seedCustomer(u.id, { name: "Owed" });
    const custNeg = seedCustomer(u.id, { name: "Advance" });
    run("UPDATE customers SET balance = 500 WHERE id = ?", custPos.id);
    run("UPDATE customers SET balance = -80 WHERE id = ?", custNeg.id);

    // Suppliers: one positive (counts), one negative (ignored).
    seedSupplier(u.id, "Payable Ltd", 300);
    seedSupplier(u.id, "Advance Ltd", -50);

    const res = await app.inject({
      method: "GET",
      url: "/api/accounting/opening/suggest",
      headers: auth(u),
    });
    expect(res.statusCode).toBe(200);
    const lines = res.json().data.lines as Array<{ code: string; debit: number; credit: number }>;

    const lineFor = (code: string) => lines.find((l) => l.code === code)!;
    expect(lineFor("INVENTORY").debit).toBeCloseTo(inventoryValue, 2);
    expect(lineFor("AR").debit).toBeCloseTo(500, 2);
    expect(lineFor("AP").credit).toBeCloseTo(300, 2);
    expect(lineFor("CASH").debit).toBe(0); // cannot infer — UI leaves it editable
    expect(lineFor("CAPITAL").credit).toBeCloseTo(inventoryValue + 500 - 300, 2);

    // The suggestion is balanced as returned (filter zero rows before posting).
    const debits = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
    const credits = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
    expect(debits).toBeCloseTo(credits, 2);

    // Service and route agree.
    const svc = await suggestOpeningLines(u.id);
    expect(svc.find((l) => l.code === "INVENTORY")!.debit).toBeCloseTo(inventoryValue, 2);
  });
});

describe("trial balance opening columns", () => {
  it("carries opening balances into later ranges (opening > 0, movement 0, closing = opening)", async () => {
    const u = seedUser();
    const res = await postOpening(u, "2026-04-30", [
      { code: "INVENTORY", debit: 1000 },
      { code: "AR", debit: 250 },
      { code: "AP", credit: 150 },
      { code: "CAPITAL", credit: 1100 },
    ]);
    expect(res.statusCode).toBe(201);

    // A range starting after the opening date: columns show the carry-forward.
    const tb = await app.inject({
      method: "GET",
      url: "/api/accounting/trial-balance?from=2026-06-01&to=2026-06-30",
      headers: auth(u),
    });
    expect(tb.statusCode).toBe(200);
    const data = tb.json().data;
    const inv = data.rows.find((r: any) => r.code === "INVENTORY");
    expect(inv.openingDebit).toBeCloseTo(1000, 2);
    expect(inv.openingCredit).toBe(0);
    expect(inv.debit).toBe(0); // no movement inside June
    expect(inv.credit).toBe(0);
    expect(inv.balance).toBe(0); // legacy key = movement only (backward compatible)
    expect(inv.closing).toBeCloseTo(1000, 2);

    const ap = data.rows.find((r: any) => r.code === "AP");
    expect(ap.openingCredit).toBeCloseTo(150, 2);
    expect(ap.openingDebit).toBe(0);
    expect(ap.closing).toBeCloseTo(150, 2); // liability: positive = credit side

    // Totals: opening debits == opening credits, closing debits == closing credits.
    expect(data.totals.totalOpeningDebit).toBeCloseTo(1250, 2);
    expect(data.totals.totalOpeningCredit).toBeCloseTo(1250, 2);
    expect(data.totals.totalClosingDebit).toBeCloseTo(data.totals.totalClosingCredit, 2);
    // Legacy totals untouched (movement only).
    expect(data.totals.totalDebit).toBe(0);
    expect(data.totals.totalCredit).toBe(0);
    expect(data.totals.netIncome).toBe(0);
  });

  it("opening + in-range movement combine into closing, and a range covering the opening shows it as movement", async () => {
    const u = seedUser();
    await postOpening(u, "2026-04-30", [
      { code: "CASH", debit: 700 },
      { code: "CAPITAL", credit: 700 },
    ]);
    // A May expense: Dr EXPENSE 100 / Cr CASH 100.
    await post(u.id, {
      date: "2026-05-10",
      sourceType: "manual",
      lines: [
        { code: "EXPENSE", debit: 100 },
        { code: "CASH", credit: 100 },
      ],
    });

    const tb = await app.inject({
      method: "GET",
      url: "/api/accounting/trial-balance?from=2026-05-01&to=2026-05-31",
      headers: auth(u),
    });
    const data = tb.json().data;
    const cash = data.rows.find((r: any) => r.code === "CASH");
    expect(cash.openingDebit).toBeCloseTo(700, 2);
    expect(cash.debit).toBe(0);
    expect(cash.credit).toBeCloseTo(100, 2);
    expect(cash.balance).toBeCloseTo(-100, 2); // legacy: movement only
    expect(cash.closing).toBeCloseTo(600, 2); // opening + movement, signed by nature

    // A range that COVERS the opening date shows it as plain movement (no
    // double counting): full history still balances.
    const full = await trialBalance(u.id, "2026-04-01", "2026-05-31");
    expect(full.totals.totalDebit).toBeCloseTo(full.totals.totalCredit, 2);
    expect(full.totals.totalDebit).toBeCloseTo(800, 2);
    const fullCash = full.rows.find((r) => r.code === "CASH")!;
    expect(fullCash.balance).toBeCloseTo(600, 2);
    expect(fullCash.openingDebit).toBe(0); // nothing before 2026-04-01
    expect(fullCash.closing).toBeCloseTo(600, 2);
  });

  it("keeps rows balanced across opening totals (opening debits == opening credits)", async () => {
    const u = seedUser();
    await postOpening(u, "2026-01-31", [
      { code: "INVENTORY", debit: 5000 },
      { code: "CASH", debit: 500 },
      { code: "AR", debit: 250 },
      { code: "AP", credit: 750 },
      { code: "CAPITAL", credit: 5000 },
    ]);
    const tb = await trialBalance(u.id, "2026-02-01", "2026-02-28");
    expect(tb.totals.totalOpeningDebit).toBeCloseTo(tb.totals.totalOpeningCredit, 2);
    expect(tb.totals.totalClosingDebit).toBeCloseTo(tb.totals.totalClosingCredit, 2);
    expect(tb.totals.totalDebit).toBeCloseTo(tb.totals.totalCredit, 2);
  });
});

describe("opening suggestion & backward compatibility", () => {
  it("a fresh tenant gets zeroed suggestions that are still balanced", async () => {
    const u = seedUser();
    const res = await app.inject({
      method: "GET",
      url: "/api/accounting/opening/suggest",
      headers: auth(u),
    });
    expect(res.statusCode).toBe(200);
    const lines = res.json().data.lines as Array<{ code: string; debit: number; credit: number }>;
    const lineFor = (code: string) => lines.find((l) => l.code === code)!;
    expect(lineFor("INVENTORY").debit).toBe(0);
    expect(lineFor("AR").debit).toBe(0);
    expect(lineFor("AP").credit).toBe(0);
    expect(lineFor("CASH").debit).toBe(0);
    expect(lineFor("CAPITAL")).toBeTruthy();
    const debits = lines.reduce((s, l) => s + l.debit, 0);
    const credits = lines.reduce((s, l) => s + l.credit, 0);
    expect(debits).toBeCloseTo(credits, 2);
  });

  it("keeps the legacy trial-balance keys and never adds opening keys to P&L / balance-sheet rows", async () => {
    const u = seedUser();
    await post(u.id, {
      date: "2026-02-05",
      sourceType: "manual",
      lines: [
        { code: "CASH", debit: 100 },
        { code: "SALES", credit: 100 },
      ],
    });

    const tb = await trialBalance(u.id, "2026-02-01", "2026-02-28");
    const cash = tb.rows.find((r) => r.code === "CASH")!;
    // Legacy keys intact (additive-only change).
    expect(cash.debit).toBeCloseTo(100, 2);
    expect(cash.credit).toBe(0);
    expect(cash.balance).toBeCloseTo(100, 2);
    expect(tb.totals.totalDebit).toBeCloseTo(100, 2);
    expect(tb.totals.totalCredit).toBeCloseTo(100, 2);
    expect(typeof tb.totals.netIncome).toBe("number");

    const pl = await profitLoss(u.id, "2026-02-01", "2026-02-28");
    expect(pl.income[0]).not.toHaveProperty("openingDebit");
    expect(pl.income[0]).not.toHaveProperty("closing");
    const bs = await balanceSheet(u.id, "2026-02-28");
    expect(bs.assets[0] ?? bs.liabilities[0] ?? bs.equity[0]).not.toHaveProperty("openingDebit");
  });

  it("cashiers can read the suggestion (GET) even though POST is 403", async () => {
    const cashier = seedUser();
    setRole(cashier.id, "cashier");
    const res = await app.inject({
      method: "GET",
      url: "/api/accounting/opening/suggest",
      headers: auth(cashier),
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().data.lines)).toBe(true);
  });
});
