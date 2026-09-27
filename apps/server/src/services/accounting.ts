import { and, eq, gte, gt, lt, lte, sql, inArray, asc, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  accounts,
  journalEntries,
  journalLines,
  accountingPeriods,
  batches,
  customers,
  suppliers,
  generateId,
  type Account,
  type AccountType,
  type JournalPartyType,
} from "../db/schema/index.js";
import { auditEvents } from "./audit.js";

/**
 * Double-entry accounting core (Task 11).
 *
 * Design notes:
 * - The write path (`postSync`/`reverseOn`/`ensureChartOn`) is SYNCHRONOUS:
 *   better-sqlite3's `db.transaction()` rejects callbacks that return a
 *   promise, so ledger writes that must share an existing transaction (the
 *   invoice sale transaction) cannot be async. The public `post`/`reverse`
 *   wrappers are async for route convenience and delegate to the sync core.
 * - Every function takes an optional handle (`db` or a drizzle transaction
 *   object). When the caller passes a transaction, the ledger write commits
 *   atomically with the business write.
 * - Entries are append-only. Cancelling a source inserts a mirrored reversal
 *   entry (debit<->credit) instead of deleting anything; `reversed_by` links
 *   the original to its reversal and makes reversal idempotent.
 * - Amounts are rounded to 2 decimals; balance tolerance is ₹0.01.
 */

export const SYSTEM_ACCOUNTS: Array<{ code: string; name: string; type: AccountType }> = [
  { code: "CASH", name: "Cash", type: "asset" },
  { code: "BANK", name: "Bank", type: "asset" },
  { code: "AR", name: "Accounts Receivable", type: "asset" },
  { code: "AP", name: "Accounts Payable", type: "liability" },
  { code: "INVENTORY", name: "Inventory", type: "asset" },
  { code: "SALES", name: "Sales", type: "income" },
  { code: "PURCHASES", name: "Purchases", type: "expense" },
  { code: "SALES_RETURNS", name: "Sales Returns", type: "expense" },
  { code: "PURCHASE_RETURNS", name: "Purchase Returns", type: "income" },
  { code: "GST_OUTPUT", name: "Output GST", type: "liability" },
  { code: "GST_INPUT", name: "Input GST", type: "asset" },
  { code: "DISCOUNT", name: "Discounts", type: "expense" },
  { code: "EXPENSE", name: "Expenses", type: "expense" },
  { code: "CAPITAL", name: "Capital", type: "equity" },
];

/** Drizzle's better-sqlite3 transaction handle exposes the same builders as `db`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handle = typeof db | any;

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const BALANCE_TOLERANCE = 0.01;

/** Validation/permission error carrying the HTTP status the route should send. */
export class AccountingError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "AccountingError";
    this.statusCode = statusCode;
  }
}

export interface JournalLineInput {
  code: string;
  debit?: number;
  credit?: number;
  partyType?: JournalPartyType;
  partyId?: string;
  memo?: string;
}

export interface PostInput {
  date: string;
  sourceType: string;
  sourceId?: string | null;
  description?: string;
  lines: JournalLineInput[];
}

export interface PostResult {
  alreadyPosted: boolean;
  entryId: string;
  entry: EntryWithLines;
}

export interface EntryWithLines {
  id: string;
  date: string;
  sourceType: string;
  sourceId: string | null;
  description: string | null;
  isReversal: boolean;
  reversedBy: string | null;
  lines: Array<{
    id: string;
    accountId: string;
    code: string;
    name: string;
    type: AccountType;
    debit: number;
    credit: number;
    partyType: JournalPartyType | null;
    partyId: string | null;
    memo: string | null;
  }>;
}

// ---------------------------------------------------------------------------
// Chart of accounts
// ---------------------------------------------------------------------------

/** Idempotent: insert any of the 14 system accounts the tenant is missing. */
export function ensureChartOn(handle: Handle, userId: string): void {
  const existing = handle
    .select({ code: accounts.code })
    .from(accounts)
    .where(eq(accounts.createdBy, userId))
    .all() as Array<{ code: string }>;
  const have = new Set(existing.map((row) => row.code));
  const missing = SYSTEM_ACCOUNTS.filter((acc) => !have.has(acc.code));
  if (missing.length === 0) return;
  const now = new Date();
  for (const acc of missing) {
    handle
      .insert(accounts)
      .values({
        id: generateId(),
        createdBy: userId,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        isSystem: true,
        createdAt: now,
      })
      .run();
  }
}

export async function ensureChart(userId: string): Promise<Account[]> {
  ensureChartOn(db, userId);
  return getAccounts(userId);
}

export async function getAccounts(userId: string): Promise<Account[]> {
  ensureChartOn(db, userId);
  return db
    .select()
    .from(accounts)
    .where(eq(accounts.createdBy, userId))
    .orderBy(asc(accounts.code))
    .all();
}

