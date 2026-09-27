/**
 * Server-side OCR text extraction for purchase invoices.
 *
 * This is a deliberate re-implementation of the browser-only heuristics in
 * `src/utils/billOcr.ts` (the server never imports frontend code). OCR itself
 * runs client-side via tesseract.js; the raw text is POSTed here where it is
 * normalized into the same import-session shape as a CSV upload.
 *
 * Every extracted value carries a confidence score so the review UI can show
 * green/amber/red badges:
 *   0.9+  strong labelled pattern match (e.g. "Bill No: INV-123")
 *   0.6   weak pattern match (id-like / date-like token without a label)
 *   0.3   field absent
 */

export interface OcrField {
  value: string | null;
  confidence: number;
}

export interface OcrHeaderFields {
  billNo: OcrField;
  billDate: OcrField;
  supplierName: OcrField;
  total: OcrField;
}

export interface OcrLineRow {
  product: string;
  quantity: number | null;
  rate: number | null;
  gstRate: number;
  batchNo?: string;
  expiryDate?: string;
  confidence: number;
}

const STRONG = 0.95;
const LABELLED = 0.9;
const WEAK = 0.6;
const ABSENT = 0.3;

const VALID_GST = [0, 5, 12, 18, 28] as const;
const DEFAULT_GST = 12;

// ---------------------------------------------------------------------------
// Header extraction
// ---------------------------------------------------------------------------

const ABSENT_FIELD = (): OcrField => ({ value: null, confidence: ABSENT });

