import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  GST_RATES,
  INVENTORY_TRANSACTION_TYPES,
  PURCHASE_IMPORT_ROW_STATUSES,
  PURCHASE_IMPORT_STATUSES,
  activityLog,
  batches,
  generateId,
  inventoryTransactions,
  medicines,
  purchaseBillItems,
  purchaseBills,
  purchaseImportRows,
  purchaseImports,
  suppliers,
} from "../db/schema/index.js";
import { evaluateLineItems } from "./expiryPolicy.js";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

export const PURCHASE_IMPORT_FIELDS = [
  "bill_no",
  "bill_date",
  "supplier",
  "product",
  "barcode",
  "batch",
  "expiry",
  "quantity",
  "free_quantity",
  "mrp",
  "purchase_rate",
  "gst_rate",
  "discount",
] as const;
export type PurchaseImportField = (typeof PURCHASE_IMPORT_FIELDS)[number];

/** Header alias table: target field -> accepted source column headers. */
export const ALIASES: Record<PurchaseImportField, string[]> = {
  bill_no: ["bill no", "billno", "invoice no", "invoice", "inv no"],
  bill_date: ["date", "bill date", "invoice date"],
  supplier: ["supplier", "vendor", "distributor", "party"],
  product: ["product", "item", "medicine", "description", "name"],
  barcode: ["barcode", "ean", "gtin"],
  batch: ["batch", "batch no", "lot"],
  expiry: ["expiry", "exp", "exp date", "expiry date", "exp month"],
  quantity: ["qty", "quantity", "units"],
  free_quantity: ["free", "free qty"],
  mrp: ["mrp"],
  purchase_rate: ["rate", "purchase rate", "purchase price", "pp"],
  gst_rate: ["gst", "gst rate", "gst%", "tax rate"],
  discount: ["discount", "disc"],
};

export interface PurchaseImportIssue {
  field: string;
  message: string;
  severity: "error" | "warning";
}

/** A value extracted from an invoice image plus its OCR confidence score. */
export interface OcrConfidenceField {
  value: string | null;
  confidence: number;
}

export interface PurchaseImportHeaderFields {
  billNo: OcrConfidenceField;
  billDate: OcrConfidenceField;
  supplierName: OcrConfidenceField;
}

export interface NormalizedRow {
  billNo?: string;
  billDate?: string;
  supplier?: string;
  product?: string;
  barcode?: string;
  batch?: string;
  expiryDate?: string;
  quantity?: number;
  freeQuantity?: number;
  mrp?: number;
  purchaseRate?: number;
  gstRate?: string;
  discount?: number;
}

export interface PurchaseImportDefaults {
  supplierId?: string;
  gstRate?: string;
}

export interface ParsedPurchaseCsv {
  columns: string[];
  rows: Array<{ rowIndex: number; raw: Record<string, string> }>;
}

export interface PurchaseImportRowView {
  id: string;
  rowIndex: number;
  raw: Record<string, string>;
  normalized: NormalizedRow | null;
  issues: PurchaseImportIssue[];
  medicineId: string | null;
  status: "pending" | "mapped" | "error" | "committed";
}

export interface PurchaseImportSession {
  importId: string;
  filename: string;
  status: "draft" | "committed";
  source: "csv" | "ocr";
  columns: string[];
  mappings: Record<string, string>;
  defaults: PurchaseImportDefaults;
  rows: PurchaseImportRowView[];
  warnings: number;
  errors: number;
  /** Stored source image id (OCR sessions only). */
  fileId?: string;
  /** Extracted invoice header values with confidence (OCR sessions only). */
  headerFields?: PurchaseImportHeaderFields;
}

export interface CommitRowInput {
  rowIndex: number;
  medicineId: string;
  batchNo: string;
  expiryDate: string;
  quantity: number;
  freeQuantity?: number;
  mrp?: number;
  purchasePrice: number;
  sellingPrice?: number;
  gstRate?: string;
}

export interface CommitImportInput {
  billNo: string;
  billDate?: string;
  supplierId?: string;
  rows: CommitRowInput[];
}

/** HTTP-aware error so routes can map failures to status codes. */
export class PurchaseImportError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status = 400, details?: unknown) {
    super(message);
    this.name = "PurchaseImportError";
    this.status = status;
    this.details = details;
  }
}

const roundMoney = (n: number) => Math.round(n * 100) / 100;

function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// CSV parsing (RFC-4180-ish: quoted fields, embedded commas/newlines, CRLF, BOM)
// ---------------------------------------------------------------------------

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

function dedupeColumns(cells: string[]): string[] {
  const seen = new Map<string, number>();
  return cells.map((cell, i) => {
    let name = cell.trim() || `column_${i + 1}`;
    const key = name.toLowerCase();
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    if (count > 0) name = `${name}_${count + 1}`;
    return name;
  });
}

/** Parse a purchase CSV into ordered columns + raw rows (rowIndex is 0-based). */
export function parsePurchaseCsv(csvText: string): ParsedPurchaseCsv {
  const text = (csvText ?? "").replace(/^\uFEFF/, "");
  const records = splitCsvRecords(text);
  if (records.length === 0) return { columns: [], rows: [] };

  const columns = dedupeColumns(records[0]);
  const rows: Array<{ rowIndex: number; raw: Record<string, string> }> = [];

  for (let i = 1; i < records.length; i++) {
    const cells = records[i];
    if (cells.every((c) => c.trim() === "")) continue;
    const raw: Record<string, string> = {};
    columns.forEach((col, idx) => {
      raw[col] = (cells[idx] ?? "").trim();
    });
    rows.push({ rowIndex: rows.length, raw });
  }
  return { columns, rows };
}