export async function createAccount(
  userId: string,
  input: { code: string; name: string; type: AccountType }
): Promise<Account> {
  ensureChartOn(db, userId);
  const code = input.code.trim().toUpperCase();
  try {
    const [row] = await db
      .insert(accounts)
      .values({
        id: generateId(),
        createdBy: userId,
        code,
        name: input.name.trim(),
        type: input.type,
        isSystem: false,
        createdAt: new Date(),
      })
      .returning();
    return row;
  } catch (err: any) {
    if (typeof err?.message === "string" && /UNIQUE constraint failed/i.test(err.message)) {
      throw new AccountingError(409, "Account code already exists");
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Posting
// ---------------------------------------------------------------------------

function resolveAccountIds(handle: Handle, userId: string, codes: string[]): Map<string, Account> {
  const unique = [...new Set(codes)];
  const rows = handle
    .select()
    .from(accounts)
    .where(and(eq(accounts.createdBy, userId), inArray(accounts.code, unique)))
    .all() as Account[];
  const byCode = new Map(rows.map((row) => [row.code, row]));
  const missing = unique.filter((code) => !byCode.has(code));
  if (missing.length > 0) {
    throw new AccountingError(400, `Unknown account code: ${missing[0]}`);
  }
  return byCode;
}

function assertOpenPeriod(handle: Handle, userId: string, date: string): void {
  const rows = handle
    .select({ id: accountingPeriods.id })
    .from(accountingPeriods)
    .where(
      and(
        eq(accountingPeriods.createdBy, userId),
        lte(accountingPeriods.fromDate, date),
        gte(accountingPeriods.toDate, date)
      )
    )
    .limit(1)
    .all() as Array<{ id: string }>;
  if (rows.length > 0) throw new AccountingError(400, "Period closed");
}

function loadEntry(handle: Handle, entryId: string): EntryWithLines {
  const entryRows = handle
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.id, entryId))
    .limit(1)
    .all();
  const lineRows = handle
    .select({
      id: journalLines.id,
      accountId: journalLines.accountId,
      debit: journalLines.debit,
      credit: journalLines.credit,
      partyType: journalLines.partyType,
      partyId: journalLines.partyId,
      memo: journalLines.memo,
      code: accounts.code,
      name: accounts.name,
      type: accounts.type,
    })
    .from(journalLines)
    .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
    .where(eq(journalLines.entryId, entryId))
    .all();
  const entry = entryRows[0];
  return {
    id: entry.id,
    date: entry.date,
    sourceType: entry.sourceType,
    sourceId: entry.sourceId,
    description: entry.description,
    isReversal: !!entry.isReversal,
    reversedBy: entry.reversedBy,
    lines: lineRows.map((line: any) => ({
      id: line.id,
      accountId: line.accountId,
      code: line.code,
      name: line.name,
      type: line.type,
      debit: line.debit ?? 0,
      credit: line.credit ?? 0,
      partyType: line.partyType,
      partyId: line.partyId,
      memo: line.memo,
    })),
  };
}

/** Synchronous core — safe to call inside `db.transaction(...)` callbacks. */
export function postSync(handle: Handle, userId: string, input: PostInput): PostResult {
  ensureChartOn(handle, userId);

  if (input.sourceType && input.sourceId) {
    const existing = handle
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.createdBy, userId),
          eq(journalEntries.sourceType, input.sourceType),
          eq(journalEntries.sourceId, input.sourceId)
        )
      )
      .limit(1)
      .all() as Array<{ id: string }>;
    if (existing.length > 0) {
      return { alreadyPosted: true, entryId: existing[0].id, entry: loadEntry(handle, existing[0].id) };
    }
  }

  if (!input.lines || input.lines.length === 0) {
    throw new AccountingError(400, "Journal entry must have at least one line");
  }

  const byCode = resolveAccountIds(handle, userId, input.lines.map((line) => line.code));

  let totalDebit = 0;
  let totalCredit = 0;
  for (const line of input.lines) {
    const debit = round2(line.debit ?? 0);
    const credit = round2(line.credit ?? 0);
    if (debit < 0 || credit < 0) {
      throw new AccountingError(400, "Journal lines cannot be negative");
    }
    if (debit > 0 && credit > 0) {
      throw new AccountingError(400, "A journal line cannot have both a debit and a credit");
    }
    if (debit === 0 && credit === 0) {
      throw new AccountingError(400, "Each journal line must have a debit or a credit");
    }
    totalDebit += debit;
    totalCredit += credit;
  }
  if (Math.abs(totalDebit - totalCredit) > BALANCE_TOLERANCE) {
    throw new AccountingError(400, "Journal entry not balanced");
  }

  assertOpenPeriod(handle, userId, input.date);

  const entryId = generateId();
  const now = new Date();
  handle
    .insert(journalEntries)
    .values({
      id: entryId,
      createdBy: userId,
      date: input.date,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      description: input.description ?? null,
      isReversal: false,
      reversedBy: null,
      createdAt: now,
    })
    .run();

  for (const line of input.lines) {
    const account = byCode.get(line.code)!;
    handle
      .insert(journalLines)
      .values({
        id: generateId(),
        entryId,
        createdBy: userId,
        accountId: account.id,
        debit: round2(line.debit ?? 0),
        credit: round2(line.credit ?? 0),
        partyType: line.partyType ?? null,
        partyId: line.partyId ?? null,
        memo: line.memo ?? null,
      })
      .run();
  }

  return { alreadyPosted: false, entryId, entry: loadEntry(handle, entryId) };
}

