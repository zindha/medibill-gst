/**
 * Document numbering — the single owner of every generated document number.
 *
 * The four numbered series (invoice, expense, sale return, purchase return)
 * used to hardcode their own prefix inside each route, so the invoice prefix
 * exposed on the settings screen was dead: the generator never read it.
 * Everything now goes through `nextDocumentNumber()`.
 *
 * Stored setting (`settings.key = "numberingFormats"`), JSON:
 *
 *   {
 *     "invoice":        { "prefix": "MB",  "pad": 6, "startAt": 1, "scope": "year"  },
 *     "expense":        { "prefix": "EXP", "pad": 4, "startAt": 1, "scope": "month" },
 *     "saleReturn":     { "prefix": "RET", "pad": 6, "startAt": 1, "scope": "year"  },
 *     "purchaseReturn": { "prefix": "PR",  "pad": 6, "startAt": 1, "scope": "year"  }
 *   }
 *
 * `scope` decides the period segment of the number:
 *   - "year"  → `${prefix}-${year}-${seq}`          (MB-2026-000001)
 *   - "month" → `${prefix}-${year}${month}-${seq}`  (EXP-202609-0001)
 *
 * The sequence is the highest number already stored under the SAME prefix and
 * period (plus one), never below `startAt`. The existing maximum is derived
 * from the document rows themselves — no extra table.
 *
 * Sequence ownership follows the schema: `invoices.invoice_no`,
 * `sales_returns.return_no` and `purchase_returns.return_no` are UNIQUE, so
 * those series are install-wide; `expenses.number` is not unique and has
 * always been per owner, so expenses keep their own per-owner series.
 *
 * Missing or invalid settings fall back to `DEFAULT_NUMBERING_FORMATS`, and
 * the defaults reproduce the legacy generators byte-for-byte.
 */

import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  expenses,
  generateId,
  invoices,
  purchaseReturns,
  salesReturns,
  settings,
} from "../db/schema/index.js";

/** Settings key holding the per-document-type numbering formats. */
export const NUMBERING_SETTING_KEY = "numberingFormats";

export type NumberingScope = "year" | "month";

export type DocumentType = "invoice" | "expense" | "saleReturn" | "purchaseReturn";

export const DOCUMENT_TYPES: readonly DocumentType[] = [
  "invoice",
  "expense",
  "saleReturn",
  "purchaseReturn",
];

export interface NumberingFormat {
  /** Leading segment of the number, e.g. "MB" → "MB-2026-000001". */
  prefix: string;
  /** Zero-padded width of the sequence, e.g. 6 → "000001". */
  pad: number;
  /** Lowest sequence that may be handed out (1-based). */
  startAt: number;
  /** Period segment: the year alone, or year+month. */
  scope: NumberingScope;
}

/**
 * Built-in defaults. These reproduce the legacy generators exactly:
 * MB-YYYY-NNNNNN, EXP-YYYYMM-NNNN, RET-YYYY-NNNNNN, PR-YYYY-NNNNNN.
 */
export const DEFAULT_NUMBERING_FORMATS: Record<DocumentType, NumberingFormat> = {
  invoice: { prefix: "MB", pad: 6, startAt: 1, scope: "year" },
  expense: { prefix: "EXP", pad: 4, startAt: 1, scope: "month" },
  saleReturn: { prefix: "RET", pad: 6, startAt: 1, scope: "year" },
  purchaseReturn: { prefix: "PR", pad: 6, startAt: 1, scope: "year" },
};

/**
 * Coerce one stored/incoming entry into a usable format. Every field falls
 * back to its default independently, so a partially broken setting never
 * takes a whole document type down.
 */
export function normaliseNumberingFormat(type: DocumentType, raw: unknown): NumberingFormat {
  const fallback = DEFAULT_NUMBERING_FORMATS[type];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...fallback };
  const entry = raw as Record<string, unknown>;

  const prefix =
    typeof entry.prefix === "string" &&
    entry.prefix.trim().length > 0 &&
    entry.prefix.length <= 8
      ? entry.prefix
      : fallback.prefix;
  const pad =
    typeof entry.pad === "number" && Number.isInteger(entry.pad) && entry.pad >= 1 && entry.pad <= 8
      ? entry.pad
      : fallback.pad;
  const startAt =
    typeof entry.startAt === "number" && Number.isInteger(entry.startAt) && entry.startAt >= 1
      ? entry.startAt
      : fallback.startAt;
  const scope: NumberingScope =
    entry.scope === "month" || entry.scope === "year" ? entry.scope : fallback.scope;

  return { prefix, pad, startAt, scope };
}

/**
 * Effective numbering formats: the stored setting merged over the defaults.
 * A missing, unparsable or partial setting yields the defaults for whatever
 * it does not define.
 */
export async function readNumberingFormats(): Promise<Record<DocumentType, NumberingFormat>> {
  const resolved = {} as Record<DocumentType, NumberingFormat>;
  for (const type of DOCUMENT_TYPES) resolved[type] = { ...DEFAULT_NUMBERING_FORMATS[type] };

  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, NUMBERING_SETTING_KEY))
    .limit(1);
  if (!row) return resolved;

  let parsed: unknown;
  try {
    parsed = JSON.parse(row.value);
  } catch {
    return resolved;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return resolved;

  const stored = parsed as Record<string, unknown>;
  for (const type of DOCUMENT_TYPES) {
    if (type in stored) resolved[type] = normaliseNumberingFormat(type, stored[type]);
  }
  return resolved;
}