/** Explicit "Bill No / Invoice Number" style match — high confidence. */
const BILL_NO_STRONG_RE =
  /\b(?:bill|invoice|inv|receipt|challan)\s*(?:no\.?|number|#)\s*[:#.-]?\s*([A-Za-z0-9][A-Za-z0-9/-]{2,})/i;
/** "Bill: INV123" — label directly followed by a code. */
const BILL_NO_MEDIUM_RE =
  /\b(?:bill|invoice|inv)\s*[:#]\s*([A-Za-z0-9][A-Za-z0-9/-]{3,})/i;
/** A standalone token that looks like an id (letters + digits, e.g. XY-998811). */
const ID_TOKEN_RE = /[A-Za-z0-9][A-Za-z0-9\-/]{2,}[A-Za-z0-9]/g;

const DATE_TOKEN_PATTERNS: RegExp[] = [
  /\b\d{1,2}[/-]\d{1,2}[/-]\d{4}\b/,
  /\b\d{4}[/-]\d{1,2}[/-]\d{1,2}\b/,
  /\b\d{4}[/-]\d{1,2}\b/,
  /\b\d{1,2}[\s-][A-Za-z]{3,}[\s-]\d{4}\b/,
  /\b[A-Za-z]{3,}\s+\d{1,2},?\s+\d{4}\b/,
];

const BILL_DATE_LABELLED_RE =
  /\b(?:bill\s*date|invoice\s*date|date\s*of\s*(?:bill|invoice|supply)|date)\s*[:#.-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}(?:[/-]\d{1,2})?|\d{1,2}[\s-][A-Za-z]{3,}[\s-]\d{4}|[A-Za-z]{3,}\s+\d{1,2},?\s+\d{4})/i;

const SUPPLIER_LABELLED_RE =
  /\b(?:supplier|vendor|sold\s*by|bill\s*from|dispatched\s*by)\s*[:#.-]\s*([^\n]{2,120})/i;

const TOTAL_RE =
  /\b(?:grand\s*total|total\s*amount|total\s*payable|net\s*amount|net\s*payable|total)\s*[:₹rs.\s]*([\d,]+(?:\.\d+)?)\b/i;

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9,
  sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

const pad2 = (n: number) => String(n).padStart(2, "0");

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Parse an OCR date token into ISO `YYYY-MM-DD`. Day-first (Indian) order. */
export function parseOcrDate(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;

  let m = v.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (m) return isoDate(Number(m[1]), Number(m[2]), Number(m[3]));

  m = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    let day = Number(m[1]);
    let month = Number(m[2]);
    if (day <= 12 && month > 12) [day, month] = [month, day];
    return isoDate(Number(m[3]), month, day);
  }

  m = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/);
  if (m) {
    let day = Number(m[1]);
    let month = Number(m[2]);
    if (day <= 12 && month > 12) [day, month] = [month, day];
    return isoDate(2000 + Number(m[3]), month, day);
  }

  m = v.match(/^(\d{4})[/-](\d{1,2})$/);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (month < 1 || month > 12) return null;
    return `${year}-${pad2(month)}-${pad2(daysInMonth(year, month))}`;
  }

  m = v.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,})[\s-]+(\d{4})$/);
  if (m) {
    const month = MONTHS[m[2].toLowerCase()];
    if (!month) return null;
    return isoDate(Number(m[3]), month, Number(m[1]));
  }

  m = v.match(/^([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const month = MONTHS[m[1].toLowerCase()];
    if (!month) return null;
    return isoDate(Number(m[3]), month, Number(m[2]));
  }

  return null;
}

function looksLikeDateToken(token: string): boolean {
  return DATE_TOKEN_PATTERNS.some((re) => re.test(token));
}

/** First token containing BOTH letters and digits, skipping pure dates. */
function findIdToken(text: string): string | null {
  const matches = text.match(ID_TOKEN_RE) ?? [];
  for (const token of matches) {
    if (!/[A-Za-z]/.test(token) || !/\d/.test(token)) continue;
    if (looksLikeDateToken(token)) continue;
    return token;
  }
  return null;
}

function extractBillNo(text: string): OcrField {
  const strong = text.match(BILL_NO_STRONG_RE);
  if (strong?.[1]) return { value: strong[1], confidence: STRONG };

  const medium = text.match(BILL_NO_MEDIUM_RE);
  if (medium?.[1]) return { value: medium[1], confidence: 0.9 };

  const weak = findIdToken(text);
  if (weak) return { value: weak, confidence: WEAK };

  return ABSENT_FIELD();
}

function extractBillDate(text: string): OcrField {
  const labelled = text.match(BILL_DATE_LABELLED_RE);
  if (labelled?.[1]) {
    const iso = parseOcrDate(labelled[1]);
    if (iso) return { value: iso, confidence: LABELLED };
    return { value: null, confidence: 0.4 };
  }

  for (const re of DATE_TOKEN_PATTERNS) {
    const token = text.match(re)?.[0];
    if (!token) continue;
    const iso = parseOcrDate(token);
    if (iso) return { value: iso, confidence: WEAK };
  }

  return ABSENT_FIELD();
}

const HEADER_NOISE_RE =
  /\b(?:gstin|tin|pan|bill|invoice|date|total|phone|tel|address|state|place|tax|cgst|sgst|igst|receipt|cash|credit|debit|note|no)\b/i;

function extractSupplier(lines: string[]): OcrField {
  for (const line of lines) {
    const match = line.match(SUPPLIER_LABELLED_RE);
    if (match?.[1]) {
      const value = match[1].replace(/\s+/g, " ").trim();
      if (value.length >= 2) return { value, confidence: LABELLED };
    }
  }

  for (const line of lines) {
    if (line.length < 3) continue;
    if (HEADER_NOISE_RE.test(line)) continue;
    if (/^[\d\s.,₹:/-]+$/.test(line)) continue;
    return { value: line.replace(/\s+/g, " ").trim(), confidence: WEAK };
  }

  return ABSENT_FIELD();
}

function extractTotal(text: string): OcrField {
  const match = text.match(TOTAL_RE);
  if (match?.[1]) return { value: match[1].replace(/,/g, ""), confidence: LABELLED };
  return ABSENT_FIELD();
}

/**
 * Pull header fields out of raw OCR text with per-field confidence scores.
 * `billDate` values are normalized to `YYYY-MM-DD` when parseable.
 */
export function extractHeaderFields(text: string): OcrHeaderFields {
  const lines = (text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return {
    billNo: extractBillNo(text ?? ""),
    billDate: extractBillDate(text ?? ""),
    supplierName: extractSupplier(lines),
    total: extractTotal(text ?? ""),
  };
}

// ---------------------------------------------------------------------------
// Line item extraction
// ---------------------------------------------------------------------------

/** Lines that are headers/footers rather than line items (from parseOcrLineItems). */
const SKIP_RE =
  /\b(total|subtotal|grand total|gst|cgst|sgst|igst|gstin|discount|amount|payable|round|off|balance|change|paid|return|thanks|thank you|visit again|welcome|cash|upi|card|cheque|net|mrp|bill no|invoice|date|phone|ph:|tin|address|regd|cst|vat|batch|exp|mfg|rate|qty|items?|goods|drugs|expiry|manufactur|packing|hsn|sac|kg|ml)\b/i;

const NUMBER_RE = /(\d+(?:\.\d+)?)/g;
const GST_PCT_RE = /(\d{1,2})\s*%/;

/** Cap so OCR noise can never flood an import session. */
const MAX_ROWS = 500;

function parseNumericCell(cell: string): number | null {
  const cleaned = cell.replace(/[,₹%\s]/g, "");
  if (!cleaned || !/^[-+]?\d*\.?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function isValidGst(n: number): boolean {
  return Number.isInteger(n) && (VALID_GST as readonly number[]).includes(n);
}

function isDateCell(cell: string): boolean {
  return /^\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?$/.test(cell) || /^\d{4}[/-]\d{1,2}([/-]\d{1,2})?$/.test(cell);
}

function rowConfidence(
  product: string,
  quantity: number | null,
  rate: number | null,
  batchNo: string | undefined,
  expiryDate: string | undefined,
  gstDetected: boolean
): number {
  // Missing product or quantity → unusable row.
  if (!product || quantity === null) return 0;
  // Everything detected (including optional batch/expiry/gst) → high confidence.
  if (rate !== null && batchNo && expiryDate && gstDetected) return 0.85;
  // Core fields present but something optional is missing → review needed.
  return 0.6;
}

interface CellParse {
  product: string;
  quantity: number | null;
  rate: number | null;
  gstRate: number;
  gstDetected: boolean;
  batchNo?: string;
  expiryDate?: string;
}

/** Columns after the product cell: batch/expiry text cells + numeric columns. */
function parseCells(cells: string[]): CellParse {
  let product = cells[0].trim();
  let rest = cells.slice(1);

  // A purely numeric first cell means the product name was not read.
  if (product && parseNumericCell(product) !== null) {
    rest = cells;
    product = "";
  }

  let batchNo: string | undefined;
  let expiryDate: string | undefined;
  const numeric: number[] = [];

  for (const cell of rest) {
    const value = cell.trim();
    if (!value) continue;
    if (isDateCell(value)) {
      if (!expiryDate) expiryDate = value;
      continue;
    }
    const n = parseNumericCell(value);
    if (n !== null) {
      numeric.push(n);
      continue;
    }
    if (!batchNo && /[A-Za-z0-9]/.test(value)) batchNo = value;
  }

  let quantity: number | null = null;
  let rate: number | null = null;
  let gst: number | undefined;

  if (numeric.length >= 4) {
    // <qty> <rate> <amount> <gst>
    quantity = numeric[0];
    rate = numeric[1];
    const last = numeric[numeric.length - 1];
    gst = isValidGst(last) ? last : isValidGst(numeric[2]) ? numeric[2] : undefined;
  } else if (numeric.length === 3) {
    // <qty> <rate> <gst-or-amount>
    quantity = numeric[0];
    rate = numeric[1];
    gst = isValidGst(numeric[2]) ? numeric[2] : undefined;
  } else if (numeric.length === 2) {
    quantity = numeric[0];
    rate = numeric[1];
  } else if (numeric.length === 1) {
    quantity = numeric[0];
  }

  return {
    product,
    quantity,
    rate,
    gstRate: gst ?? DEFAULT_GST,
    gstDetected: gst !== undefined,
    batchNo,
    expiryDate,
  };
}

/** Fallback for single-spaced lines: same heuristics as parseOcrLineItems. */
function parseUnspacedLine(line: string): CellParse | null {
  const numbers = [...line.matchAll(NUMBER_RE)].map((m) => parseFloat(m[1]));
  if (numbers.length === 0) return null;

  const product = line
    .replace(NUMBER_RE, " ")
    .replace(/[₹Rs.,x×*/@%:;|_—–-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  let quantity: number | null;
  let rate: number | null;
  let gst: number | undefined;
  if (numbers.length >= 3) {
    quantity = numbers[numbers.length - 3];
    rate = numbers[numbers.length - 2];
    const last = numbers[numbers.length - 1];
    gst = isValidGst(last) ? last : undefined;
  } else if (numbers.length === 2) {
    quantity = numbers[0];
    rate = numbers[1];
  } else {
    quantity = 1;
    rate = numbers[0];
  }

  if (quantity !== null) quantity = Math.max(1, Math.round(quantity));
  if (rate !== null) rate = Math.max(0, Math.min(rate, 1000000));

  const pct = line.match(GST_PCT_RE);
  if (pct) {
    const n = Number(pct[1]);
    if (isValidGst(n)) gst = n;
  }

  return {
    product: product.length >= 2 ? product : "",
    quantity,
    rate,
    gstRate: gst ?? DEFAULT_GST,
    gstDetected: gst !== undefined,
  };
}

/**
 * Parse raw OCR text into candidate purchase line rows.
 * Each row carries a confidence score (0 = unusable, 0.6 = review,
 * 0.85 = every expected field was read).
 */
export function extractOcrRows(text: string): OcrLineRow[] {
  const lines = (text ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\t/g, "  ").trim())
    .filter(Boolean);

  const rows: OcrLineRow[] = [];

  for (const line of lines) {
    if (rows.length >= MAX_ROWS) break;
    if (SKIP_RE.test(line)) continue;
    if (!/\d/.test(line)) continue;

    const cells = line.split(/\t+| {2,}/).map((c) => c.trim()).filter((c) => c.length > 0);
    const useCells = cells.length >= 2;
    const parsed = useCells ? parseCells(cells) : parseUnspacedLine(line);
    if (!parsed) continue;
    // Only the spaced-cell path may emit a product-less row (missing product →
    // error issue); the single-spaced fallback needs a readable name.
    if (!useCells && !parsed.product) continue;
    if (parsed.quantity === null && parsed.rate === null) continue;

    rows.push({
      product: parsed.product,
      quantity: parsed.quantity,
      rate: parsed.rate,
      gstRate: parsed.gstRate,
      batchNo: parsed.batchNo,
      expiryDate: parsed.expiryDate,
      confidence: rowConfidence(
        parsed.product,
        parsed.quantity,
        parsed.rate,
        parsed.batchNo,
        parsed.expiryDate,
        parsed.gstDetected
      ),
    });
  }

  return rows;
}