/** Async wrapper over the sync core; pass a transaction handle to join one. */
export async function post(userId: string, input: PostInput, tx?: Handle): Promise<PostResult> {
  return postSync(tx ?? db, userId, input);
}

export interface ReverseInput {
  sourceType: string;
  sourceId: string;
  date: string;
  reason?: string;
}

export interface ReverseResult {
  found: boolean;
  alreadyReversed: boolean;
  entryId: string | null;
  originalId: string | null;
}

/** Synchronous reversal core (used by cancellations inside/outside transactions). */
export function reverseOn(handle: Handle, userId: string, input: ReverseInput): ReverseResult {
  ensureChartOn(handle, userId);
  const rows = handle
    .select()
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.createdBy, userId),
        eq(journalEntries.sourceType, input.sourceType),
        eq(journalEntries.sourceId, input.sourceId)
      )
    )
    .limit(1)
    .all();
  const original = rows[0];
  if (!original) return { found: false, alreadyReversed: false, entryId: null, originalId: null };
  if (original.reversedBy) {
    return { found: true, alreadyReversed: true, entryId: original.reversedBy, originalId: original.id };
  }

  const originalLines = handle
    .select()
    .from(journalLines)
    .where(eq(journalLines.entryId, original.id))
    .all();

  // The reversal carries its own source key ("reversal" + original entry id)
  // so the source uniqueness constraint can never collide with the original.
  const reversalId = generateId();
  const now = new Date();
  handle
    .insert(journalEntries)
    .values({
      id: reversalId,
      createdBy: userId,
      date: input.date,
      sourceType: "reversal",
      sourceId: original.id,
      description: input.reason
        ? `Reversal of ${input.sourceType} ${input.sourceId}: ${input.reason}`
        : `Reversal of ${input.sourceType} ${input.sourceId}`,
      isReversal: true,
      reversedBy: null,
      createdAt: now,
    })
    .run();

  for (const line of originalLines) {
    handle
      .insert(journalLines)
      .values({
        id: generateId(),
        entryId: reversalId,
        createdBy: userId,
        accountId: line.accountId,
        debit: line.credit ?? 0, // mirrored
        credit: line.debit ?? 0,
        partyType: line.partyType,
        partyId: line.partyId,
        memo: line.memo,
      })
      .run();
  }

  handle
    .update(journalEntries)
    .set({ reversedBy: reversalId })
    .where(eq(journalEntries.id, original.id))
    .run();

  return { found: true, alreadyReversed: false, entryId: reversalId, originalId: original.id };
}