// ---------------------------------------------------------------------------
// Column mapping
// ---------------------------------------------------------------------------

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[\s_]+/g, " ")
    .trim()
    .replace(/:+$/, "")
    .replace(/%$/, "")
    .trim();
}

/** Best-effort alias mapping of source columns -> target fields. */
export function autoMapColumns(columns: string[]): Record<string, string> {
  const mappings: Record<string, string> = {};
  const taken = new Set<string>();
  for (const col of columns) {
    const norm = normalizeHeader(col);
    if (!norm) continue;
    for (const field of PURCHASE_IMPORT_FIELDS) {
      if (taken.has(field)) continue;
      if (field === norm || ALIASES[field].includes(norm)) {
        mappings[col] = field;
        taken.add(field);
        break;
      }
    }
  }
  return mappings;
}

function readRaw(raw: Record<string, string>, key: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(raw, key)) return raw[key];
  if (/^\d+$/.test(key)) {
    const cols = Object.keys(raw);
    const idx = Number(key);
    if (idx >= 0 && idx < cols.length) return raw[cols[idx]];
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Value normalization helpers
// ---------------------------------------------------------------------------

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const pad2 = (n: number) => String(n).padStart(2, "0");

function isValidIsoDate(value: string): boolean {
  const m = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12) return false;
  if (d < 1 || d > daysInMonth(y, mo)) return false;
  return true;
}

/**
 * Normalize an expiry to month precision as the LAST day of that month
 * (pharmacy convention: "12/27" and "2027-12" both become 2027-12-31).
 * Accepts MM/YYYY, MM/YY, YYYY-MM and YYYY-MM-DD.
 */