/** Persist the effective numbering formats (upsert of the single setting row). */
export async function saveNumberingFormats(
  formats: Record<DocumentType, NumberingFormat>,
): Promise<void> {
  const value = JSON.stringify(formats);
  const now = new Date();
  const [existing] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, NUMBERING_SETTING_KEY))
    .limit(1);

  if (existing) {
    await db
      .update(settings)
      .set({ value, updatedAt: now })
      .where(eq(settings.key, NUMBERING_SETTING_KEY));
  } else {
    await db.insert(settings).values({
      id: generateId(),
      key: NUMBERING_SETTING_KEY,
      value,
      updatedAt: now,
    });
  }
}

/**
 * Escape LIKE wildcards so a user-supplied prefix can never widen the match
 * (a prefix of "A_B" must not match "AXB-…").
 */
function likePrefix(prefix: string): string {
  return prefix.replace(/[\\%_]/g, "\\$&") + "%";
}

/**
 * Highest sequence already used under `prefix` for this document type.
 * `prefix` is the literal head of the number (e.g. "MB-2026-"), so only rows
 * of the same prefix AND the same period are considered.
 */
async function highestSequence(
  type: DocumentType,
  prefix: string,
  ownerId?: string | null,
): Promise<number> {
  const pattern = likePrefix(prefix);
  const start = prefix.length + 1;

  switch (type) {
    case "invoice": {
      const [row] = await db
        .select({
          max: sql<number | null>`MAX(CAST(SUBSTR(${invoices.invoiceNo}, ${start}) AS INTEGER))`,
        })
        .from(invoices)
        .where(sql`${invoices.invoiceNo} LIKE ${pattern} ESCAPE '\\'`);
      return row?.max ?? 0;
    }
    case "expense": {
      const conds = [sql`${expenses.number} LIKE ${pattern} ESCAPE '\\'`];
      if (ownerId) conds.push(eq(expenses.createdBy, ownerId));
      const [row] = await db
        .select({
          max: sql<number | null>`MAX(CAST(SUBSTR(${expenses.number}, ${start}) AS INTEGER))`,
        })
        .from(expenses)
        .where(and(...conds));
      return row?.max ?? 0;
    }
    case "saleReturn": {
      const [row] = await db
        .select({
          max: sql<number | null>`MAX(CAST(SUBSTR(${salesReturns.returnNo}, ${start}) AS INTEGER))`,
        })
        .from(salesReturns)
        .where(sql`${salesReturns.returnNo} LIKE ${pattern} ESCAPE '\\'`);
      return row?.max ?? 0;
    }
    case "purchaseReturn": {
      const [row] = await db
        .select({
          max: sql<number | null>`MAX(CAST(SUBSTR(${purchaseReturns.returnNo}, ${start}) AS INTEGER))`,
        })
        .from(purchaseReturns)
        .where(sql`${purchaseReturns.returnNo} LIKE ${pattern} ESCAPE '\\'`);
      return row?.max ?? 0;
    }
  }
}

export interface NextNumberOptions {
  /** Owner whose series is used (expenses are numbered per owner). */
  ownerId?: string | null;
  /**
   * ISO date driving the period segment. Only expenses pass their own date
   * today — every other series is dated "today" so the generated numbers stay
   * identical to the legacy generators.
   */
  date?: string;
}

export interface NextDocumentNumber {
  /** The rendered document number, e.g. "MB-2026-000001". */
  number: string;
  /** The sequence that produced it (1-based, never below `startAt`). */
  sequence: number;
  /** The format the number was rendered with. */
  format: NumberingFormat;
  /** The period the number belongs to: "2026" or "202609". */
  period: string;
}

/**
 * Next number for a document type: highest existing sequence under the same
 * prefix and period, plus one, never below `startAt`.
 */
export async function nextDocumentNumber(
  type: DocumentType,
  options: NextNumberOptions = {},
): Promise<NextDocumentNumber> {
  const formats = await readNumberingFormats();
  const format = formats[type];

  // The period comes from the document's own date when one is given (expenses
  // carry their spend date) and from the local calendar date otherwise — the
  // legacy generators used `new Date().getFullYear()`, i.e. local time.
  let year: string;
  let month: string;
  if (options.date) {
    year = options.date.slice(0, 4);
    month = options.date.slice(5, 7);
  } else {
    const now = new Date();
    year = String(now.getFullYear());
    month = String(now.getMonth() + 1).padStart(2, "0");
  }
  const monthly = format.scope === "month";

  const period = monthly ? `${year}${month}` : year;
  const head = monthly ? `${format.prefix}-${year}${month}-` : `${format.prefix}-${year}-`;

  const highest = await highestSequence(type, head, options.ownerId);
  const sequence = Math.max(highest + 1, format.startAt);
  const serial = String(sequence).padStart(format.pad, "0");
  const number = monthly
    ? `${format.prefix}-${year}${month}-${serial}`
    : `${format.prefix}-${year}-${serial}`;

  return { number, sequence, format, period };
}
