import { createHash } from "crypto";
import { and, asc, eq, gte, inArray, like, lt, lte, notInArray, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  accounts,
  bankStatementRows,
  generateId,
  journalEntries,
  journalLines,
  reconciliationMatches,
} from "../db/schema/index.js";
import { auditEvents } from "./audit.js";
import { ensureChart } from "./accounting.js";

/**
 * Cash Book / Bank Book + bank-statement reconciliation (Task 12).
 *
 * Design decisions (documented in docs/API.md):
 * - The cash/bank books are built from `journal_lines` posted on the `CASH`
 *   and `BANK` accounts (the accounting truth), NOT from raw `payments` rows.
 *   That guarantees the books always balance with the trial balance — the
 *   payments table stays a business-event log for the Payments UI.
 * - Reconciliation status is BANK-ONLY: a cash book row cannot be reconciled
 *   against a bank statement, so the Cash tab is view/export only. Statement
 *   rows, matches and unmatched counts all live on the bank side.
 * - Matching/unmatching NEVER writes to the journal. Unmatch only deletes the
 *   `reconciliation_matches` link, so books stay equal to the trial balance.
 * - Everything here is tenant-scoped; closed periods are irrelevant because
 *   no journal write ever happens in this module.
 *
 * Amounts: `bank_statement_rows.amount` is signed (inflow +, outflow −) and
 * `direction` mirrors that sign (`in`/`out`).
 */

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const AMOUNT_TOLERANCE = 0.01;

/** Validation/permission error carrying the HTTP status the route should send. */
export class ReconciliationError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "ReconciliationError";
    this.statusCode = statusCode;
  }
}

/** Map a ReconciliationError (or anything else) to a status/message for routes. */
export function toErrorResponse(err: unknown): { statusCode: number; message: string } {
  if (err instanceof ReconciliationError) return { statusCode: err.statusCode, message: err.message };
  return { statusCode: 500, message: err instanceof Error ? err.message : String(err) };
}

async function resolveAccount(userId: string, code: string): Promise<{ id: string; code: string }> {
  await ensureChart(userId);
  const rows = db
    .select({ id: accounts.id, code: accounts.code })
    .from(accounts)
    .where(and(eq(accounts.createdBy, userId), eq(accounts.code, code)))
    .limit(1)
    .all();
  if (!rows[0]) throw new ReconciliationError(400, `Unknown account code: ${code}`);
  return rows[0];
}

function addDays(dateStr: string, days: number): string {
  const ms = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(ms)) return dateStr;
  const d = new Date(ms + days * 86400000);
  return d.toISOString().slice(0, 10);
}

function dayDiff(a: string, b: string): number {
  const left = Date.parse(`${a}T00:00:00Z`);
  const right = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(left) || Number.isNaN(right)) return 9999;
  return Math.round((right - left) / 86400000);
}

// ---------------------------------------------------------------------------
// Cash Book / Bank Book
// ---------------------------------------------------------------------------

export interface BookAccountParty {
  code: string;
  partyType: string | null;
  partyId: string | null;
  memo: string | null;
}

export interface BookRow {
  lineId: string;
  entryId: string;
  date: string;
  sourceType: string;
  sourceId: string | null;
  description: string | null;
  /** Counterpart legs of the same entry (what the money was for). */
  accountParties: BookAccountParty[];
  /** Money in — debit on the cash/bank account. */
  debit: number;
  /** Money out — credit on the cash/bank account. */
  credit: number;
  runningBalance: number;
}

export interface BookResult {
  book: "cash" | "bank";
  from: string | null;
  to: string | null;
  opening: number;
  inflow: number;
  outflow: number;
  closing: number;
  rows: BookRow[];
  summary: { rowCount: number; inCount: number; outCount: number; net: number };
}

/**
 * Build one book from journal lines on `CASH`/`BANK`.
 * `opening` = Σ(debit − credit) of every line dated BEFORE `from`
 * (0 when no `from` is given); `closing` = opening + inflow − outflow.
 */