export function normalizeExpiry(value: string): string | null {
  const v = value.trim();
  if (!v) return null;

  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
    return `${y}-${pad2(mo)}-${pad2(d)}`;
  }

  m = v.match(/^(\d{4})-(\d{1,2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    if (mo < 1 || mo > 12) return null;
    return `${y}-${pad2(mo)}-${pad2(daysInMonth(y, mo))}`;
  }

  m = v.match(/^(\d{1,2})[\/](\d{4})$/);
  if (m) {
    const mo = Number(m[1]);
    const y = Number(m[2]);
    if (mo < 1 || mo > 12) return null;
    return `${y}-${pad2(mo)}-${pad2(daysInMonth(y, mo))}`;
  }

  m = v.match(/^(\d{1,2})[\/](\d{1,2})$/);
  if (m) {
    const mo = Number(m[1]);
    const yy = Number(m[2]);
    if (mo < 1 || mo > 12 || yy > 99) return null;
    const y = 2000 + yy;
    return `${y}-${pad2(mo)}-${pad2(daysInMonth(y, mo))}`;
  }

  return null;
}

function parseNumber(value: string): number | null {
  const cleaned = String(value).replace(/[,₹\s]/g, "").replace(/%$/, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function normalizeBillDate(value: string): string | null {
  const v = value.trim();
  if (isValidIsoDate(v)) {
    const [y, mo, d] = v.split("-").map(Number);
    return `${y}-${pad2(mo)}-${pad2(d)}`;
  }
  const dmy = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const d = Number(dmy[1]);
    const mo = Number(dmy[2]);
    const y = Number(dmy[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
    return `${y}-${pad2(mo)}-${pad2(d)}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Row normalization
// ---------------------------------------------------------------------------

/**
 * Validate + normalize one raw CSV row using the active column mappings and
 * import defaults. Returns the typed values plus every issue found; issues
 * with severity "error" block commit (unless the commit payload overrides the
 * offending value), "warning" issues are informational.
 */
export function normalizeRow(
  raw: Record<string, string>,
  mappings: Record<string, string>,
  defaults: PurchaseImportDefaults = {}
): { normalized: NormalizedRow; issues: PurchaseImportIssue[] } {
  const issues: PurchaseImportIssue[] = [];
  const normalized: NormalizedRow = {};

  const get = (field: PurchaseImportField): string => {
    for (const [key, target] of Object.entries(mappings)) {
      if (target !== field) continue;
      const value = readRaw(raw, key);
      if (value !== undefined && value.trim() !== "") return value.trim();
    }
    return "";
  };

  const product = get("product");
  if (product) normalized.product = product;
  else
    issues.push({
      field: "product",
      message: "Product name is required",
      severity: "error",
    });

  const barcode = get("barcode");
  if (barcode) normalized.barcode = barcode;

  const batch = get("batch");
  if (batch) normalized.batch = batch;

  const expiryRaw = get("expiry");
  if (!expiryRaw) {
    issues.push({ field: "expiry", message: "Expiry is required", severity: "error" });
  } else {
    const expiryDate = normalizeExpiry(expiryRaw);
    if (!expiryDate) {
      issues.push({
        field: "expiry",
        message: `Expiry "${expiryRaw}" must be MM/YYYY, MM/YY, YYYY-MM or YYYY-MM-DD`,
        severity: "error",
      });
    } else {
      normalized.expiryDate = expiryDate;
    }
  }

  const qtyRaw = get("quantity");
  if (!qtyRaw) {
    issues.push({ field: "quantity", message: "Quantity is required", severity: "error" });
  } else {
    const qty = parseNumber(qtyRaw);
    if (qty === null) {
      issues.push({
        field: "quantity",
        message: `Quantity "${qtyRaw}" is not a number`,
        severity: "error",
      });
    } else if (qty <= 0) {
      issues.push({
        field: "quantity",
        message: "Quantity must be greater than 0",
        severity: "error",
      });
    } else if (!Number.isInteger(qty)) {
      issues.push({
        field: "quantity",
        message: "Quantity must be a whole number",
        severity: "error",
      });
    } else {
      normalized.quantity = qty;
    }
  }

  const freeRaw = get("free_quantity");
  if (freeRaw) {
    const free = parseNumber(freeRaw);
    if (free === null || free < 0 || !Number.isInteger(free)) {
      issues.push({
        field: "free_quantity",
        message: `Free quantity "${freeRaw}" must be a whole number of 0 or more`,
        severity: "error",
      });
    } else {
      normalized.freeQuantity = free;
    }
  } else {
    normalized.freeQuantity = 0;
  }

  const mrpRaw = get("mrp");
  if (mrpRaw) {
    const mrp = parseNumber(mrpRaw);
    if (mrp === null || mrp < 0) {
      issues.push({
        field: "mrp",
        message: `MRP "${mrpRaw}" must be a number of 0 or more`,
        severity: "error",
      });
    } else {
      normalized.mrp = mrp;
    }
  }

  const rateRaw = get("purchase_rate");
  if (rateRaw) {
    const rate = parseNumber(rateRaw);
    if (rate === null || rate < 0) {
      issues.push({
        field: "purchase_rate",
        message: `Purchase rate "${rateRaw}" must be a number of 0 or more`,
        severity: "error",
      });
    } else {
      normalized.purchaseRate = rate;
    }
  } else {
    issues.push({
      field: "purchase_rate",
      message: "Purchase rate is missing — enter it before committing",
      severity: "warning",
    });
  }

  const defaultGst =
    defaults.gstRate && (GST_RATES as readonly string[]).includes(defaults.gstRate)
      ? defaults.gstRate
      : "12";
  const gstRaw = get("gst_rate");
  if (!gstRaw) {
    normalized.gstRate = defaultGst;
  } else {
    const gst = parseNumber(gstRaw);
    if (gst === null) {
      issues.push({
        field: "gst_rate",
        message: `GST rate "${gstRaw}" is not a number — using ${defaultGst}%`,
        severity: "warning",
      });
      normalized.gstRate = defaultGst;
    } else if (!(GST_RATES as readonly string[]).includes(String(gst))) {
      issues.push({
        field: "gst_rate",
        message: `GST rate ${gst}% is not a standard rate — using ${defaultGst}%`,
        severity: "warning",
      });
      normalized.gstRate = defaultGst;
    } else {
      normalized.gstRate = String(gst);
    }
  }

  const discountRaw = get("discount");
  if (discountRaw) {
    const discount = parseNumber(discountRaw);
    if (discount === null || discount < 0) {
      issues.push({
        field: "discount",
        message: `Discount "${discountRaw}" is invalid and will be ignored`,
        severity: "warning",
      });
    } else {
      normalized.discount = discount;
    }
  }

  const billNo = get("bill_no");
  if (billNo) normalized.billNo = billNo;

  const supplier = get("supplier");
  if (supplier) normalized.supplier = supplier;

  const billDateRaw = get("bill_date");
  if (billDateRaw) {
    const billDate = normalizeBillDate(billDateRaw);
    if (!billDate) {
      issues.push({
        field: "bill_date",
        message: `Bill date "${billDateRaw}" is not a valid date`,
        severity: "warning",
      });
    } else {
      normalized.billDate = billDate;
    }
  }

  return { normalized, issues };
}

// ---------------------------------------------------------------------------
// Medicine matching
// ---------------------------------------------------------------------------

/**
 * Resolve a source row to a tenant medicine: exact barcode match first, then
 * case-insensitive exact name match. Returns confidence 1 for barcode,
 * 0.9 for name, 0 when nothing matched.
 */
export async function matchMedicine(
  userId: string,
  opts: { product?: string; barcode?: string }
): Promise<{ medicineId: string | null; confidence: number }> {
  const barcode = opts.barcode?.trim();
  if (barcode) {
    const [row] = await db
      .select({ id: medicines.id })
      .from(medicines)
      .where(
        and(
          eq(medicines.createdBy, userId),
          eq(medicines.isActive, true),
          eq(medicines.barcode, barcode)
        )
      )
      .limit(1);
    if (row) return { medicineId: row.id, confidence: 1 };
  }

  const product = opts.product?.trim();
  if (product) {
    const [row] = await db
      .select({ id: medicines.id })
      .from(medicines)
      .where(
        and(
          eq(medicines.createdBy, userId),
          eq(medicines.isActive, true),
          sql`lower(${medicines.name}) = ${product.toLowerCase()}`
        )
      )
      .limit(1);
    if (row) return { medicineId: row.id, confidence: 0.9 };
  }

  return { medicineId: null, confidence: 0 };
}

// ---------------------------------------------------------------------------
// Import session lifecycle
// ---------------------------------------------------------------------------

async function loadImport(importId: string, userId: string) {
  const [record] = await db
    .select()
    .from(purchaseImports)
    .where(
      and(eq(purchaseImports.id, importId), eq(purchaseImports.createdBy, userId))
    )
    .limit(1);
  if (!record) throw new PurchaseImportError("Purchase import not found", 404);
  return record;
}

interface ImportRecordShape {
  id: string;
  filename: string;
  status: string | null;
  source?: string | null;
  fileId?: string | null;
  headerFields?: string | null;
}

/**
 * Warning issues derived from OCR header confidence. Bill number and date are
 * required at commit, so a field the OCR could not read (confidence <= 0.5)
 * produces a warning the user sees in the review grid.
 */
function headerIssues(headerFields: PurchaseImportHeaderFields | null): PurchaseImportIssue[] {
  if (!headerFields) return [];
  const issues: PurchaseImportIssue[] = [];
  if ((headerFields.billNo?.confidence ?? 1) <= 0.5) {
    issues.push({
      field: "bill_no",
      message: "Bill number was not detected from the invoice — enter it in the bill header",
      severity: "warning",
    });
  }
  if ((headerFields.billDate?.confidence ?? 1) <= 0.5) {
    issues.push({
      field: "bill_date",
      message: "Bill date was not detected from the invoice — set it in the bill header before posting",
      severity: "warning",
    });
  }
  return issues;
}

function buildSession(
  record: ImportRecordShape,
  columns: string[],
  mappings: Record<string, string>,
  defaults: PurchaseImportDefaults,
  rows: PurchaseImportRowView[]
): PurchaseImportSession {
  let warnings = 0;
  let errors = 0;
  for (const row of rows) {
    for (const issue of row.issues) {
      if (issue.severity === "error") errors++;
      else warnings++;
    }
  }
  const session: PurchaseImportSession = {
    importId: record.id,
    filename: record.filename,
    status: (record.status ?? "draft") as "draft" | "committed",
    source: record.source === "ocr" ? "ocr" : "csv",
    columns,
    mappings,
    defaults,
    rows,
    warnings,
    errors,
  };
  if (record.fileId) session.fileId = record.fileId;
  const headerFields = safeJson<PurchaseImportHeaderFields | null>(record.headerFields, null);
  if (headerFields) session.headerFields = headerFields;
  return session;
}

async function loadRows(importId: string, userId: string) {
  return db
    .select()
    .from(purchaseImportRows)
    .where(
      and(
        eq(purchaseImportRows.importId, importId),
        eq(purchaseImportRows.createdBy, userId)
      )
    )
    .orderBy(asc(purchaseImportRows.rowIndex));
}

/**
 * Recompute mapping, normalization, issues and medicine matches for every row
 * of a draft import and persist the result. Committed imports are returned as
 * stored (no downgrade of committed rows).
 */
export async function resolveImport(
  importId: string,
  userId: string
): Promise<PurchaseImportSession> {
  const record = await loadImport(importId, userId);
  const mappings = safeJson<Record<string, string>>(record.mappings, {});
  const defaults = safeJson<PurchaseImportDefaults>(record.defaults, {});
  const rows = await loadRows(importId, userId);

  const parsedRaw = rows.map((row) => safeJson<Record<string, string>>(row.raw, {}));
  const columns = parsedRaw.length > 0 ? Object.keys(parsedRaw[0]) : [];

  if (record.status === PURCHASE_IMPORT_STATUSES.COMMITTED) {
    const views: PurchaseImportRowView[] = rows.map((row, i) => ({
      id: row.id,
      rowIndex: row.rowIndex,
      raw: parsedRaw[i],
      normalized: safeJson<NormalizedRow | null>(row.normalized, null),
      issues: safeJson<PurchaseImportIssue[]>(row.issues, []),
      medicineId: row.medicineId,
      status: (row.rowStatus ?? "pending") as PurchaseImportRowView["status"],
    }));
    return buildSession(record, columns, mappings, defaults, views);
  }

  const views: PurchaseImportRowView[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const raw = parsedRaw[i];
    const { normalized, issues } = normalizeRow(raw, mappings, defaults);

    let medicineId: string | null = null;
    if (normalized.product || normalized.barcode) {
      const match = await matchMedicine(userId, {
        product: normalized.product,
        barcode: normalized.barcode,
      });
      medicineId = match.medicineId;
    }
    if (!medicineId && normalized.product) {
      issues.push({
        field: "product",
        message: `No medicine matched "${normalized.product}" — pick one before committing`,
        severity: "warning",
      });
    }

    const hasError = issues.some((i2) => i2.severity === "error");
    const status = hasError
      ? PURCHASE_IMPORT_ROW_STATUSES.ERROR
      : medicineId
        ? PURCHASE_IMPORT_ROW_STATUSES.MAPPED
        : PURCHASE_IMPORT_ROW_STATUSES.PENDING;

    await db
      .update(purchaseImportRows)
      .set({
        normalized: JSON.stringify(normalized),
        issues: JSON.stringify(issues),
        medicineId,
        rowStatus: status,
      })
      .where(eq(purchaseImportRows.id, row.id));

    views.push({
      id: row.id,
      rowIndex: row.rowIndex,
      raw,
      normalized,
      issues,
      medicineId,
      status,
    });
  }

  // OCR sessions: surface low-confidence header fields (bill no / date) as
  // warnings on the first row so the review grid shows what needs attention.
  const storedHeader = safeJson<PurchaseImportHeaderFields | null>(record.headerFields, null);
  const extraIssues = headerIssues(storedHeader);
  if (extraIssues.length > 0 && views.length > 0) {
    views[0] = { ...views[0], issues: [...views[0].issues, ...extraIssues] };
  }

  return buildSession(record, columns, mappings, defaults, views);
}

/** Extra metadata for import sessions created outside the CSV flow. */
export interface CreateImportMeta {
  source?: "csv" | "ocr";
  fileId?: string | null;
  headerFields?: PurchaseImportHeaderFields | null;
}

/** Create a draft import from CSV text (parsed + best-effort mapped). */
export async function createImport(
  userId: string,
  filename: string,
  csvText: string,
  meta: CreateImportMeta = {}
): Promise<PurchaseImportSession> {
  const parsed = parsePurchaseCsv(csvText);
  if (parsed.columns.length === 0) {
    throw new PurchaseImportError("CSV has no header row", 400);
  }
  if (parsed.rows.length === 0) {
    throw new PurchaseImportError("CSV has no data rows", 400);
  }
  return createDraftImport(userId, filename, parsed, meta);
}

/**
 * Create a draft import from an already-parsed column/row structure. Shared by
 * the CSV flow (parsePurchaseCsv) and the OCR flow (extractOcrRows), so both
 * sources share one normalization, medicine matching and commit pipeline.
 */
export async function createDraftImport(
  userId: string,
  filename: string,
  parsed: ParsedPurchaseCsv,
  meta: CreateImportMeta = {}
): Promise<PurchaseImportSession> {
  if (parsed.columns.length === 0) {
    throw new PurchaseImportError("Import has no columns", 400);
  }
  if (parsed.rows.length === 0) {
    throw new PurchaseImportError("Import has no data rows", 400);
  }

  const mappings = autoMapColumns(parsed.columns);
  const now = new Date();
  const id = generateId();

  db.transaction((tx) => {
    tx.insert(purchaseImports)
      .values({
        id,
        createdBy: userId,
        filename,
        status: PURCHASE_IMPORT_STATUSES.DRAFT,
        mappings: JSON.stringify(mappings),
        defaults: JSON.stringify({}),
        source: meta.source === "ocr" ? "ocr" : "csv",
        fileId: meta.fileId ?? null,
        headerFields: meta.headerFields ? JSON.stringify(meta.headerFields) : null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    for (const row of parsed.rows) {
      tx.insert(purchaseImportRows)
        .values({
          id: generateId(),
          importId: id,
          createdBy: userId,
          rowIndex: row.rowIndex,
          raw: JSON.stringify(row.raw),
          normalized: null,
          medicineId: null,
          issues: JSON.stringify([]),
          rowStatus: PURCHASE_IMPORT_ROW_STATUSES.PENDING,
        })
        .run();
    }
  });

  return resolveImport(id, userId);
}

/** Replace mappings/defaults for a draft import and recompute every row. */
export async function updateImportMappings(
  userId: string,
  importId: string,
  mappings: Record<string, string>,
  defaults: PurchaseImportDefaults = {}
): Promise<PurchaseImportSession> {
  const record = await loadImport(importId, userId);
  if (record.status === PURCHASE_IMPORT_STATUSES.COMMITTED) {
    throw new PurchaseImportError("Purchase import already committed", 409);
  }

  const rows = await loadRows(importId, userId);
  const columns =
    rows.length > 0 ? Object.keys(safeJson<Record<string, string>>(rows[0].raw, {})) : [];

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(mappings)) {
    if (!value) continue; // "" = explicitly unmapped
    if (!(PURCHASE_IMPORT_FIELDS as readonly string[]).includes(value)) {
      throw new PurchaseImportError(`Unknown mapping field "${value}"`, 400);
    }
    let column = key;
    if (!columns.includes(key)) {
      if (/^\d+$/.test(key) && columns[Number(key)] !== undefined) {
        column = columns[Number(key)];
      } else {
        throw new PurchaseImportError(`Unknown CSV column "${key}"`, 400);
      }
    }
    normalized[column] = value;
  }

  const nextDefaults: PurchaseImportDefaults = {};
  if (defaults.supplierId) nextDefaults.supplierId = defaults.supplierId;
  if (defaults.gstRate) nextDefaults.gstRate = defaults.gstRate;

  await db
    .update(purchaseImports)
    .set({
      mappings: JSON.stringify(normalized),
      defaults: JSON.stringify(nextDefaults),
      updatedAt: new Date(),
    })
    .where(
      and(eq(purchaseImports.id, importId), eq(purchaseImports.createdBy, userId))
    );

  return resolveImport(importId, userId);
}

/** Delete a draft import (and its rows). Committed imports are protected. */
export async function deleteImport(userId: string, importId: string): Promise<void> {
  const record = await loadImport(importId, userId);
  if (record.status === PURCHASE_IMPORT_STATUSES.COMMITTED) {
    throw new PurchaseImportError("Purchase import not found", 404);
  }
  db.transaction((tx) => {
    tx.delete(purchaseImportRows)
      .where(
        and(
          eq(purchaseImportRows.importId, importId),
          eq(purchaseImportRows.createdBy, userId)
        )
      )
      .run();
    tx.delete(purchaseImports)
      .where(
        and(eq(purchaseImports.id, importId), eq(purchaseImports.createdBy, userId))
      )
      .run();
  });
}

// ---------------------------------------------------------------------------
// Commit (one atomic transaction: bill + items + batches + stock + status)
// ---------------------------------------------------------------------------

interface CommitValidationIssue {
  rowIndex: number;
  field: string;
  message: string;
}

/** Does the commit payload override the value that produced this error? */
function isIssueFixedByPayload(field: string, row: CommitRowInput): boolean {
  switch (field) {
    case "product":
      return !!row.medicineId;
    case "quantity":
      return Number.isInteger(row.quantity) && row.quantity > 0;
    case "expiry":
      return isValidIsoDate(row.expiryDate ?? "");
    case "free_quantity":
      return row.freeQuantity !== undefined;
    case "mrp":
      return row.mrp !== undefined;
    case "purchase_rate":
      return row.purchasePrice !== undefined;
    case "gst_rate":
      return row.gstRate !== undefined;
    default:
      return false;
  }
}

/**
 * Commit a draft import as a purchase bill. Validation runs BEFORE any write;
 * the writes themselves run in ONE better-sqlite3 transaction so a failure
 * never leaves a partial bill/batch/stock behind. Every import row must be
 * covered by the payload and no blocking error may remain.
 */
export async function commitImport(
  userId: string,
  importId: string,
  input: CommitImportInput
) {
  const record = await loadImport(importId, userId);
  if (record.status === PURCHASE_IMPORT_STATUSES.COMMITTED) {
    throw new PurchaseImportError("Purchase import has already been committed", 409);
  }

  const mappings = safeJson<Record<string, string>>(record.mappings, {});
  const defaults = safeJson<PurchaseImportDefaults>(record.defaults, {});
  const storedRows = await loadRows(importId, userId);
  if (storedRows.length === 0) {
    throw new PurchaseImportError("Purchase import has no rows", 400);
  }
  if (!input.rows || input.rows.length === 0) {
    throw new PurchaseImportError("Commit payload has no rows", 400);
  }

  const payloadByIndex = new Map<number, CommitRowInput>();
  for (const row of input.rows) {
    if (payloadByIndex.has(row.rowIndex)) {
      throw new PurchaseImportError(
        `Duplicate row ${row.rowIndex} in commit payload`,
        400
      );
    }
    payloadByIndex.set(row.rowIndex, row);
  }
  const missing = storedRows
    .filter((r) => !payloadByIndex.has(r.rowIndex))
    .map((r) => r.rowIndex);
  if (missing.length > 0) {
    throw new PurchaseImportError(
      `Rows ${missing.join(", ")} are missing from the commit payload`,
      400
    );
  }
  const unknown = input.rows
    .filter((r) => !storedRows.some((s) => s.rowIndex === r.rowIndex))
    .map((r) => r.rowIndex);
  if (unknown.length > 0) {
    throw new PurchaseImportError(
      `Commit payload references unknown rows: ${unknown.join(", ")}`,
      400
    );
  }

  const validation: CommitValidationIssue[] = [];

  // Stored-row errors still block commit unless the payload overrides them.
  const storedByIndex = new Map(storedRows.map((r) => [r.rowIndex, r]));
  for (const row of input.rows) {
    const stored = storedByIndex.get(row.rowIndex)!;
    const raw = safeJson<Record<string, string>>(stored.raw, {});
    const { issues } = normalizeRow(raw, mappings, defaults);
    for (const issue of issues) {
      if (issue.severity !== "error") continue;
      if (!isIssueFixedByPayload(issue.field, row)) {
        validation.push({ rowIndex: row.rowIndex, field: issue.field, message: issue.message });
      }
    }
  }

  // Per-row payload checks (batch, expiry, ownership).
  const medicineIds = [...new Set(input.rows.map((r) => r.medicineId).filter(Boolean))];
  const ownedMedicines = new Map<string, (typeof medicines.$inferSelect)>();
  if (medicineIds.length > 0) {
    const rowsOwned = await db
      .select()
      .from(medicines)
      .where(and(eq(medicines.createdBy, userId), inArray(medicines.id, medicineIds)));
    for (const med of rowsOwned) ownedMedicines.set(med.id, med);
  }

  for (const row of input.rows) {
    if (!row.medicineId) {
      validation.push({ rowIndex: row.rowIndex, field: "product", message: "Medicine is required" });
    } else if (!ownedMedicines.has(row.medicineId)) {
      validation.push({
        rowIndex: row.rowIndex,
        field: "product",
        message: "Medicine not found in your catalog",
      });
    }
    if (!row.batchNo || !row.batchNo.trim()) {
      validation.push({ rowIndex: row.rowIndex, field: "batch", message: "Batch number is required" });
    }
    if (!isValidIsoDate(row.expiryDate ?? "")) {
      validation.push({
        rowIndex: row.rowIndex,
        field: "expiry",
        message: `Expiry "${row.expiryDate}" must be a valid YYYY-MM-DD date`,
      });
    }
    if (!Number.isInteger(row.quantity) || row.quantity < 1) {
      validation.push({
        rowIndex: row.rowIndex,
        field: "quantity",
        message: "Quantity must be a whole number greater than 0",
      });
    }
    if (row.freeQuantity !== undefined && (!Number.isInteger(row.freeQuantity) || row.freeQuantity < 0)) {
      validation.push({
        rowIndex: row.rowIndex,
        field: "free_quantity",
        message: "Free quantity must be a whole number of 0 or more",
      });
    }
    if (row.mrp !== undefined && (typeof row.mrp !== "number" || row.mrp < 0)) {
      validation.push({ rowIndex: row.rowIndex, field: "mrp", message: "MRP must be 0 or more" });
    }
    if (typeof row.purchasePrice !== "number" || row.purchasePrice < 0) {
      validation.push({
        rowIndex: row.rowIndex,
        field: "purchase_rate",
        message: "Purchase price must be 0 or more",
      });
    }
  }

  if (validation.length > 0) {
    throw new PurchaseImportError(
      "Commit validation failed — fix the reported rows",
      400,
      { rows: validation }
    );
  }

  // Expiry policy gate (Task 5): import commit inserts batches directly, so it
  // must honor the same policy as POST /purchases. No override path for
  // imports — fix the expiry in the review grid or relax the policy in Settings.
  const expiryCheck = await evaluateLineItems(
    userId,
    input.rows.map((r) => ({ batchNo: r.batchNo, expiryDate: r.expiryDate })),
    "purchase"
  );
  if (!expiryCheck.ok) {
    throw new PurchaseImportError(
      "Expiry policy blocked this import — fix the blocked rows",
      400,
      { blocked: expiryCheck.blocked }
    );
  }

  // Supplier (optional) must belong to this tenant.
  let supplierName: string | undefined;
  if (input.supplierId) {
    const [supplier] = await db
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.createdBy, userId)))
      .limit(1);
    if (!supplier) {
      throw new PurchaseImportError("Supplier not found", 400);
    }
    supplierName = supplier.name;
  }

  // Bill number must be unique (purchase_bills.bill_no has a UNIQUE index).
  const [existingBill] = await db
    .select({ id: purchaseBills.id })
    .from(purchaseBills)
    .where(eq(purchaseBills.billNo, input.billNo))
    .limit(1);
  if (existingBill) {
    throw new PurchaseImportError(
      `A purchase bill with number "${input.billNo}" already exists`,
      409
    );
  }

  const now = new Date();
  let billDate = input.billDate ?? now.toISOString().split("T")[0];
  if (!isValidIsoDate(billDate)) {
    const normalizedDate = normalizeBillDate(billDate);
    if (!normalizedDate) {
      throw new PurchaseImportError(`Bill date "${billDate}" is not a valid date`, 400);
    }
    billDate = normalizedDate;
  }

  // Compute line totals exactly the way the purchase form does:
  // amount = qty × rate, GST extracted from the amount, grand = sub + gst - discount.
  const items = input.rows.map((row) => {
    const med = ownedMedicines.get(row.medicineId)!;
    const stored = storedByIndex.get(row.rowIndex)!;
    const normalized = safeJson<NormalizedRow | null>(stored.normalized, null);
    const gstRate = row.gstRate ?? normalized?.gstRate ?? "12";
    const amount = roundMoney(row.quantity * row.purchasePrice);
    const gstAmount = roundMoney(amount - amount / (1 + Number(gstRate) / 100));
    const mrp = row.mrp ?? normalized?.mrp ?? roundMoney(row.purchasePrice * 2);
    const sellingPrice = row.sellingPrice ?? mrp;
    const freeQuantity = row.freeQuantity ?? 0;
    const discountAmount = roundMoney(normalized?.discount ?? 0);
    return {
      rowIndex: row.rowIndex,
      medicineId: row.medicineId,
      medicineName: med.name,
      hsnCode: med.hsnCode,
      unit: med.unit,
      batchNo: row.batchNo.trim(),
      expiryDate: row.expiryDate,
      quantity: row.quantity,
      freeQuantity,
      rate: row.purchasePrice,
      amount,
      gstRate: gstRate as (typeof GST_RATES)[number],
      gstAmount,
      cgst: gstAmount / 2,
      sgst: gstAmount / 2,
      discountAmount,
      mrp,
      sellingPrice,
    };
  });

  const subtotal = roundMoney(items.reduce((sum, i) => sum + i.amount, 0));
  const totalGst = roundMoney(items.reduce((sum, i) => sum + i.gstAmount, 0));
  const discountAmount = roundMoney(items.reduce((sum, i) => sum + i.discountAmount, 0));
  const grandTotal = roundMoney(Math.max(0, subtotal + totalGst - discountAmount));

  try {
    return db.transaction((tx) => {
      // Claim the import first: a second concurrent commit loses the race here
      // and rolls the whole transaction back.
      const claimed = tx
        .update(purchaseImports)
        .set({ status: PURCHASE_IMPORT_STATUSES.COMMITTED, updatedAt: now })
        .where(
          and(
            eq(purchaseImports.id, importId),
            eq(purchaseImports.createdBy, userId),
            eq(purchaseImports.status, PURCHASE_IMPORT_STATUSES.DRAFT)
          )
        )
        .returning()
        .all();
      if (claimed.length === 0) {
        throw new PurchaseImportError("Purchase import has already been committed", 409);
      }

      const [bill] = tx
        .insert(purchaseBills)
        .values({
          id: generateId(),
          billNo: input.billNo,
          supplierId: input.supplierId,
          supplierName,
          billDate,
          subtotal,
          totalGst,
          discountAmount,
          grandTotal,
          amountPaid: 0,
          paymentStatus: "unpaid",
          notes: `Imported from ${record.filename}`,
          createdBy: userId,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .all();

      for (const item of items) {
        tx.insert(purchaseBillItems)
          .values({
            id: generateId(),
            purchaseBillId: bill.id,
            medicineId: item.medicineId,
            medicineName: item.medicineName,
            batchNo: item.batchNo,
            expiryDate: item.expiryDate,
            hsnCode: item.hsnCode,
            quantity: item.quantity,
            freeQuantity: item.freeQuantity,
            unit: item.unit,
            rate: item.rate,
            amount: item.amount,
            gstRate: item.gstRate,
            gstAmount: item.gstAmount,
            cgst: item.cgst,
            sgst: item.sgst,
            discountAmount: item.discountAmount,
            mrp: item.mrp,
            createdAt: now,
          })
          .run();

        // Reuse an existing batch (same medicine/batch/expiry) so repeated
        // imports of a lot keep one stock record; otherwise create it.
        const [existingBatch] = tx
          .select()
          .from(batches)
          .where(
            and(
              eq(batches.medicineId, item.medicineId),
              eq(batches.batchNo, item.batchNo),
              eq(batches.expiryDate, item.expiryDate),
              eq(batches.createdBy, userId),
              eq(batches.isActive, true)
            )
          )
          .limit(1)
          .all();

        const incoming = item.quantity + item.freeQuantity;
        if (existingBatch) {
          const newQty = (existingBatch.quantity ?? 0) + incoming;
          tx.update(batches)
            .set({ quantity: newQty, updatedAt: now })
            .where(eq(batches.id, existingBatch.id))
            .run();

          tx.insert(inventoryTransactions)
            .values({
              id: generateId(),
              medicineId: item.medicineId,
              batchId: existingBatch.id,
              type: INVENTORY_TRANSACTION_TYPES.PURCHASE,
              quantity: incoming,
              balanceAfter: newQty,
              rate: item.rate,
              reference: input.billNo,
              createdBy: userId,
              createdAt: now,
            })
            .run();
        } else {
          const [newBatch] = tx
            .insert(batches)
            .values({
              id: generateId(),
              medicineId: item.medicineId,
              batchNo: item.batchNo,
              expiryDate: item.expiryDate,
              mrp: item.mrp,
              purchasePrice: item.rate,
              sellingPrice: item.sellingPrice,
              quantity: incoming,
              initialQuantity: incoming,
              freeQuantity: item.freeQuantity,
              supplierId: input.supplierId,
              purchaseBillId: bill.id,
              createdBy: userId,
              createdAt: now,
              updatedAt: now,
            })
            .returning()
            .all();

          tx.insert(inventoryTransactions)
            .values({
              id: generateId(),
              medicineId: item.medicineId,
              batchId: newBatch.id,
              type: INVENTORY_TRANSACTION_TYPES.PURCHASE,
              quantity: incoming,
              balanceAfter: incoming,
              rate: item.rate,
              reference: input.billNo,
              createdBy: userId,
              createdAt: now,
            })
            .run();
        }
      }

      // Unpaid purchase increases what we owe the supplier (same as manual entry).
      if (input.supplierId && supplierName !== undefined) {
        const [supplier] = tx
          .select()
          .from(suppliers)
          .where(eq(suppliers.id, input.supplierId))
          .limit(1)
          .all();
        if (supplier) {
          tx.update(suppliers)
            .set({
              balance: (supplier.balance ?? 0) + grandTotal,
              updatedAt: now,
            })
            .where(eq(suppliers.id, input.supplierId))
            .run();
        }
      }

      tx.insert(activityLog)
        .values({
          id: generateId(),
          userId,
          action: "CREATE",
          entity: "purchase_bill",
          entityId: bill.id,
          details: `Purchase bill ${input.billNo} created from CSV import (${items.length} rows)`,
          createdAt: now,
        })
        .run();

      tx.update(purchaseImportRows)
        .set({ rowStatus: PURCHASE_IMPORT_ROW_STATUSES.COMMITTED })
        .where(
          and(
            eq(purchaseImportRows.importId, importId),
            eq(purchaseImportRows.createdBy, userId)
          )
        )
        .run();

      return bill;
    });
  } catch (err: any) {
    if (err instanceof PurchaseImportError) throw err;
    if (typeof err?.message === "string" && err.message.includes("UNIQUE")) {
      throw new PurchaseImportError(
        `A purchase bill with number "${input.billNo}" already exists`,
        409
      );
    }
    throw new PurchaseImportError(
      `Unable to commit purchase import: ${err?.message ?? "unknown error"}`,
      500
    );
  }
}