/** Reverse the entry posted for a source (idempotent; no-op when never posted). */
export async function reverse(userId: string, input: ReverseInput): Promise<ReverseResult> {
  return reverseOn(db, userId, input);
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

interface MovementRow {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  debit: number;
  credit: number;
}

/**
 * Per-account debit/credit movement inside [from, to] (both optional bounds).
 * Joins lines to entries so the tenant/date filter lives on the entry.
 * NOTE: the movement columns of a trial balance row reflect movement strictly
 * inside the range; opening balances (entries dated BEFORE `from`) are
 * surfaced separately via `openingMovement` + the trial balance's
 * opening/closing columns (opening tooling landed with the Opening tab).
 */
function movement(userId: string, from?: string, to?: string): MovementRow[] {
  const conds = [eq(journalEntries.createdBy, userId)];
  if (from) conds.push(gte(journalEntries.date, from));
  if (to) conds.push(lte(journalEntries.date, to));
  const rows = db
    .select({
      accountId: accounts.id,
      code: accounts.code,
      name: accounts.name,
      type: accounts.type,
      debit: sql<number>`coalesce(sum(${journalLines.debit}), 0)`,
      credit: sql<number>`coalesce(sum(${journalLines.credit}), 0)`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
    .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
    .where(and(...conds))
    .groupBy(accounts.id, accounts.code, accounts.name, accounts.type)
    .all();
  return rows.map((row) => ({ ...row, debit: round2(row.debit), credit: round2(row.credit) }));
}

/** Per-account movement from ALL entries dated strictly before `before`. */
function openingMovement(userId: string, before?: string): MovementRow[] {
  if (!before) return [];
  const rows = db
    .select({
      accountId: accounts.id,
      code: accounts.code,
      name: accounts.name,
      type: accounts.type,
      debit: sql<number>`coalesce(sum(${journalLines.debit}), 0)`,
      credit: sql<number>`coalesce(sum(${journalLines.credit}), 0)`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
    .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
    .where(and(eq(journalEntries.createdBy, userId), lt(journalEntries.date, before)))
    .groupBy(accounts.id, accounts.code, accounts.name, accounts.type)
    .all();
  return rows.map((row) => ({ ...row, debit: round2(row.debit), credit: round2(row.credit) }));
}

const isDebitNature = (type: AccountType) => type === "asset" || type === "expense";
const signedBalance = (row: { type: AccountType; debit: number; credit: number }) =>
  round2(isDebitNature(row.type) ? row.debit - row.credit : row.credit - row.debit);

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  debit: number;
  credit: number;
  balance: number;
  /**
   * Trial-balance-only carry-forward columns (additive — profit & loss and
   * balance sheet rows never carry them):
   * - openingDebit/openingCredit: one-sided opening balance from ALL entries
   *   dated before `from` (signed by account nature; 0 when no `from` given).
   * - closing: signed-by-nature balance of opening + in-range movement
   *   (positive = the account's natural side: debit for asset/expense,
   *   credit otherwise).
   */
  openingDebit?: number;
  openingCredit?: number;
  closing?: number;
}

export async function trialBalance(
  userId: string,
  from?: string,
  to?: string
): Promise<{ from: string | null; to: string | null; rows: TrialBalanceRow[]; totals: any }> {
  ensureChartOn(db, userId);
  const chart = db
    .select()
    .from(accounts)
    .where(eq(accounts.createdBy, userId))
    .orderBy(asc(accounts.code))
    .all();
  const moved = new Map(movement(userId, from, to).map((row) => [row.accountId, row]));
  const opened = new Map(openingMovement(userId, from).map((row) => [row.accountId, row]));

  // One-sided split of a signed balance: debit-nature accounts keep positive
  // balances in the debit column, credit-nature accounts in the credit column.
  const sides = (type: AccountType, debit: number, credit: number) => {
    const signed = signedBalance({ type, debit, credit });
    const debitNature = isDebitNature(type);
    return {
      debit: round2(debitNature ? Math.max(signed, 0) : Math.max(-signed, 0)),
      credit: round2(debitNature ? Math.max(-signed, 0) : Math.max(signed, 0)),
    };
  };

  const rows: TrialBalanceRow[] = chart.map((account) => {
    const row = moved.get(account.id) ?? { debit: 0, credit: 0 };
    const open = opened.get(account.id) ?? { debit: 0, credit: 0 };
    const opening = sides(account.type, open.debit, open.credit);
    const closing = sides(account.type, open.debit + row.debit, open.credit + row.credit);
    return {
      accountId: account.id,
      code: account.code,
      name: account.name,
      type: account.type,
      debit: row.debit,
      credit: row.credit,
      balance: signedBalance({ type: account.type, debit: row.debit, credit: row.credit }),
      openingDebit: opening.debit,
      openingCredit: opening.credit,
      closing: round2(
        isDebitNature(account.type)
          ? open.debit + row.debit - (open.credit + row.credit)
          : open.credit + row.credit - (open.debit + row.debit)
      ),
    };
  });

  const totalDebit = round2(rows.reduce((sum, row) => sum + row.debit, 0));
  const totalCredit = round2(rows.reduce((sum, row) => sum + row.credit, 0));
  const totalOpeningDebit = round2(rows.reduce((sum, row) => sum + (row.openingDebit ?? 0), 0));
  const totalOpeningCredit = round2(rows.reduce((sum, row) => sum + (row.openingCredit ?? 0), 0));
  const totalClosingDebit = round2(
    rows.reduce(
      (sum, row) =>
        sum + Math.max(0, isDebitNature(row.type) ? (row.closing ?? 0) : -(row.closing ?? 0)),
      0
    )
  );
  const totalClosingCredit = round2(
    rows.reduce(
      (sum, row) =>
        sum + Math.max(0, isDebitNature(row.type) ? -(row.closing ?? 0) : (row.closing ?? 0)),
      0
    )
  );
  const income = round2(
    rows.filter((r) => r.type === "income").reduce((sum, r) => sum + (r.credit - r.debit), 0)
  );
  const expense = round2(
    rows.filter((r) => r.type === "expense").reduce((sum, r) => sum + (r.debit - r.credit), 0)
  );
  return {
    from: from ?? null,
    to: to ?? null,
    rows,
    totals: {
      totalDebit,
      totalCredit,
      totalOpeningDebit,
      totalOpeningCredit,
      totalClosingDebit,
      totalClosingCredit,
      netIncome: round2(income - expense),
    },
  };
}

export async function profitLoss(
  userId: string,
  from?: string,
  to?: string
): Promise<{
  from: string | null;
  to: string | null;
  income: TrialBalanceRow[];
  expense: TrialBalanceRow[];
  incomeTotal: number;
  expenseTotal: number;
  net: number;
}> {
  ensureChartOn(db, userId);
  const moved = movement(userId, from, to);
  const chart = db
    .select()
    .from(accounts)
    .where(eq(accounts.createdBy, userId))
    .orderBy(asc(accounts.code))
    .all();
  const byId = new Map(chart.map((account) => [account.id, account]));

  const income: TrialBalanceRow[] = [];
  const expense: TrialBalanceRow[] = [];
  for (const row of moved) {
    const account = byId.get(row.accountId);
    if (!account) continue;
    if (row.debit === 0 && row.credit === 0) continue;
    const base = { accountId: row.accountId, code: row.code, name: row.name, type: row.type, debit: row.debit, credit: row.credit };
    if (row.type === "income") {
      income.push({ ...base, balance: round2(row.credit - row.debit) });
    } else if (row.type === "expense") {
      expense.push({ ...base, balance: round2(row.debit - row.credit) });
    }
  }
  const incomeTotal = round2(income.reduce((sum, row) => sum + row.balance, 0));
  const expenseTotal = round2(expense.reduce((sum, row) => sum + row.balance, 0));
  return {
    from: from ?? null,
    to: to ?? null,
    income,
    expense,
    incomeTotal,
    expenseTotal,
    net: round2(incomeTotal - expenseTotal),
  };
}

export async function balanceSheet(
  userId: string,
  asOf: string
): Promise<{
  asOf: string;
  assets: TrialBalanceRow[];
  liabilities: TrialBalanceRow[];
  equity: TrialBalanceRow[];
  totals: { assets: number; liabilities: number; equity: number; retainedEarnings: number; imbalance: number };
}> {
  ensureChartOn(db, userId);
  const moved = movement(userId, undefined, asOf);
  const chart = db
    .select()
    .from(accounts)
    .where(eq(accounts.createdBy, userId))
    .orderBy(asc(accounts.code))
    .all();
  const byId = new Map(chart.map((account) => [account.id, account]));

  const assets: TrialBalanceRow[] = [];
  const liabilities: TrialBalanceRow[] = [];
  const equity: TrialBalanceRow[] = [];
  let incomeCum = 0;
  let expenseCum = 0;
  for (const row of moved) {
    const account = byId.get(row.accountId);
    if (!account) continue;
    const base = { accountId: row.accountId, code: row.code, name: row.name, type: row.type, debit: row.debit, credit: row.credit };
    if (row.type === "asset") assets.push({ ...base, balance: round2(row.debit - row.credit) });
    else if (row.type === "liability") liabilities.push({ ...base, balance: round2(row.credit - row.debit) });
    else if (row.type === "equity") equity.push({ ...base, balance: round2(row.credit - row.debit) });
    else if (row.type === "income") incomeCum += row.credit - row.debit;
    else if (row.type === "expense") expenseCum += row.debit - row.credit;
  }
  const totalAssets = round2(assets.reduce((sum, row) => sum + row.balance, 0));
  const totalLiabilities = round2(liabilities.reduce((sum, row) => sum + row.balance, 0));
  const totalEquity = round2(equity.reduce((sum, row) => sum + row.balance, 0));
  const retainedEarnings = round2(incomeCum - expenseCum);
  return {
    asOf,
    assets,
    liabilities,
    equity,
    totals: {
      assets: totalAssets,
      liabilities: totalLiabilities,
      equity: totalEquity,
      retainedEarnings,
      imbalance: round2(totalAssets - (totalLiabilities + totalEquity + retainedEarnings)),
    },
  };
}

export interface DayBookEntry extends EntryWithLines {
  createdAt: Date | number | string | null;
}

export async function dayBook(
  userId: string,
  from?: string,
  to?: string,
  page = 1,
  limit = 50
): Promise<{ entries: DayBookEntry[]; total: number; page: number; limit: number }> {
  ensureChartOn(db, userId);
  const conds = [eq(journalEntries.createdBy, userId)];
  if (from) conds.push(gte(journalEntries.date, from));
  if (to) conds.push(lte(journalEntries.date, to));
  const where = and(...conds);

  const totalRows = db
    .select({ value: sql<number>`count(*)`.mapWith(Number) })
    .from(journalEntries)
    .where(where)
    .all();
  const total = totalRows[0]?.value ?? 0;

  const pageNum = Math.max(1, page);
  const offset = (pageNum - 1) * limit;
  const entries = db
    .select()
    .from(journalEntries)
    .where(where)
    .orderBy(desc(journalEntries.date), desc(journalEntries.createdAt))
    .limit(limit)
    .offset(offset)
    .all();

  const ids = entries.map((entry) => entry.id);
  const lineRows = ids.length
    ? db
        .select({
          id: journalLines.id,
          entryId: journalLines.entryId,
          accountId: journalLines.accountId,
          debit: journalLines.debit,
          credit: journalLines.credit,
          partyType: journalLines.partyType,
          partyId: journalLines.partyId,
          memo: journalLines.memo,
          code: accounts.code,
          name: accounts.name,
          type: accounts.type,
        })
        .from(journalLines)
        .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
        .where(inArray(journalLines.entryId, ids))
        .all()
    : [];

  const linesByEntry = new Map<string, DayBookEntry["lines"]>();
  for (const line of lineRows) {
    const list = linesByEntry.get(line.entryId) ?? [];
    list.push({
      id: line.id,
      accountId: line.accountId,
      code: line.code,
      name: line.name,
      type: line.type,
      debit: line.debit ?? 0,
      credit: line.credit ?? 0,
      partyType: line.partyType,
      partyId: line.partyId,
      memo: line.memo,
    });
    linesByEntry.set(line.entryId, list);
  }

  return {
    entries: entries.map((entry) => ({
      id: entry.id,
      date: entry.date,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      description: entry.description,
      isReversal: !!entry.isReversal,
      reversedBy: entry.reversedBy,
      createdAt: entry.createdAt,
      lines: linesByEntry.get(entry.id) ?? [],
    })),
    total,
    page: pageNum,
    limit,
  };
}

/** Entries posted for one source (trace), newest first. */
export async function entriesForSource(
  userId: string,
  sourceType: string,
  sourceId?: string
): Promise<EntryWithLines[]> {
  ensureChartOn(db, userId);
  const conds = [eq(journalEntries.createdBy, userId), eq(journalEntries.sourceType, sourceType)];
  if (sourceId) conds.push(eq(journalEntries.sourceId, sourceId));
  const rows = db
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(and(...conds))
    .orderBy(desc(journalEntries.createdAt))
    .all();
  return rows.map((row) => loadEntry(db, row.id));
}

export async function getEntry(userId: string, entryId: string): Promise<EntryWithLines | null> {
  const rows = db
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(and(eq(journalEntries.id, entryId), eq(journalEntries.createdBy, userId)))
    .limit(1)
    .all();
  if (rows.length === 0) return null;
  return loadEntry(db, rows[0].id);
}

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

export async function closePeriod(
  userId: string,
  input: { fromDate: string; toDate: string }
): Promise<{ id: string; fromDate: string; toDate: string }> {
  if (input.fromDate > input.toDate) {
    throw new AccountingError(400, "fromDate must be on or before toDate");
  }
  const id = generateId();
  try {
    await db.insert(accountingPeriods).values({
      id,
      createdBy: userId,
      fromDate: input.fromDate,
      toDate: input.toDate,
      closedAt: new Date(),
      closedBy: userId,
    });
  } catch (err: any) {
    if (typeof err?.message === "string" && /UNIQUE constraint failed/i.test(err.message)) {
      throw new AccountingError(409, "Accounting period already exists");
    }
    throw err;
  }
  await auditEvents.record({
    actorId: userId,
    action: "accounting.period_closed",
    entity: "accounting_period",
    entityId: id,
    metadata: { fromDate: input.fromDate, toDate: input.toDate },
  });
  return { id, fromDate: input.fromDate, toDate: input.toDate };
}

export async function reopenPeriod(userId: string, periodId: string): Promise<{ id: string }> {
  const rows = db
    .delete(accountingPeriods)
    .where(and(eq(accountingPeriods.id, periodId), eq(accountingPeriods.createdBy, userId)))
    .returning({ id: accountingPeriods.id })
    .all();
  if (rows.length === 0) throw new AccountingError(404, "Accounting period not found");
  await auditEvents.record({
    actorId: userId,
    action: "accounting.period_reopened",
    entity: "accounting_period",
    entityId: periodId,
  });
  return { id: periodId };
}

export async function listPeriods(
  userId: string
): Promise<Array<{ id: string; fromDate: string; toDate: string; closedAt: Date | number | string | null; closedBy: string | null }>> {
  return db
    .select()
    .from(accountingPeriods)
    .where(eq(accountingPeriods.createdBy, userId))
    .orderBy(asc(accountingPeriods.fromDate))
    .all();
}

// ---------------------------------------------------------------------------
// Opening balances (seed the ledger before real traffic; TB carries them forward)
// ---------------------------------------------------------------------------

export interface SuggestedOpeningLine {
  code: string;
  debit: number;
  credit: number;
}

export interface OpeningPostInput {
  date: string;
  lines: JournalLineInput[];
  description?: string;
}

/**
 * Posting key for an opening batch: one per tenant per date. The date-keyed
 * sourceId gives the endpoint idempotency — a second POST for the same date
 * is rejected with 400 before touching the ledger.
 */
const openingSourceId = (date: string) => `opening:${date}`;

/**
 * Guarded opening-balance post (route: POST /api/accounting/opening).
 * - rejects a duplicate date → `400 Opening balances already posted for <date>`;
 * - rejects a date inside a closed period → `400 Period closed` (postSync's
 *   period check, reused);
 * - otherwise posts a normal balanced entry with `source_type = "opening"`.
 */
export async function postOpeningBalances(userId: string, input: OpeningPostInput): Promise<PostResult> {
  ensureChartOn(db, userId);
  const sourceId = openingSourceId(input.date);
  const existing = db
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.createdBy, userId),
        eq(journalEntries.sourceType, "opening"),
        eq(journalEntries.sourceId, sourceId)
      )
    )
    .limit(1)
    .all();
  if (existing.length > 0) {
    throw new AccountingError(400, `Opening balances already posted for ${input.date}`);
  }
  return postSync(db, userId, {
    date: input.date,
    sourceType: "opening",
    sourceId,
    description: input.description ?? `Opening balances ${input.date}`,
    lines: input.lines,
  });
}

/**
 * Prefill for the Opening tab: current values straight from stock + ledgers.
 *
 * Format — every row is one-sided `{ code, debit, credit }` (exactly one side
 * carries the amount, the other is 0; a zero-amount row is still returned so
 * the UI can show it, filter those before posting):
 * - INVENTORY = Σ batches `purchasePrice × quantity` (tenant)
 * - AR        = Σ customer balances that are > 0 (what customers owe us)
 * - AP        = Σ supplier balances that are > 0 (what we owe suppliers)
 * - CASH      = 0 — till/drawer cash cannot be inferred, the UI leaves it editable
 * - CAPITAL   = balancing figure `(INVENTORY + AR + CASH − AP)` so total
 *   debits equal total credits when the suggestion is posted as-is.
 */
export async function suggestOpeningLines(userId: string): Promise<SuggestedOpeningLine[]> {
  ensureChartOn(db, userId);

  const inventoryRows = db
    .select({
      value: sql<number>`coalesce(sum(coalesce(${batches.purchasePrice}, 0) * coalesce(${batches.quantity}, 0)), 0)`,
    })
    .from(batches)
    .where(eq(batches.createdBy, userId))
    .all();
  const inventory = round2(inventoryRows[0]?.value ?? 0);

  const arRows = db
    .select({ value: sql<number>`coalesce(sum(${customers.balance}), 0)` })
    .from(customers)
    .where(and(eq(customers.createdBy, userId), gt(customers.balance, 0)))
    .all();
  const ar = round2(arRows[0]?.value ?? 0);

  const apRows = db
    .select({ value: sql<number>`coalesce(sum(${suppliers.balance}), 0)` })
    .from(suppliers)
    .where(and(eq(suppliers.createdBy, userId), gt(suppliers.balance, 0)))
    .all();
  const ap = round2(apRows[0]?.value ?? 0);

  const cash = 0;
  const capital = round2(inventory + ar + cash - ap);

  return [
    { code: "INVENTORY", debit: inventory, credit: 0 },
    { code: "AR", debit: ar, credit: 0 },
    { code: "AP", debit: 0, credit: ap },
    { code: "CASH", debit: 0, credit: 0 },
    capital >= 0
      ? { code: "CAPITAL", debit: 0, credit: capital }
      : { code: "CAPITAL", debit: round2(-capital), credit: 0 },
  ];
}

// ---------------------------------------------------------------------------
// Flow wiring helpers (used by invoice/purchase/payment/return routes)
// ---------------------------------------------------------------------------

/**
 * Map a payment mode to the cash/bank account that receives/pays the money.
 * cash → CASH; card|upi|other|bank_transfer → BANK.
 */
export function cashOrBankAccount(mode?: string | null): "CASH" | "BANK" {
  const normalized = (mode ?? "cash").toLowerCase();
  return normalized === "cash" ? "CASH" : "BANK";
}

export interface SalePostingInput {
  invoiceId: string;
  invoiceNo: string;
  grandTotal: number;
  totalGst: number;
  paymentMode?: string | null;
  customerId?: string | null;
  /** Actually collected on the bill — drives the cash/bank leg (Fix 3). */
  amountPaid?: number;
}

/**
 * Sale entry: the debit side is split by what was actually collected —
 * - non-credit mode: Dr CASH|BANK `amountPaid` (only when > 0) plus
 *   Dr AR `grandTotal − amountPaid` (only when a remainder > 0);
 * - credit mode: Dr AR `grandTotal` (the party's full outstanding);
 * - `amountPaid = 0` in cash mode posts the whole bill to AR — the truthful
 *   split of an unpaid "cash" sale instead of overstating cash.
 * Cr SALES (`grandTotal − totalGst`) / Cr GST_OUTPUT `totalGst`.
 * Zero-value legs are omitted so the entry still balances.
 */
export function saleJournalLines(input: SalePostingInput): JournalLineInput[] {
  const creditMode = input.paymentMode === "credit";
  const cashLeg = creditMode ? 0 : round2(Math.min(Math.max(input.amountPaid ?? 0, 0), input.grandTotal));
  const arLeg = round2(input.grandTotal - cashLeg);
  const party = input.customerId
    ? { partyType: "customer" as const, partyId: input.customerId }
    : {};

  const lines: JournalLineInput[] = [];
  if (cashLeg > 0) lines.push({ code: cashOrBankAccount(input.paymentMode), debit: cashLeg });
  if (arLeg > 0) lines.push({ code: "AR", debit: arLeg, ...party });
  const sales = round2(input.grandTotal - input.totalGst);
  if (sales > 0) lines.push({ code: "SALES", credit: sales });
  if (input.totalGst > 0) lines.push({ code: "GST_OUTPUT", credit: round2(input.totalGst) });
  return lines;
}

export interface PurchasePostingInput {
  grandTotal: number;
  totalGst: number;
  paymentMode?: string | null;
  supplierId?: string | null;
}

/**
 * Purchase entry: Dr INVENTORY (grandTotal - totalGst) / Dr GST_INPUT totalGst
 * / Cr CASH|BANK|AP grandTotal (credit purchases hit AP with the supplier party).
 */
export function purchaseJournalLines(input: PurchasePostingInput): JournalLineInput[] {
  const creditAccount = input.paymentMode === "credit" ? "AP" : cashOrBankAccount(input.paymentMode);
  const lines: JournalLineInput[] = [];
  const inventory = round2(input.grandTotal - input.totalGst);
  if (inventory > 0) lines.push({ code: "INVENTORY", debit: inventory });
  if (input.totalGst > 0) lines.push({ code: "GST_INPUT", debit: round2(input.totalGst) });
  lines.push({
    code: creditAccount,
    credit: round2(input.grandTotal),
    ...(input.paymentMode === "credit" && input.supplierId
      ? { partyType: "supplier" as const, partyId: input.supplierId }
      : {}),
  });
  return lines;
}

export interface SalesReturnPostingInput {
  refundAmount: number;
  totalGst: number;
  grandTotal: number;
  refundMode?: string | null;
  customerId?: string | null;
}

/**
 * Sales-return entry: Dr SALES_RETURNS taxable portion + Dr GST_OUTPUT the
 * proportional GST share / Cr CASH|BANK|AR refundAmount. The GST share is
 * `refundAmount * totalGst / grandTotal` rounded to 2 decimals; the taxable
 * portion is the remainder, so the split always sums back to the refund.
 */
export function salesReturnJournalLines(input: SalesReturnPostingInput): JournalLineInput[] {
  const gstShare =
    input.grandTotal > 0 ? round2((input.refundAmount * input.totalGst) / input.grandTotal) : 0;
  const taxable = round2(input.refundAmount - gstShare);
  const creditAccount = input.refundMode === "credit" ? "AR" : cashOrBankAccount(input.refundMode);
  const lines: JournalLineInput[] = [];
  if (taxable > 0) lines.push({ code: "SALES_RETURNS", debit: taxable });
  if (gstShare > 0) lines.push({ code: "GST_OUTPUT", debit: gstShare });
  lines.push({
    code: creditAccount,
    credit: round2(input.refundAmount),
    ...(input.refundMode === "credit" && input.customerId
      ? { partyType: "customer" as const, partyId: input.customerId }
      : {}),
  });
  return lines;
}

export interface PurchaseReturnPostingInput {
  refundAmount: number;
  totalGst: number;
  grandTotal: number;
  refundMode?: string | null;
  supplierId?: string | null;
}

/**
 * Purchase-return entry (mirror of `salesReturnJournalLines`, Task 11 spec):
 * Dr AP (refundMode "credit", party = supplier) | Dr CASH|BANK (cash-like
 * refund) refundAmount / Cr PURCHASE_RETURNS taxable portion + Cr GST_INPUT
 * the proportional GST share. The GST split uses the same math as sales
 * returns: `gstShare = round(refundAmount × totalGst / grandTotal, 2)` and
 * `taxable = refundAmount − gstShare`, so the two credits always sum back to
 * the refund. Zero legs are omitted.
 */
export function purchaseReturnJournalLines(input: PurchaseReturnPostingInput): JournalLineInput[] {
  const gstShare =
    input.grandTotal > 0 ? round2((input.refundAmount * input.totalGst) / input.grandTotal) : 0;
  const taxable = round2(input.refundAmount - gstShare);
  const debitAccount = input.refundMode === "credit" ? "AP" : cashOrBankAccount(input.refundMode);
  const lines: JournalLineInput[] = [];
  if (taxable > 0) lines.push({ code: "PURCHASE_RETURNS", credit: taxable });
  if (gstShare > 0) lines.push({ code: "GST_INPUT", credit: gstShare });
  lines.push({
    code: debitAccount,
    debit: round2(input.refundAmount),
    ...(input.refundMode === "credit" && input.supplierId
      ? { partyType: "supplier" as const, partyId: input.supplierId }
      : {}),
  });
  return lines;
}

/** Best-effort posting wrapper for business flows: never throws. */
export async function postSafely(
  userId: string,
  input: PostInput,
  meta: { entity: string; entityId?: string }
): Promise<PostResult | null> {
  try {
    return await post(userId, input);
  } catch (err) {
    await auditFailure(userId, meta, err);
    return null;
  }
}

/** Best-effort reversal wrapper for cancellations: never throws. */
export async function reverseSafely(
  userId: string,
  input: ReverseInput,
  meta: { entity: string; entityId?: string }
): Promise<ReverseResult | null> {
  try {
    return await reverse(userId, input);
  } catch (err) {
    await auditFailure(userId, meta, err);
    return null;
  }
}

/** Record a skipped/failed posting so the ledger gap is visible in the audit trail. */
export async function auditSkipped(
  userId: string,
  action: string,
  meta: { entity: string; entityId?: string; reason: string }
): Promise<void> {
  await auditEvents.record({
    actorId: userId,
    action,
    entity: meta.entity,
    entityId: meta.entityId,
    metadata: { reason: meta.reason },
  });
}

async function auditFailure(
  userId: string,
  meta: { entity: string; entityId?: string },
  err: unknown
): Promise<void> {
  console.error("[accounting] post/reverse failed:", err);
  await auditEvents.record({
    actorId: userId,
    action: "accounting.post_failed",
    entity: meta.entity,
    entityId: meta.entityId,
    metadata: { error: err instanceof Error ? err.message : String(err) },
  });
}

/** Map an AccountingError (or anything else) to a status/message for routes. */
export function toErrorResponse(err: unknown): { statusCode: number; message: string } {
  if (err instanceof AccountingError) return { statusCode: err.statusCode, message: err.message };
  return { statusCode: 500, message: err instanceof Error ? err.message : String(err) };
}