async function buildBook(
  userId: string,
  book: "cash" | "bank",
  from?: string,
  to?: string
): Promise<BookResult> {
  const account = await resolveAccount(userId, book === "cash" ? "CASH" : "BANK");

  let opening = 0;
  if (from) {
    const openingRows = db
      .select({
        debit: sql<number>`coalesce(sum(${journalLines.debit}), 0)`,
        credit: sql<number>`coalesce(sum(${journalLines.credit}), 0)`,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
      .where(
        and(
          eq(journalLines.createdBy, userId),
          eq(journalLines.accountId, account.id),
          eq(journalEntries.createdBy, userId),
          lt(journalEntries.date, from)
        )
      )
      .all();
    opening = round2((openingRows[0]?.debit ?? 0) - (openingRows[0]?.credit ?? 0));
  }

  const conds = [
    eq(journalLines.createdBy, userId),
    eq(journalLines.accountId, account.id),
    eq(journalEntries.createdBy, userId),
  ];
  if (from) conds.push(gte(journalEntries.date, from));
  if (to) conds.push(lte(journalEntries.date, to));

  const lineRows = db
    .select({
      lineId: journalLines.id,
      entryId: journalLines.entryId,
      date: journalEntries.date,
      sourceType: journalEntries.sourceType,
      sourceId: journalEntries.sourceId,
      description: journalEntries.description,
      debit: journalLines.debit,
      credit: journalLines.credit,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
    .where(and(...conds))
    .orderBy(asc(journalEntries.date), asc(journalEntries.createdAt), asc(journalLines.id))
    .all();

  // Counterpart legs per entry (for `accountParties`).
  const entryIds = [...new Set(lineRows.map((row) => row.entryId))];
  const siblingRows = entryIds.length
    ? db
        .select({
          entryId: journalLines.entryId,
          accountId: journalLines.accountId,
          code: accounts.code,
          partyType: journalLines.partyType,
          partyId: journalLines.partyId,
          memo: journalLines.memo,
        })
        .from(journalLines)
        .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
        .where(inArray(journalLines.entryId, entryIds))
        .all()
    : [];
  const siblingsByEntry = new Map<string, BookAccountParty[]>();
  for (const row of siblingRows) {
    if (row.accountId === account.id) continue;
    const list = siblingsByEntry.get(row.entryId) ?? [];
    list.push({ code: row.code, partyType: row.partyType, partyId: row.partyId, memo: row.memo });
    siblingsByEntry.set(row.entryId, list);
  }

  let inflow = 0;
  let outflow = 0;
  let running = opening;
  const rows: BookRow[] = lineRows.map((row) => {
    const debit = round2(row.debit ?? 0);
    const credit = round2(row.credit ?? 0);
    inflow += debit;
    outflow += credit;
    running = round2(running + debit - credit);
    return {
      lineId: row.lineId,
      entryId: row.entryId,
      date: row.date,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      description: row.description,
      accountParties: siblingsByEntry.get(row.entryId) ?? [],
      debit,
      credit,
      runningBalance: running,
    };
  });

  inflow = round2(inflow);
  outflow = round2(outflow);
  const closing = round2(opening + inflow - outflow);

  return {
    book,
    from: from ?? null,
    to: to ?? null,
    opening,
    inflow,
    outflow,
    closing,
    rows,
    summary: {
      rowCount: rows.length,
      inCount: rows.filter((row) => row.debit > 0).length,
      outCount: rows.filter((row) => row.credit > 0).length,
      net: round2(inflow - outflow),
    },
  };
}

export async function cashBook(userId: string, from?: string, to?: string): Promise<BookResult> {
  return buildBook(userId, "cash", from, to);
}

export async function bankBook(userId: string, from?: string, to?: string): Promise<BookResult> {
  return buildBook(userId, "bank", from, to);
}

// ---------------------------------------------------------------------------
// Bank statement CSV import
// ---------------------------------------------------------------------------

export interface ImportSkipped {
  line: number;
  reason: string;
}

export interface ImportStatementResult {
  imported: number;
  duplicates: number;
  skipped: ImportSkipped[];
}

type FieldKey = "date" | "reference" | "description" | "amount" | "debit" | "credit" | "direction";

const HEADER_ALIASES: Record<FieldKey, string[]> = {
  date: ["date", "txn date", "transaction date", "value date", "posting date", "dt"],
  reference: [
    "reference",
    "ref",
    "ref no",
    "ref no.",
    "reference no",
    "reference no.",
    "utr",
    "utr no",
    "transaction id",
    "txn id",
    "cheque no",
    "cheque no.",
    "cheque number",
  ],
  description: [
    "description",
    "narration",
    "particulars",
    "details",
    "payee",
    "remarks",
    "remark",
    "memo",
    "info",
    "message",
  ],
  amount: ["amount", "amt", "transaction amount", "value"],
  debit: ["debit", "debit amount", "withdrawal", "withdrawal amount", "dr"],
  credit: ["credit", "credit amount", "deposit", "deposit amount", "cr"],
  direction: ["direction", "dr/cr", "cr/dr", "indicator", "type"],
};

interface ColumnMap {
  date: number;
  reference: number;
  description: number;
  amount: number;
  debit: number;
  credit: number;
  direction: number;
}

/**
 * RFC-4180-ish record splitter (quoted fields, embedded commas/newlines, CRLF,
 * BOM). Deliberately local to this module — the purchase-import parser is
 * field-mapped to purchase bills and must not be coupled to bank statements.
 */
function splitCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    record.push(field);
    field = "";
  };
  const pushRecord = () => {
    pushField();
    records.push(record);
    record = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\n") {
      pushRecord();
    } else if (ch === "\r") {
      if (text[i + 1] === "\n") i++;
      pushRecord();
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || record.length > 0) pushRecord();
  return records;
}

function normalizeHeaderKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s_]+/g, " ")
    .trim()
    .replace(/:+$/, "")
    .trim();
}

function aliasField(value: string): FieldKey | null {
  const norm = normalizeHeaderKey(value);
  if (!norm) return null;
  const order: FieldKey[] = ["date", "reference", "description", "debit", "credit", "amount", "direction"];
  for (const key of order) {
    if (HEADER_ALIASES[key].includes(norm)) return key;
  }
  return null;
}

function mapHeader(cells: string[]): ColumnMap {
  const map: ColumnMap = { date: -1, reference: -1, description: -1, amount: -1, debit: -1, credit: -1, direction: -1 };
  cells.forEach((cell, index) => {
    const field = aliasField(cell);
    if (field && map[field] === -1) map[field] = index;
  });
  if (map.date === -1) map.date = 0;
  return map;
}

/** Headerless fallback: `date,reference,description,amount`. */
function positionalMap(): ColumnMap {
  return { date: 0, reference: 1, description: 2, amount: 3, debit: -1, credit: -1, direction: -1 };
}

function cellAt(cells: string[], index: number): string {
  if (index < 0 || index >= cells.length) return "";
  return (cells[index] ?? "").trim();
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function buildDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Normalize `YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY`, `DD/MM/YY` → YYYY-MM-DD. */
export function normalizeStatementDate(value: string): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if (m) return buildDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  if (m) return buildDate(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(v);
  if (m) return buildDate(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(v);
  if (m) return buildDate(2000 + Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}

/** Parse `₹1,234.50`, `(500)`, `-500`, `+500` … returns null when unparseable. */
function parseAmount(value: string): number | null {
  let s = (value ?? "").trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[₹,\s]/g, "");
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const amount = Number(s);
  return negative ? -amount : amount;
}

function normalizeDirection(value: string): "in" | "out" | null {
  const v = (value ?? "").trim().toLowerCase();
  if (["in", "cr", "credit", "deposit", "deposit amount", "paid in"].includes(v)) return "in";
  if (["out", "dr", "debit", "withdrawal", "withdrawal amount", "paid out"].includes(v)) return "out";
  return null;
}

/**
 * Import a bank statement CSV.
 * Columns: header row is detected when any cell matches a known alias; the
 * header line itself is reported as `skipped` (reason `Header row`). Amount =
 * credit − debit when either column is present, else the signed amount column;
 * an explicit `direction` column forces the sign. Rows whose date cannot be
 * parsed are collected as `skipped` (header/invalid heuristic).
 * Re-imports are no-ops thanks to `UNIQUE(created_by, sha256)`.
 */
export async function importStatement(userId: string, csvText: string): Promise<ImportStatementResult> {
  const records = splitCsvRecords((csvText ?? "").replace(/^\uFEFF/, ""));
  const result: ImportStatementResult = { imported: 0, duplicates: 0, skipped: [] };

  const firstDataIndex = records.findIndex((cells) => cells.some((c) => c.trim() !== ""));
  if (firstDataIndex === -1) return result;
  const first = records[firstDataIndex];
  const isHeader = first.some((cell) => aliasField(cell) !== null);
  const map: ColumnMap = isHeader ? mapHeader(first) : positionalMap();

  for (let index = 0; index < records.length; index++) {
    const cells = records[index];
    const line = index + 1;
    if (cells.every((c) => c.trim() === "")) continue;
    if (isHeader && index === firstDataIndex) {
      result.skipped.push({ line, reason: "Header row" });
      continue;
    }

    const dateRaw = cellAt(cells, map.date);
    const statementDate = normalizeStatementDate(dateRaw);
    if (!statementDate) {
      result.skipped.push({ line, reason: `Invalid date "${dateRaw}"` });
      continue;
    }

    const debitRaw = cellAt(cells, map.debit);
    const creditRaw = cellAt(cells, map.credit);
    let amount: number | null = null;
    if (debitRaw !== "" || creditRaw !== "") {
      const debit = debitRaw === "" ? 0 : parseAmount(debitRaw);
      const credit = creditRaw === "" ? 0 : parseAmount(creditRaw);
      if (debit === null || credit === null) {
        result.skipped.push({ line, reason: `Invalid amount "${debitRaw || creditRaw}"` });
        continue;
      }
      amount = credit - debit;
    } else {
      const amountRaw = cellAt(cells, map.amount);
      amount = parseAmount(amountRaw);
      if (amount === null) {
        result.skipped.push({ line, reason: `Invalid amount "${amountRaw}"` });
        continue;
      }
    }

    const directionHint = map.direction >= 0 ? normalizeDirection(cellAt(cells, map.direction)) : null;
    if (directionHint === "in") amount = Math.abs(amount);
    else if (directionHint === "out") amount = -Math.abs(amount);

    if (amount === 0) {
      result.skipped.push({ line, reason: "Zero amount" });
      continue;
    }

    const signedAmount = round2(amount);
    const direction: "in" | "out" = signedAmount > 0 ? "in" : "out";
    const reference = cellAt(cells, map.reference) || null;
    const description = cellAt(cells, map.description) || null;
    const sha256 = createHash("sha256")
      .update(`${statementDate}|${reference ?? ""}|${description ?? ""}|${signedAmount.toFixed(2)}`)
      .digest("hex");

    const existing = db
      .select({ id: bankStatementRows.id })
      .from(bankStatementRows)
      .where(and(eq(bankStatementRows.createdBy, userId), eq(bankStatementRows.sha256, sha256)))
      .limit(1)
      .all();
    if (existing.length > 0) {
      result.duplicates += 1;
      continue;
    }

    db.insert(bankStatementRows)
      .values({
        id: generateId(),
        createdBy: userId,
        statementDate,
        reference,
        description,
        amount: signedAmount,
        direction,
        raw: JSON.stringify(cells),
        sha256,
        importedAt: new Date(),
      })
      .run();
    result.imported += 1;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Statement rows
// ---------------------------------------------------------------------------

export interface StatementRowView {
  id: string;
  statementDate: string;
  reference: string | null;
  description: string | null;
  amount: number;
  direction: "in" | "out";
  importedAt: Date | number | string;
  matched: boolean;
  match: {
    id: string;
    journalLineId: string;
    matchedAt: Date | number | string;
    matchedBy: string;
    notes: string | null;
  } | null;
}

export interface ListRowsOptions {
  from?: string;
  to?: string;
  unreconciledOnly?: boolean;
  q?: string;
}

export async function listStatementRows(userId: string, opts: ListRowsOptions = {}): Promise<StatementRowView[]> {
  const conds = [eq(bankStatementRows.createdBy, userId)];
  if (opts.from) conds.push(gte(bankStatementRows.statementDate, opts.from));
  if (opts.to) conds.push(lte(bankStatementRows.statementDate, opts.to));
  if (opts.q?.trim()) {
    const needle = `%${opts.q.trim()}%`;
    conds.push(or(like(bankStatementRows.reference, needle), like(bankStatementRows.description, needle))!);
  }

  const rows = db
    .select()
    .from(bankStatementRows)
    .where(and(...conds))
    .orderBy(asc(bankStatementRows.statementDate), asc(bankStatementRows.importedAt))
    .all();

  const matches = db
    .select()
    .from(reconciliationMatches)
    .where(eq(reconciliationMatches.createdBy, userId))
    .all();
  const matchByRow = new Map(matches.map((match) => [match.bankRowId, match]));

  const views: StatementRowView[] = rows.map((row) => {
    const match = matchByRow.get(row.id);
    return {
      id: row.id,
      statementDate: row.statementDate,
      reference: row.reference,
      description: row.description,
      amount: row.amount,
      direction: row.direction,
      importedAt: row.importedAt,
      matched: !!match,
      match: match
        ? {
            id: match.id,
            journalLineId: match.journalLineId,
            matchedAt: match.matchedAt,
            matchedBy: match.matchedBy,
            notes: match.notes,
          }
        : null,
    };
  });

  return opts.unreconciledOnly ? views.filter((view) => !view.matched) : views;
}

// ---------------------------------------------------------------------------
// Suggest matches
// ---------------------------------------------------------------------------

export interface SuggestCandidate {
  journalLineId: string;
  date: string;
  description: string | null;
  sourceType: string;
  lineAmount: number;
  confidence: number;
}

export interface SuggestResult {
  rowId: string;
  statementDate: string;
  amount: number;
  candidates: SuggestCandidate[];
}

/**
 * Top-5 BANK journal lines within ±5 days of the statement date with the same
 * absolute amount (± ₹0.01) and the same sign. Already-matched lines are
 * excluded. Confidence: exact amount + same direction → 0.9, else 0.6.
 */
export async function suggestMatches(userId: string, rowId: string): Promise<SuggestResult> {
  const [row] = db
    .select()
    .from(bankStatementRows)
    .where(and(eq(bankStatementRows.id, rowId), eq(bankStatementRows.createdBy, userId)))
    .limit(1)
    .all();
  if (!row) throw new ReconciliationError(404, "Statement row not found");

  const bank = await resolveAccount(userId, "BANK");
  const matchedLineIds = db
    .select({ lineId: reconciliationMatches.journalLineId })
    .from(reconciliationMatches)
    .where(eq(reconciliationMatches.createdBy, userId))
    .all()
    .map((match) => match.lineId);

  const conds = [
    eq(journalLines.createdBy, userId),
    eq(journalLines.accountId, bank.id),
    eq(journalEntries.createdBy, userId),
    gte(journalEntries.date, addDays(row.statementDate, -5)),
    lte(journalEntries.date, addDays(row.statementDate, 5)),
  ];
  if (matchedLineIds.length > 0) conds.push(notInArray(journalLines.id, matchedLineIds));

  const rows = db
    .select({
      lineId: journalLines.id,
      date: journalEntries.date,
      sourceType: journalEntries.sourceType,
      description: journalEntries.description,
      debit: journalLines.debit,
      credit: journalLines.credit,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
    .where(and(...conds))
    .all();

  const want = round2(row.amount);
  const scored = rows
    .map((line) => {
      const lineAmount = round2((line.debit ?? 0) - (line.credit ?? 0));
      const sameDirection = (want > 0 && lineAmount > 0) || (want < 0 && lineAmount < 0);
      const sameMagnitude = Math.abs(Math.abs(lineAmount) - Math.abs(want)) <= AMOUNT_TOLERANCE;
      return { ...line, lineAmount, sameDirection, sameMagnitude, distance: Math.abs(dayDiff(row.statementDate, line.date)) };
    })
    .filter((line) => line.sameDirection && line.sameMagnitude)
    .sort((a, b) => {
      const confidenceDelta =
        (Math.abs(b.lineAmount - want) < 0.005 ? 1 : 0) - (Math.abs(a.lineAmount - want) < 0.005 ? 1 : 0);
      if (confidenceDelta !== 0) return confidenceDelta;
      return a.distance - b.distance;
    })
    .slice(0, 5)
    .map((line): SuggestCandidate => ({
      journalLineId: line.lineId,
      date: line.date,
      description: line.description,
      sourceType: line.sourceType,
      lineAmount: line.lineAmount,
      confidence: Math.abs(line.lineAmount - want) < 0.005 ? 0.9 : 0.6,
    }));

  return { rowId: row.id, statementDate: row.statementDate, amount: row.amount, candidates: scored };
}

// ---------------------------------------------------------------------------
// Match / unmatch
// ---------------------------------------------------------------------------

export interface MatchInput {
  bankRowId: string;
  journalLineId: string;
  notes?: string;
  force?: boolean;
}

export interface MatchResult {
  id: string;
  bankRowId: string;
  journalLineId: string;
  matchedAt: Date | number | string;
  matchedBy: string;
  notes: string | null;
  forced: boolean;
}

/**
 * Link one statement row to one journal line. Both must belong to the tenant
 * (404), neither may already be matched (409) and the absolute amounts must
 * agree within ₹0.01 — unless `force` is set (admin|pharmacist route) which
 * requires `notes` (400 `Amount mismatch` / 400 `Force match requires notes`).
 * The journal itself is never touched.
 */
export async function match(userId: string, input: MatchInput): Promise<MatchResult> {
  const [row] = db
    .select()
    .from(bankStatementRows)
    .where(and(eq(bankStatementRows.id, input.bankRowId), eq(bankStatementRows.createdBy, userId)))
    .limit(1)
    .all();
  if (!row) throw new ReconciliationError(404, "Statement row not found");

  const [line] = db
    .select({
      lineId: journalLines.id,
      debit: journalLines.debit,
      credit: journalLines.credit,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
    .where(
      and(
        eq(journalLines.id, input.journalLineId),
        eq(journalLines.createdBy, userId),
        eq(journalEntries.createdBy, userId)
      )
    )
    .limit(1)
    .all();
  if (!line) throw new ReconciliationError(404, "Journal line not found");

  const [rowMatch] = db
    .select({ id: reconciliationMatches.id })
    .from(reconciliationMatches)
    .where(and(eq(reconciliationMatches.createdBy, userId), eq(reconciliationMatches.bankRowId, row.id)))
    .limit(1)
    .all();
  if (rowMatch) throw new ReconciliationError(409, "Statement row already matched");

  const [lineMatch] = db
    .select({ id: reconciliationMatches.id })
    .from(reconciliationMatches)
    .where(and(eq(reconciliationMatches.createdBy, userId), eq(reconciliationMatches.journalLineId, line.lineId)))
    .limit(1)
    .all();
  if (lineMatch) throw new ReconciliationError(409, "Journal line already matched");

  const forced = !!input.force;
  const notes = input.notes?.trim() ? input.notes.trim() : null;
  if (forced && !notes) throw new ReconciliationError(400, "Force match requires notes");

  const lineAmount = round2((line.debit ?? 0) - (line.credit ?? 0));
  const difference = round2(Math.abs(Math.abs(lineAmount) - Math.abs(row.amount)));
  if (difference > AMOUNT_TOLERANCE && !forced) {
    throw new ReconciliationError(400, "Amount mismatch");
  }

  const id = generateId();
  const now = new Date();
  db.insert(reconciliationMatches)
    .values({
      id,
      createdBy: userId,
      bankRowId: row.id,
      journalLineId: line.lineId,
      matchedAt: now,
      matchedBy: userId,
      notes,
      createdAt: now,
    })
    .run();

  await auditEvents.record({
    actorId: userId,
    action: "reconciliation.match",
    entity: "reconciliation_match",
    entityId: id,
    metadata: { bankRowId: row.id, journalLineId: line.lineId, forced, notes },
  });

  return {
    id,
    bankRowId: row.id,
    journalLineId: line.lineId,
    matchedAt: now,
    matchedBy: userId,
    notes,
    forced,
  };
}

export interface UnmatchResult {
  id: string;
  bankRowId: string;
  journalLineId: string;
  unmatch: true;
}

/** Remove a match link. NEVER mutates the journal. */
export async function unmatch(userId: string, matchId: string): Promise<UnmatchResult> {
  const [existing] = db
    .select()
    .from(reconciliationMatches)
    .where(and(eq(reconciliationMatches.id, matchId), eq(reconciliationMatches.createdBy, userId)))
    .limit(1)
    .all();
  if (!existing) throw new ReconciliationError(404, "Match not found");

  db.delete(reconciliationMatches).where(eq(reconciliationMatches.id, existing.id)).run();

  await auditEvents.record({
    actorId: userId,
    action: "reconciliation.unmatch",
    entity: "reconciliation_match",
    entityId: existing.id,
    metadata: { bankRowId: existing.bankRowId, journalLineId: existing.journalLineId },
  });

  return { id: existing.id, bankRowId: existing.bankRowId, journalLineId: existing.journalLineId, unmatch: true };
}

// ---------------------------------------------------------------------------
// Reconciliation status (bank-only)
// ---------------------------------------------------------------------------

export interface UnmatchedJournalLine {
  journalLineId: string;
  date: string;
  sourceType: string;
  description: string | null;
  memo: string | null;
  lineAmount: number;
}

export interface ReconciliationStatus {
  from: string | null;
  to: string | null;
  totals: {
    statementRows: number;
    matched: number;
    unmatchedRows: number;
    unmatchedJournalLines: number;
  };
  unmatchedRows: StatementRowView[];
  unmatchedJournalLines: UnmatchedJournalLine[];
}

/**
 * BANK-ONLY status (documented): cash rows can never match a bank statement,
 * so the Cash tab is view/export only. Counts cover statement rows in range,
 * how many are matched, and BANK journal lines in range with no match.
 */
export async function reconciliationStatus(
  userId: string,
  opts: { from?: string; to?: string } = {}
): Promise<ReconciliationStatus> {
  const rows = await listStatementRows(userId, { from: opts.from, to: opts.to });
  const bank = await resolveAccount(userId, "BANK");

  const matchedLineIds = db
    .select({ lineId: reconciliationMatches.journalLineId })
    .from(reconciliationMatches)
    .where(eq(reconciliationMatches.createdBy, userId))
    .all()
    .map((match) => match.lineId);

  const lineConds = [
    eq(journalLines.createdBy, userId),
    eq(journalLines.accountId, bank.id),
    eq(journalEntries.createdBy, userId),
  ];
  if (opts.from) lineConds.push(gte(journalEntries.date, opts.from));
  if (opts.to) lineConds.push(lte(journalEntries.date, opts.to));
  if (matchedLineIds.length > 0) lineConds.push(notInArray(journalLines.id, matchedLineIds));

  const unmatchedLines = db
    .select({
      journalLineId: journalLines.id,
      date: journalEntries.date,
      sourceType: journalEntries.sourceType,
      description: journalEntries.description,
      memo: journalLines.memo,
      debit: journalLines.debit,
      credit: journalLines.credit,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
    .where(and(...lineConds))
    .orderBy(asc(journalEntries.date), asc(journalLines.id))
    .all();

  const unmatchedRows = rows.filter((row) => !row.matched);
  const matchedCount = rows.length - unmatchedRows.length;

  return {
    from: opts.from ?? null,
    to: opts.to ?? null,
    totals: {
      statementRows: rows.length,
      matched: matchedCount,
      unmatchedRows: unmatchedRows.length,
      unmatchedJournalLines: unmatchedLines.length,
    },
    unmatchedRows,
    unmatchedJournalLines: unmatchedLines.map((line) => ({
      journalLineId: line.journalLineId,
      date: line.date,
      sourceType: line.sourceType,
      description: line.description,
      memo: line.memo,
      lineAmount: round2((line.debit ?? 0) - (line.credit ?? 0)),
    })),
  };
}
