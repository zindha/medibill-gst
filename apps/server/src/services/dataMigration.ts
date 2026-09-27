import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  DATA_IMPORT_ENTITY_TYPES,
  DATA_IMPORT_ROW_STATUSES,
  DATA_IMPORT_STATUSES,
  GST_RATES,
  INVENTORY_TRANSACTION_TYPES,
  PAYMENT_MODES,
  auditEvents,
  batches,
  communicationPreferences,
  creditAccounts,
  customerOrderItems,
  customerOrders,
  customers,
  dataImportRows,
  dataImports,
  generateId,
  inventoryTransactions,
  invoiceBatchAllocations,
  invoiceItems,
  invoices,
  loyaltyLedger,
  medicines,
  medicineSubstitutes,
  payments,
  purchaseBillItems,
  purchaseBills,
  purchaseImportRows,
  purchaseReturns,
  purchaseReturnItems,
  refillReminders,
  salesReturnItems,
  stockAuditCounts,
  supplierQuotes,
  suppliers,
  type DataImportEntityType,
  type DataImportRowStatus,
  type DataImportStatus,
} from "../db/schema/index.js";
import { auditEvents as auditTrail } from "./audit.js";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

/** HTTP-aware error so routes can map failures to status codes. */
export class DataMigrationError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status = 400, details?: unknown) {
    super(message);
    this.name = "DataMigrationError";
    this.status = status;
    this.details = details;
  }
}

export interface DataImportIssue {
  field: string;
  message: string;
  severity: "error" | "warning";
}

/** Target fields per entity type — CSV columns auto-map onto these. */
export const DATA_IMPORT_FIELDS: Record<DataImportEntityType, readonly string[]> = {
  customers: ["name", "phone", "email", "address", "gstin", "creditLimit", "openingBalance"],
  suppliers: ["name", "phone", "email", "address", "gstin", "paymentTerms", "creditLimit", "openingBalance"],
  medicines: [
    "name",
    "genericName",
    "brand",
    "category",
    "composition",
    "hsnCode",
    "gstRate",
    "schedule",
    "dosageForm",
    "strength",
    "unit",
    "packSize",
    "unitsPerPack",
    "barcode",
    "rackLocation",
    "minQuantity",
    "reorderLevel",
    "purchasePrice",
    "sellingPrice",
    "mrp",
  ],
  stock: ["medicineName", "batchNo", "expiryDate", "quantity", "mrp", "purchasePrice", "sellingPrice"],
};

/** Header alias table: target field -> accepted source column headers. */
export const DATA_IMPORT_ALIASES: Record<DataImportEntityType, Record<string, string[]>> = {
  customers: {
    name: ["name", "customer", "party", "customer name", "party name", "cust"],
    phone: ["phone", "mobile", "mobile no", "phone no", "phone number", "contact", "contact no"],
    email: ["email", "e-mail", "mail"],
    address: ["address", "addr"],
    gstin: ["gstin", "gst no", "gst number"],
    creditLimit: ["credit limit", "creditlimit", "credit"],
    openingBalance: ["opening balance", "opening", "balance", "opening bal", "ob"],
  },
  suppliers: {
    name: ["name", "supplier", "vendor", "party", "supplier name", "vendor name"],
    phone: ["phone", "mobile", "mobile no", "phone no", "phone number", "contact", "contact no"],
    email: ["email", "e-mail", "mail"],
    address: ["address", "addr"],
    gstin: ["gstin", "gst no", "gst number"],
    paymentTerms: ["payment terms", "payment term", "terms"],
    creditLimit: ["credit limit", "creditlimit", "credit"],
    openingBalance: ["opening balance", "opening", "balance", "opening bal", "ob"],
  },
  medicines: {
    name: ["name", "product", "medicine", "item", "item name", "drug", "product name"],
    genericName: ["generic", "generic name", "salt"],
    brand: ["brand", "manufacturer", "company", "maker"],
    category: ["category", "type", "group"],
    composition: ["composition", "formulation"],
    hsnCode: ["hsn", "hsn code", "hsncode"],
    gstRate: ["gst", "gst rate", "gst%", "tax rate"],
    schedule: ["schedule", "sch"],
    dosageForm: ["dosage form", "form", "dosage"],
    strength: ["strength", "power"],
    unit: ["unit", "uom"],
    packSize: ["pack size", "pack", "pack_size"],
    unitsPerPack: ["units per pack", "units_per_pack", "units", "tabs per strip"],
    barcode: ["barcode", "ean", "gtin"],
    rackLocation: ["rack", "rack location", "location"],
    minQuantity: ["min quantity", "min qty", "minimum", "min"],
    reorderLevel: ["reorder level", "reorder", "reorder qty"],
    purchasePrice: ["purchase price", "purchase rate", "cost", "cost price", "rate", "pp"],
    sellingPrice: ["selling price", "sell price", "sale price", "sp"],
    mrp: ["mrp"],
  },
  stock: {
    medicineName: ["medicine", "medicine name", "product", "product name", "item", "drug", "name"],
    batchNo: ["batch", "batch no", "batchno", "lot", "lot no"],
    expiryDate: ["expiry", "expiry date", "exp", "exp date", "exp month"],
    quantity: ["qty", "quantity", "units", "stock", "opening qty", "opening stock"],
    mrp: ["mrp"],
    purchasePrice: ["purchase price", "purchase rate", "cost", "rate", "pp"],
    sellingPrice: ["selling price", "sell price", "sale price", "sp"],
  },
};

export interface ParsedDataCsv {
  columns: string[];
  rows: Array<{ rowIndex: number; raw: Record<string, string> }>;
}

export interface DataImportRowView {
  id: string;
  rowIndex: number;
  raw: Record<string, string>;
  normalized: Record<string, unknown> | null;
  issues: DataImportIssue[];
  status: DataImportRowStatus;
  createdEntityId: string | null;
}

export interface DataImportCounts {
  total: number;
  pending: number;
  ok: number;
  error: number;
  skipped: number;
  committed: number;
  rolledBack: number;
}

export interface DataImportSession {
  importId: string;
  entityType: DataImportEntityType;
  filename: string;
  status: DataImportStatus;
  columns: string[];
  mappings: Record<string, string>;
  rows: DataImportRowView[];
  counts: DataImportCounts;
  /** Rows with a blocking error (commit gate). */
  errors: number;
  /** Total warning issues across rows. */
  warnings: number;
}

export interface DataImportPreview {
  importId: string;
  entityType: DataImportEntityType;
  status: DataImportStatus;
  counts: DataImportCounts;
  wouldCreate: number;
  wouldSkip: number;
  errors: number;
  warnings: number;
  rows: DataImportRowView[];
  truncated: boolean;
}

const PREVIEW_SAMPLE_LIMIT = 50;

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

/** Parse a migration CSV into ordered columns + raw rows (rowIndex is 0-based). */
export function parseDataCsv(csvText: string): ParsedDataCsv {
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

/** Best-effort alias mapping of source columns -> target fields for an entity. */
export function autoMapColumns(
  columns: string[],
  entityType: DataImportEntityType
): Record<string, string> {
  const fields = DATA_IMPORT_FIELDS[entityType];
  const aliases = DATA_IMPORT_ALIASES[entityType];
  const lookup = new Map<string, string>();
  for (const field of fields) {
    lookup.set(normalizeHeader(field), field);
    for (const alias of aliases[field] ?? []) lookup.set(normalizeHeader(alias), field);
  }

  const mappings: Record<string, string> = {};
  const taken = new Set<string>();
  for (const col of columns) {
    const norm = normalizeHeader(col);
    if (!norm) continue;
    const field = lookup.get(norm);
    if (field && !taken.has(field)) {
      mappings[col] = field;
      taken.add(field);
    }
  }
  return mappings;
}

function readRaw(raw: Record<string, string>, key: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(raw, key)) return raw[key];
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
 * Normalize a stock expiry to a real date:
 *  - YYYY-MM-DD   kept as-is (validated)
 *  - MM/YYYY      last day of that month ("02/2027" -> 2027-02-28)
 *  - MM/YY        same, 2000+YY ("02/27"    -> 2027-02-28, "12/27" -> 2027-12-31)
 *  - DD/MM/YYYY   day-first ("27/12/2027"    -> 2027-12-31)
 */
export function normalizeStockExpiry(value: string): string | null {
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

  m = v.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) {
    const mo = Number(m[1]);
    const y = Number(m[2]);
    if (mo < 1 || mo > 12) return null;
    return `${y}-${pad2(mo)}-${pad2(daysInMonth(y, mo))}`;
  }

  m = v.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) {
    const mo = Number(m[1]);
    const yy = Number(m[2]);
    if (mo < 1 || mo > 12 || yy > 99) return null;
    const y = 2000 + yy;
    return `${y}-${pad2(mo)}-${pad2(daysInMonth(y, mo))}`;
  }

  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    const y = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
    return `${y}-${pad2(mo)}-${pad2(d)}`;
  }

  return null;
}

function parseNumber(value: string): number | null {
  const cleaned = String(value).replace(/[,₹\s]/g, "").replace(/%$/, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function stripPhone(value: string): string {
  return value.replace(/\D/g, "");
}

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/i;

// ---------------------------------------------------------------------------
// Row normalization (pure — no DB)
// ---------------------------------------------------------------------------

type NormalizedRow = Record<string, unknown>;

/**
 * Validate + normalize one raw CSV row for the session's entity type using the
 * best-effort column mappings. Returns the typed values plus every issue found;
 * issues with severity "error" block commit, "warning" issues are informational.
 */
export function normalizeEntityRow(
  entityType: DataImportEntityType,
  raw: Record<string, string>,
  mappings: Record<string, string>
): { normalized: NormalizedRow; issues: DataImportIssue[] } {
  const issues: DataImportIssue[] = [];
  const normalized: NormalizedRow = {};

  const get = (field: string): string => {
    for (const [key, target] of Object.entries(mappings)) {
      if (target !== field) continue;
      const value = readRaw(raw, key);
      if (value !== undefined && value.trim() !== "") return value.trim();
    }
    return "";
  };

  const reqString = (field: string, label: string): string | null => {
    const value = get(field);
    if (!value) {
      issues.push({ field, message: `${label} is required`, severity: "error" });
      return null;
    }
    normalized[field] = value;
    return value;
  };

  const optionalString = (field: string): void => {
    const value = get(field);
    if (value) normalized[field] = value;
  };

  const numberField = (field: string, opts: { required?: boolean; min?: number } = {}): void => {
    const value = get(field);
    if (!value) {
      if (opts.required) {
        issues.push({ field, message: `${field} is required`, severity: "error" });
      }
      return;
    }
    const n = parseNumber(value);
    if (n === null) {
      issues.push({ field, message: `${field} "${value}" is not a number`, severity: "error" });
      return;
    }
    if (opts.min !== undefined && n < opts.min) {
      issues.push({ field, message: `${field} must be ${opts.min} or more`, severity: "error" });
      return;
    }
    normalized[field] = n;
  };

  const phoneField = (): void => {
    const value = get("phone");
    if (!value) return;
    const digits = stripPhone(value);
    if (!digits) return;
    normalized.phone = digits;
    if (digits.length !== 10) {
      issues.push({
        field: "phone",
        message: `Phone "${value}" is not a 10-digit number (${digits.length} digits found)`,
        severity: "warning",
      });
    }
  };

  const gstinField = (): void => {
    const value = get("gstin");
    if (!value) return;
    if (!GSTIN_RE.test(value)) {
      issues.push({
        field: "gstin",
        message: `GSTIN "${value}" does not look like a valid GSTIN`,
        severity: "warning",
      });
    }
    normalized.gstin = value;
  };

  if (entityType === "customers" || entityType === "suppliers") {
    reqString("name", entityType === "customers" ? "Customer name" : "Supplier name");
    phoneField();
    optionalString("email");
    optionalString("address");
    gstinField();
    if (entityType === "suppliers") optionalString("paymentTerms");
    numberField("creditLimit", { min: 0 });
    const opening = get("openingBalance");
    if (opening) {
      const n = parseNumber(opening);
      if (n === null) {
        issues.push({
          field: "openingBalance",
          message: `Opening balance "${opening}" is not a number`,
          severity: "error",
        });
      } else {
        normalized.openingBalance = n;
      }
    } else {
      normalized.openingBalance = 0;
    }
    return { normalized, issues };
  }

  if (entityType === "medicines") {
    reqString("name", "Medicine name");
    optionalString("genericName");
    optionalString("brand");
    optionalString("category");
    optionalString("composition");
    optionalString("hsnCode");
    optionalString("schedule");
    optionalString("dosageForm");
    optionalString("strength");
    optionalString("unit");
    optionalString("packSize");
    optionalString("barcode");
    optionalString("rackLocation");

    const gstRaw = get("gstRate");
    if (!gstRaw) {
      normalized.gstRate = "12";
    } else {
      const gst = parseNumber(gstRaw);
      if (gst === null || !(GST_RATES as readonly string[]).includes(String(gst))) {
        issues.push({
          field: "gstRate",
          message: `GST rate "${gstRaw}" is not a standard rate — using 12%`,
          severity: "warning",
        });
        normalized.gstRate = "12";
      } else {
        normalized.gstRate = String(gst);
      }
    }

    numberField("unitsPerPack", { min: 0 });
    numberField("minQuantity", { min: 0 });
    numberField("reorderLevel", { min: 0 });
    numberField("purchasePrice", { min: 0 });
    numberField("sellingPrice", { min: 0 });
    numberField("mrp", { min: 0 });
    return { normalized, issues };
  }

  // entityType === "stock"
  reqString("medicineName", "Medicine name");
  reqString("batchNo", "Batch number");

  const expiryRaw = get("expiryDate");
  if (!expiryRaw) {
    issues.push({ field: "expiryDate", message: "Expiry date is required", severity: "error" });
  } else {
    const expiry = normalizeStockExpiry(expiryRaw);
    if (!expiry) {
      issues.push({
        field: "expiryDate",
        message: `Expiry "${expiryRaw}" must be YYYY-MM-DD, MM/YYYY, MM/YY or DD/MM/YYYY`,
        severity: "error",
      });
    } else {
      normalized.expiryDate = expiry;
    }
  }

  const qtyRaw = get("quantity");
  if (!qtyRaw) {
    issues.push({ field: "quantity", message: "Quantity is required", severity: "error" });
  } else {
    const qty = parseNumber(qtyRaw);
    if (qty === null) {
      issues.push({ field: "quantity", message: `Quantity "${qtyRaw}" is not a number`, severity: "error" });
    } else if (qty < 0) {
      issues.push({ field: "quantity", message: "Quantity must be 0 or more", severity: "error" });
    } else {
      normalized.quantity = qty;
    }
  }

  // Prices are optional — blank falls back to the medicine's own values at
  // resolve time; present-but-invalid is an error (never silently dropped).
  numberField("mrp", { min: 0 });
  numberField("purchasePrice", { min: 0 });
  numberField("sellingPrice", { min: 0 });

  return { normalized, issues };
}

// ---------------------------------------------------------------------------
// Import session lifecycle
// ---------------------------------------------------------------------------

async function loadImport(importId: string, userId: string) {
  const [record] = await db
    .select()
    .from(dataImports)
    .where(and(eq(dataImports.id, importId), eq(dataImports.createdBy, userId)))
    .limit(1);
  if (!record) throw new DataMigrationError("Data import not found", 404);
  return record;
}

async function loadRows(importId: string, userId: string) {
  return db
    .select()
    .from(dataImportRows)
    .where(
      and(eq(dataImportRows.importId, importId), eq(dataImportRows.createdBy, userId))
    )
    .orderBy(asc(dataImportRows.rowIndex));
}

function emptyCounts(): DataImportCounts {
  return { total: 0, pending: 0, ok: 0, error: 0, skipped: 0, committed: 0, rolledBack: 0 };
}

function tally(counts: DataImportCounts, status: DataImportRowStatus): void {
  counts.total++;
  switch (status) {
    case DATA_IMPORT_ROW_STATUSES.PENDING:
      counts.pending++;
      break;
    case DATA_IMPORT_ROW_STATUSES.OK:
      counts.ok++;
      break;
    case DATA_IMPORT_ROW_STATUSES.ERROR:
      counts.error++;
      break;
    case DATA_IMPORT_ROW_STATUSES.SKIPPED:
      counts.skipped++;
      break;
    case DATA_IMPORT_ROW_STATUSES.COMMITTED:
      counts.committed++;
      break;
    case DATA_IMPORT_ROW_STATUSES.ROLLED_BACK:
      counts.rolledBack++;
      break;
  }
}

function buildSession(
  record: { id: string; entityType: DataImportEntityType; filename: string; status: DataImportStatus | null },
  columns: string[],
  mappings: Record<string, string>,
  rows: DataImportRowView[]
): DataImportSession {
  const counts = emptyCounts();
  let warnings = 0;
  let errors = 0;
  for (const row of rows) {
    tally(counts, row.status);
    if (row.status === DATA_IMPORT_ROW_STATUSES.ERROR) errors++;
    for (const issue of row.issues) if (issue.severity === "warning") warnings++;
  }
  return {
    importId: record.id,
    entityType: record.entityType,
    filename: record.filename,
    status: (record.status ?? DATA_IMPORT_STATUSES.DRAFT) as DataImportStatus,
    columns,
    mappings,
    rows,
    counts,
    errors,
    warnings,
  };
}

interface StockMedicine {
  id: string;
  name: string;
  brand: string | null;
  mrp: number | null;
  purchasePrice: number | null;
  sellingPrice: number | null;
}

interface ResolveContext {
  /** Existing tenant entities (and stock batches) keyed for dedupe matching. */
  existingKeys: Set<string>;
  /** stock only: tenant medicines by lower-cased name. */
  stockMedicines?: Map<string, StockMedicine>;
}

async function buildResolveContext(
  userId: string,
  entityType: DataImportEntityType
): Promise<ResolveContext> {
  const keys = new Set<string>();

  if (entityType === "customers" || entityType === "suppliers") {
    const table = entityType === "customers" ? customers : suppliers;
    const rows = await db
      .select({ id: table.id, name: table.name, phone: table.phone })
      .from(table)
      .where(eq(table.createdBy, userId));
    for (const row of rows) {
      keys.add(`name:${row.name.trim().toLowerCase()}`);
      const phone = row.phone ? stripPhone(row.phone) : "";
      if (phone) keys.add(`phone:${phone}`);
    }
    return { existingKeys: keys };
  }

  if (entityType === "medicines") {
    const rows = await db
      .select({ id: medicines.id, name: medicines.name, brand: medicines.brand })
      .from(medicines)
      .where(eq(medicines.createdBy, userId));
    for (const row of rows) {
      keys.add(`med:${row.name.trim().toLowerCase()}|${(row.brand ?? "").trim().toLowerCase()}`);
    }
    return { existingKeys: keys };
  }

  // stock
  const medRows = await db
    .select({
      id: medicines.id,
      name: medicines.name,
      brand: medicines.brand,
      mrp: medicines.mrp,
      purchasePrice: medicines.purchasePrice,
      sellingPrice: medicines.sellingPrice,
    })
    .from(medicines)
    .where(eq(medicines.createdBy, userId));
  const stockMedicines = new Map<string, StockMedicine>();
  for (const row of medRows) {
    const key = row.name.trim().toLowerCase();
    if (!stockMedicines.has(key)) stockMedicines.set(key, row);
  }

  const batchRows = await db
    .select({ medicineId: batches.medicineId, batchNo: batches.batchNo })
    .from(batches)
    .where(eq(batches.createdBy, userId));
  for (const row of batchRows) {
    // Same key shape as dedupeKey() → an existing medicine+batch pair skips.
    keys.add(`${row.medicineId}|${row.batchNo.trim().toLowerCase()}`);
  }

  return { existingKeys: keys, stockMedicines };
}

function dedupeKey(entityType: DataImportEntityType, normalized: NormalizedRow): string[] {
  if (entityType === "customers" || entityType === "suppliers") {
    const keys: string[] = [];
    const name = typeof normalized.name === "string" ? normalized.name.trim().toLowerCase() : "";
    if (name) keys.push(`name:${name}`);
    const phone = typeof normalized.phone === "string" ? stripPhone(normalized.phone) : "";
    if (phone) keys.push(`phone:${phone}`);
    return keys;
  }
  if (entityType === "medicines") {
    const name = typeof normalized.name === "string" ? normalized.name.trim().toLowerCase() : "";
    const brand = typeof normalized.brand === "string" ? normalized.brand.trim().toLowerCase() : "";
    return [`med:${name}|${brand}`];
  }
  const medicineId = typeof normalized.medicineId === "string" ? normalized.medicineId : "";
  const batchNo =
    typeof normalized.batchNo === "string" ? normalized.batchNo.trim().toLowerCase() : "";
  return medicineId && batchNo ? [`${medicineId}|${batchNo}`] : [];
}

/**
 * Recompute normalization, issues, entity matching and dedupe status for every
 * row of a draft import and persist the result. Committed / rolled-back
 * imports are returned as stored (no downgrade of their rows).
 */
export async function resolveImport(
  importId: string,
  userId: string
): Promise<DataImportSession> {
  const record = await loadImport(importId, userId);
  const rows = await loadRows(importId, userId);
  const parsedRaw = rows.map((row) => safeJson<Record<string, string>>(row.raw, {}));
  const columns = parsedRaw.length > 0 ? Object.keys(parsedRaw[0]) : [];
  const mappings = autoMapColumns(columns, record.entityType);

  if (record.status !== DATA_IMPORT_STATUSES.DRAFT) {
    const views: DataImportRowView[] = rows.map((row, i) => ({
      id: row.id,
      rowIndex: row.rowIndex,
      raw: parsedRaw[i],
      normalized: safeJson<Record<string, unknown> | null>(row.normalized, null),
      issues: safeJson<DataImportIssue[]>(row.issues, []),
      status: row.rowStatus ?? DATA_IMPORT_ROW_STATUSES.PENDING,
      createdEntityId: row.createdEntityId,
    }));
    return buildSession(record, columns, mappings, views);
  }

  const ctx = await buildResolveContext(userId, record.entityType);
  const seenKeys = new Set<string>();
  const views: DataImportRowView[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const raw = parsedRaw[i];
    const { normalized, issues } = normalizeEntityRow(record.entityType, raw, mappings);

    // Stock: resolve the medicine + price fallbacks (needs the DB).
    if (record.entityType === "stock" && !issues.some((x) => x.severity === "error")) {
      const medicineName = String(normalized.medicineName ?? "").trim();
      const med = medicineName ? ctx.stockMedicines?.get(medicineName.toLowerCase()) : undefined;
      if (!med) {
        issues.push({
          field: "medicineName",
          message: `No medicine named "${medicineName}" exists in your catalog — add it first (separate session)`,
          severity: "error",
        });
      } else {
        normalized.medicineId = med.id;
        if (normalized.mrp === undefined) normalized.mrp = med.mrp ?? med.sellingPrice ?? 0;
        if (normalized.purchasePrice === undefined) normalized.purchasePrice = med.purchasePrice ?? 0;
        if (normalized.sellingPrice === undefined) {
          normalized.sellingPrice = med.sellingPrice ?? med.mrp ?? 0;
        }
      }
    }

    let skipMessage: string | null = null;
    if (!issues.some((x) => x.severity === "error")) {
      const keys = dedupeKey(record.entityType, normalized);
      let duplicate = false;
      for (const key of keys) {
        if (ctx.existingKeys.has(key)) {
          duplicate = true;
          skipMessage = "Already exists — this row will be skipped (no update)";
          break;
        }
      }
      if (!duplicate) {
        for (const key of keys) {
          if (seenKeys.has(key)) {
            duplicate = true;
            skipMessage = "Duplicate of an earlier row in this file — will be skipped";
            break;
          }
        }
      }
      if (duplicate) {
        issues.push({ field: "row", message: skipMessage!, severity: "warning" });
      } else {
        for (const key of keys) {
          seenKeys.add(key);
          ctx.existingKeys.add(key);
        }
      }
    }

    const hasError = issues.some((x) => x.severity === "error");
    const status: DataImportRowStatus = hasError
      ? DATA_IMPORT_ROW_STATUSES.ERROR
      : skipMessage
        ? DATA_IMPORT_ROW_STATUSES.SKIPPED
        : DATA_IMPORT_ROW_STATUSES.OK;

    await db
      .update(dataImportRows)
      .set({
        normalized: JSON.stringify(normalized),
        issues: JSON.stringify(issues),
        rowStatus: status,
      })
      .where(eq(dataImportRows.id, row.id));

    views.push({
      id: row.id,
      rowIndex: row.rowIndex,
      raw,
      normalized,
      issues,
      status,
      createdEntityId: row.createdEntityId,
    });
  }

  return buildSession(record, columns, mappings, views);
}

/** Create a draft import from CSV text (parsed + best-effort mapped + resolved). */
export async function createImport(
  userId: string,
  entityType: DataImportEntityType,
  filename: string,
  csvText: string
): Promise<DataImportSession> {
  const parsed = parseDataCsv(csvText);
  if (parsed.columns.length === 0) {
    throw new DataMigrationError("CSV has no header row", 400);
  }
  if (parsed.rows.length === 0) {
    throw new DataMigrationError("CSV has no data rows", 400);
  }

  const now = new Date();
  const id = generateId();

  db.transaction((tx) => {
    tx.insert(dataImports)
      .values({
        id,
        createdBy: userId,
        entityType,
        filename,
        status: DATA_IMPORT_STATUSES.DRAFT,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    for (const row of parsed.rows) {
      tx.insert(dataImportRows)
        .values({
          id: generateId(),
          importId: id,
          createdBy: userId,
          rowIndex: row.rowIndex,
          raw: JSON.stringify(row.raw),
          normalized: null,
          issues: JSON.stringify([]),
          rowStatus: DATA_IMPORT_ROW_STATUSES.PENDING,
          createdAt: now,
        })
        .run();
    }
  });

  return resolveImport(id, userId);
}

/** List the tenant's import sessions, newest first, with row status counts. */
export async function listImports(userId: string) {
  const records = await db
    .select()
    .from(dataImports)
    .where(eq(dataImports.createdBy, userId))
    .orderBy(desc(dataImports.createdAt));

  if (records.length === 0) return [];

  const ids = records.map((r) => r.id);
  const grouped = await db
    .select({ importId: dataImportRows.importId, rowStatus: dataImportRows.rowStatus })
    .from(dataImportRows)
    .where(inArray(dataImportRows.importId, ids));

  const countsById = new Map<string, DataImportCounts>();
  for (const record of records) countsById.set(record.id, emptyCounts());
  for (const row of grouped) {
    const counts = countsById.get(row.importId);
    if (counts) tally(counts, row.rowStatus ?? DATA_IMPORT_ROW_STATUSES.PENDING);
  }

  return records.map((record) => ({
    id: record.id,
    entityType: record.entityType,
    filename: record.filename,
    status: record.status,
    counts: countsById.get(record.id)!,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }));
}

/**
 * Dry-run preview: fresh resolve + counts + wouldCreate/wouldSkip + a sample of
 * rows. Writes only the recomputed row statuses (never creates entities and
 * never changes the session status).
 */
export async function previewImport(userId: string, importId: string): Promise<DataImportPreview> {
  const session = await resolveImport(importId, userId);
  const sample = session.rows.slice(0, PREVIEW_SAMPLE_LIMIT);
  return {
    importId: session.importId,
    entityType: session.entityType,
    status: session.status,
    counts: session.counts,
    wouldCreate: session.counts.ok,
    wouldSkip: session.counts.skipped,
    errors: session.errors,
    warnings: session.warnings,
    rows: sample,
    truncated: session.rows.length > sample.length,
  };
}

/** Delete a draft import (and its rows). Committed/rolled-back → 404. */
export async function deleteImport(userId: string, importId: string): Promise<void> {
  const record = await loadImport(importId, userId);
  if (record.status !== DATA_IMPORT_STATUSES.DRAFT) {
    throw new DataMigrationError("Data import not found", 404);
  }
  db.transaction((tx) => {
    tx.delete(dataImportRows)
      .where(
        and(eq(dataImportRows.importId, importId), eq(dataImportRows.createdBy, userId))
      )
      .run();
    tx.delete(dataImports)
      .where(and(eq(dataImports.id, importId), eq(dataImports.createdBy, userId)))
      .run();
  });
}

// ---------------------------------------------------------------------------
// Commit (one atomic transaction per session)
// ---------------------------------------------------------------------------

interface CommitIssue {
  rowIndex: number;
  field: string;
  message: string;
}

function firstErrorOf(row: DataImportRowView): CommitIssue {
  const issue = row.issues.find((i) => i.severity === "error");
  return {
    rowIndex: row.rowIndex,
    field: issue?.field ?? "row",
    message: issue?.message ?? "Row has a blocking error",
  };
}

export interface CommitResult {
  importId: string;
  entityType: DataImportEntityType;
  status: DataImportStatus;
  created: number;
  skipped: number;
}

/**
 * Commit a draft import: validates EVERY row first (any error row → 400 with
 * per-row details and nothing persisted), then creates the entities in ONE
 * better-sqlite3 transaction and marks the session committed. A second commit
 * attempt gets 409.
 */
export async function commitImport(userId: string, importId: string): Promise<CommitResult> {
  const record = await loadImport(importId, userId);
  if (record.status !== DATA_IMPORT_STATUSES.DRAFT) {
    throw new DataMigrationError("Data import has already been committed", 409);
  }

  const session = await resolveImport(importId, userId);
  const errorRows = session.rows.filter((r) => r.status === DATA_IMPORT_ROW_STATUSES.ERROR);
  if (errorRows.length > 0) {
    throw new DataMigrationError(
      "Commit validation failed — fix the reported rows",
      400,
      { rows: errorRows.map(firstErrorOf) }
    );
  }

  const createRows = session.rows.filter((r) => r.status === DATA_IMPORT_ROW_STATUSES.OK);
  const skippedRows = session.rows.filter((r) => r.status === DATA_IMPORT_ROW_STATUSES.SKIPPED);

  // Stock: re-verify every medicine still exists in this tenant before writing.
  if (record.entityType === "stock") {
    const medicineIds = [
      ...new Set(
        createRows
          .map((r) => String((r.normalized as { medicineId?: unknown } | null)?.medicineId ?? ""))
          .filter(Boolean)
      ),
    ];
    if (medicineIds.length > 0) {
      const owned = await db
        .select({ id: medicines.id })
        .from(medicines)
        .where(and(eq(medicines.createdBy, userId), inArray(medicines.id, medicineIds)));
      const ownedIds = new Set(owned.map((m) => m.id));
      const missing = createRows.filter((r) => {
        const id = String((r.normalized as { medicineId?: unknown } | null)?.medicineId ?? "");
        return !ownedIds.has(id);
      });
      if (missing.length > 0) {
        throw new DataMigrationError(
          "Commit validation failed — fix the reported rows",
          400,
          { rows: missing.map(firstErrorOf) }
        );
      }
    }
  }

  const now = new Date();

  try {
    return db.transaction((tx): CommitResult => {
      // Claim the session first: a second concurrent commit loses the race here.
      const claimed = tx
        .update(dataImports)
        .set({ status: DATA_IMPORT_STATUSES.COMMITTED, updatedAt: now })
        .where(
          and(
            eq(dataImports.id, importId),
            eq(dataImports.createdBy, userId),
            eq(dataImports.status, DATA_IMPORT_STATUSES.DRAFT)
          )
        )
        .returning()
        .all();
      if (claimed.length === 0) {
        throw new DataMigrationError("Data import has already been committed", 409);
      }

      const seenKeys = new Set<string>();
      let created = 0;
      let inCommitSkipped = 0;

      for (const row of createRows) {
        const normalized = (row.normalized ?? {}) as NormalizedRow;

        // Safety net: resolve already dedupes, but re-check inside the
        // transaction so nothing can slip through a concurrent insert.
        const duplicate = dedupeKey(record.entityType, normalized).some((k) => seenKeys.has(k));
        if (duplicate) {
          const issues = [...row.issues, {
            field: "row",
            message: "Duplicate — this row will be skipped",
            severity: "warning" as const,
          }];
          tx.update(dataImportRows)
            .set({ rowStatus: DATA_IMPORT_ROW_STATUSES.SKIPPED, issues: JSON.stringify(issues) })
            .where(eq(dataImportRows.id, row.id))
            .run();
          inCommitSkipped++;
          continue;
        }

        const entityId = insertEntity(tx, record.entityType, userId, normalized, record.filename, now);
        for (const key of dedupeKey(record.entityType, normalized)) seenKeys.add(key);

        tx.update(dataImportRows)
          .set({
            rowStatus: DATA_IMPORT_ROW_STATUSES.COMMITTED,
            createdEntityId: entityId,
          })
          .where(eq(dataImportRows.id, row.id))
          .run();
        created++;
      }

      tx.insert(auditEvents)
        .values({
          id: generateId(),
          actorId: userId,
          action: "data_import.commit",
          entity: "data_import",
          entityId: importId,
          metadata: JSON.stringify({
            entityType: record.entityType,
            filename: record.filename,
            created,
            skipped: skippedRows.length + inCommitSkipped,
          }),
          createdAt: now,
        })
        .run();

      return {
        importId,
        entityType: record.entityType,
        status: DATA_IMPORT_STATUSES.COMMITTED,
        created,
        skipped: skippedRows.length + inCommitSkipped,
      };
    });
  } catch (err: unknown) {
    if (err instanceof DataMigrationError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new DataMigrationError(`Unable to commit data import: ${message}`, 500);
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function insertEntity(
  tx: Tx,
  entityType: DataImportEntityType,
  userId: string,
  n: NormalizedRow,
  filename: string,
  now: Date
): string {
  const id = generateId();
  const str = (key: string): string | undefined => {
    const v = n[key];
    return typeof v === "string" && v !== "" ? v : undefined;
  };
  const num = (key: string): number | undefined => (typeof n[key] === "number" ? (n[key] as number) : undefined);

  if (entityType === "customers") {
    const opening = num("openingBalance") ?? 0;
    tx.insert(customers)
      .values({
        id,
        name: str("name")!,
        phone: str("phone") ?? null,
        email: str("email") ?? null,
        address: str("address") ?? null,
        gstin: str("gstin") ?? null,
        creditLimit: num("creditLimit") ?? null,
        openingBalance: opening,
        balance: opening,
        isActive: true,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  if (entityType === "suppliers") {
    const opening = num("openingBalance") ?? 0;
    tx.insert(suppliers)
      .values({
        id,
        name: str("name")!,
        phone: str("phone") ?? null,
        email: str("email") ?? null,
        address: str("address") ?? null,
        gstin: str("gstin") ?? null,
        paymentTerms: str("paymentTerms") ?? null,
        creditLimit: num("creditLimit") ?? null,
        openingBalance: opening,
        balance: opening,
        isActive: true,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  if (entityType === "medicines") {
    tx.insert(medicines)
      .values({
        id,
        name: str("name")!,
        genericName: str("genericName") ?? null,
        brand: str("brand") ?? null,
        category: str("category") ?? null,
        composition: str("composition") ?? null,
        hsnCode: str("hsnCode") ?? null,
        gstRate: (str("gstRate") ?? "12") as (typeof GST_RATES)[number],
        schedule: str("schedule") ?? null,
        dosageForm: str("dosageForm") ?? null,
        strength: str("strength") ?? null,
        unit: str("unit") ?? "unit",
        packSize: str("packSize") ?? null,
        unitsPerPack: num("unitsPerPack") ?? 1,
        barcode: str("barcode") ?? null,
        rackLocation: str("rackLocation") ?? null,
        minQuantity: num("minQuantity") ?? 10,
        reorderLevel: num("reorderLevel") ?? 20,
        purchasePrice: num("purchasePrice") ?? 0,
        sellingPrice: num("sellingPrice") ?? 0,
        mrp: num("mrp") ?? null,
        isActive: true,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  // stock
  const medicineId = String(n.medicineId ?? "");
  const quantity = num("quantity") ?? 0;
  const batchId = generateId();
  tx.insert(batches)
    .values({
      id: batchId,
      medicineId,
      batchNo: str("batchNo")!,
      expiryDate: String(n.expiryDate ?? ""),
      mrp: num("mrp") ?? 0,
      purchasePrice: num("purchasePrice") ?? 0,
      sellingPrice: num("sellingPrice") ?? 0,
      quantity,
      initialQuantity: quantity,
      isActive: true,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  tx.insert(inventoryTransactions)
    .values({
      id: generateId(),
      medicineId,
      batchId,
      type: INVENTORY_TRANSACTION_TYPES.STOCK_IN,
      quantity,
      balanceAfter: quantity,
      rate: num("purchasePrice") ?? 0,
      reference: filename,
      reason: "Opening stock import",
      createdBy: userId,
      createdAt: now,
    })
    .run();

  return batchId;
}

// ---------------------------------------------------------------------------
// Rollback (all-or-nothing: any referenced row → 409, nothing deleted)
// ---------------------------------------------------------------------------

export interface RollbackResult {
  importId: string;
  entityType: DataImportEntityType;
  status: DataImportStatus;
  deleted: number;
}

interface BlockedRow {
  rowIndex: number;
  createdEntityId: string;
  reason: string;
}

interface RefSource {
  label: string;
  run: (ids: string[]) => Promise<Array<{ value: string | null }>>;
}

/** Ids referenced by another table — used for rollback safety checks. */
async function collectReferences(ids: string[], sources: RefSource[]): Promise<Map<string, string>> {
  const referenced = new Map<string, string>();
  if (ids.length === 0) return referenced;
  for (const source of sources) {
    const rows = await source.run(ids);
    for (const row of rows) {
      if (row.value && !referenced.has(row.value)) referenced.set(row.value, source.label);
    }
  }
  return referenced;
}

const CUSTOMER_REF_SOURCES: RefSource[] = [
  { label: "invoices", run: (ids) => db.select({ value: invoices.customerId }).from(invoices).where(inArray(invoices.customerId, ids)) },
  { label: "payments", run: (ids) => db.select({ value: payments.customerId }).from(payments).where(inArray(payments.customerId, ids)) },
  { label: "credit accounts", run: (ids) => db.select({ value: creditAccounts.customerId }).from(creditAccounts).where(inArray(creditAccounts.customerId, ids)) },
  { label: "refill reminders", run: (ids) => db.select({ value: refillReminders.customerId }).from(refillReminders).where(inArray(refillReminders.customerId, ids)) },
  { label: "loyalty entries", run: (ids) => db.select({ value: loyaltyLedger.customerId }).from(loyaltyLedger).where(inArray(loyaltyLedger.customerId, ids)) },
  { label: "orders", run: (ids) => db.select({ value: customerOrders.customerId }).from(customerOrders).where(inArray(customerOrders.customerId, ids)) },
  { label: "communication preferences", run: (ids) => db.select({ value: communicationPreferences.customerId }).from(communicationPreferences).where(inArray(communicationPreferences.customerId, ids)) },
];

const SUPPLIER_REF_SOURCES: RefSource[] = [
  { label: "purchase bills", run: (ids) => db.select({ value: purchaseBills.supplierId }).from(purchaseBills).where(inArray(purchaseBills.supplierId, ids)) },
  { label: "purchase returns", run: (ids) => db.select({ value: purchaseReturns.supplierId }).from(purchaseReturns).where(inArray(purchaseReturns.supplierId, ids)) },
  { label: "batches", run: (ids) => db.select({ value: batches.supplierId }).from(batches).where(inArray(batches.supplierId, ids)) },
  { label: "payments", run: (ids) => db.select({ value: payments.supplierId }).from(payments).where(inArray(payments.supplierId, ids)) },
  { label: "credit accounts", run: (ids) => db.select({ value: creditAccounts.supplierId }).from(creditAccounts).where(inArray(creditAccounts.supplierId, ids)) },
  { label: "supplier quotes", run: (ids) => db.select({ value: supplierQuotes.supplierId }).from(supplierQuotes).where(inArray(supplierQuotes.supplierId, ids)) },
];

const MEDICINE_REF_SOURCES: RefSource[] = [
  { label: "invoice items", run: (ids) => db.select({ value: invoiceItems.medicineId }).from(invoiceItems).where(inArray(invoiceItems.medicineId, ids)) },
  { label: "purchase bill items", run: (ids) => db.select({ value: purchaseBillItems.medicineId }).from(purchaseBillItems).where(inArray(purchaseBillItems.medicineId, ids)) },
  { label: "batches", run: (ids) => db.select({ value: batches.medicineId }).from(batches).where(inArray(batches.medicineId, ids)) },
  { label: "inventory transactions", run: (ids) => db.select({ value: inventoryTransactions.medicineId }).from(inventoryTransactions).where(inArray(inventoryTransactions.medicineId, ids)) },
  { label: "invoice allocations", run: (ids) => db.select({ value: invoiceBatchAllocations.medicineId }).from(invoiceBatchAllocations).where(inArray(invoiceBatchAllocations.medicineId, ids)) },
  { label: "sales returns", run: (ids) => db.select({ value: salesReturnItems.medicineId }).from(salesReturnItems).where(inArray(salesReturnItems.medicineId, ids)) },
  { label: "purchase returns", run: (ids) => db.select({ value: purchaseReturnItems.medicineId }).from(purchaseReturnItems).where(inArray(purchaseReturnItems.medicineId, ids)) },
  { label: "refill reminders", run: (ids) => db.select({ value: refillReminders.medicineId }).from(refillReminders).where(inArray(refillReminders.medicineId, ids)) },
  { label: "purchase import drafts", run: (ids) => db.select({ value: purchaseImportRows.medicineId }).from(purchaseImportRows).where(inArray(purchaseImportRows.medicineId, ids)) },
  { label: "medicine substitutes", run: (ids) => db.select({ value: medicineSubstitutes.medicineId }).from(medicineSubstitutes).where(inArray(medicineSubstitutes.medicineId, ids)) },
  { label: "medicine substitutes", run: (ids) => db.select({ value: medicineSubstitutes.substituteMedicineId }).from(medicineSubstitutes).where(inArray(medicineSubstitutes.substituteMedicineId, ids)) },
  { label: "supplier quotes", run: (ids) => db.select({ value: supplierQuotes.medicineId }).from(supplierQuotes).where(inArray(supplierQuotes.medicineId, ids)) },
  { label: "stock audits", run: (ids) => db.select({ value: stockAuditCounts.medicineId }).from(stockAuditCounts).where(inArray(stockAuditCounts.medicineId, ids)) },
  { label: "order items", run: (ids) => db.select({ value: customerOrderItems.medicineId }).from(customerOrderItems).where(inArray(customerOrderItems.medicineId, ids)) },
];

const BATCH_REF_SOURCES: RefSource[] = [
  { label: "invoice items", run: (ids) => db.select({ value: invoiceItems.batchId }).from(invoiceItems).where(inArray(invoiceItems.batchId, ids)) },
  { label: "invoice allocations", run: (ids) => db.select({ value: invoiceBatchAllocations.batchId }).from(invoiceBatchAllocations).where(inArray(invoiceBatchAllocations.batchId, ids)) },
  { label: "sales returns", run: (ids) => db.select({ value: salesReturnItems.batchId }).from(salesReturnItems).where(inArray(salesReturnItems.batchId, ids)) },
  { label: "purchase bill items", run: (ids) => db.select({ value: purchaseBillItems.batchId }).from(purchaseBillItems).where(inArray(purchaseBillItems.batchId, ids)) },
  { label: "purchase returns", run: (ids) => db.select({ value: purchaseReturnItems.batchId }).from(purchaseReturnItems).where(inArray(purchaseReturnItems.batchId, ids)) },
  { label: "stock audits", run: (ids) => db.select({ value: stockAuditCounts.batchId }).from(stockAuditCounts).where(inArray(stockAuditCounts.batchId, ids)) },
];

async function blockedRowsFor(
  entityType: DataImportEntityType,
  createdRows: Array<{ rowIndex: number; createdEntityId: string | null }>
): Promise<BlockedRow[]> {
  const rows = createdRows.filter((r) => r.createdEntityId) as Array<{
    rowIndex: number;
    createdEntityId: string;
  }>;
  const ids = rows.map((r) => r.createdEntityId);
  const blocked: BlockedRow[] = [];

  if (entityType === "customers" || entityType === "suppliers" || entityType === "medicines") {
    const sources =
      entityType === "customers"
        ? CUSTOMER_REF_SOURCES
        : entityType === "suppliers"
          ? SUPPLIER_REF_SOURCES
          : MEDICINE_REF_SOURCES;
    const referenced = await collectReferences(ids, sources);
    for (const row of rows) {
      const label = referenced.get(row.createdEntityId);
      if (label) blocked.push({ ...row, reason: `referenced by ${label}` });
    }
    return blocked;
  }

  // stock — the batch must be untouched (quantity still equals initialQuantity)
  if (ids.length > 0) {
    const batchRows = await db
      .select({
        id: batches.id,
        quantity: batches.quantity,
        initialQuantity: batches.initialQuantity,
      })
      .from(batches)
      .where(inArray(batches.id, ids));
    const byId = new Map(batchRows.map((b) => [b.id, b]));
    for (const row of rows) {
      const batch = byId.get(row.createdEntityId);
      if (!batch) continue;
      if ((batch.quantity ?? 0) !== (batch.initialQuantity ?? 0)) {
        blocked.push({ ...row, reason: "stock moved since commit" });
      }
    }
    // Sold / audited batches are referenced elsewhere too (FK safety).
    const referenced = await collectReferences(ids, BATCH_REF_SOURCES);
    for (const row of rows) {
      if (blocked.some((b) => b.rowIndex === row.rowIndex)) continue;
      const label = referenced.get(row.createdEntityId);
      if (label) blocked.push({ ...row, reason: `referenced by ${label}` });
    }
  }
  return blocked;
}

/**
 * Roll back a committed import. All-or-nothing: when ANY created row is now
 * referenced (or its stock moved) the whole rollback is refused with 409 and
 * nothing is deleted. Otherwise every created entity + its stock_in
 * transactions are removed, rows become rolled_back and the session becomes
 * rolled_back.
 */
export async function rollbackImport(userId: string, importId: string): Promise<RollbackResult> {
  const record = await loadImport(importId, userId);
  if (record.status === DATA_IMPORT_STATUSES.ROLLED_BACK) {
    throw new DataMigrationError("Data import has already been rolled back", 409);
  }
  if (record.status !== DATA_IMPORT_STATUSES.COMMITTED) {
    throw new DataMigrationError("Only a committed import can be rolled back", 409);
  }

  const rows = await loadRows(importId, userId);
  const createdRows = rows.filter(
    (r) =>
      r.rowStatus === DATA_IMPORT_ROW_STATUSES.COMMITTED ||
      r.rowStatus === DATA_IMPORT_ROW_STATUSES.ROLLED_BACK
  );

  const blocked = await blockedRowsFor(
    record.entityType,
    createdRows.map((r) => ({ rowIndex: r.rowIndex, createdEntityId: r.createdEntityId }))
  );
  if (blocked.length > 0) {
    throw new DataMigrationError(
      `Cannot roll back: ${blocked.length} row${blocked.length === 1 ? " is" : "s are"} referenced`,
      409,
      { skipped: blocked }
    );
  }

  const ids = createdRows
    .map((r) => r.createdEntityId)
    .filter((id): id is string => Boolean(id));
  const now = new Date();

  try {
    return db.transaction((tx): RollbackResult => {
      const claimed = tx
        .update(dataImports)
        .set({ status: DATA_IMPORT_STATUSES.ROLLED_BACK, updatedAt: now })
        .where(
          and(
            eq(dataImports.id, importId),
            eq(dataImports.createdBy, userId),
            eq(dataImports.status, DATA_IMPORT_STATUSES.COMMITTED)
          )
        )
        .returning()
        .all();
      if (claimed.length === 0) {
        throw new DataMigrationError("Data import has already been rolled back", 409);
      }

      if (ids.length > 0) {
        if (record.entityType === "stock") {
          tx.delete(inventoryTransactions)
            .where(inArray(inventoryTransactions.batchId, ids))
            .run();
          tx.delete(batches)
            .where(and(inArray(batches.id, ids), eq(batches.createdBy, userId)))
            .run();
        } else {
          const table =
            record.entityType === "customers"
              ? customers
              : record.entityType === "suppliers"
                ? suppliers
                : medicines;
          tx.delete(table)
            .where(and(inArray(table.id, ids), eq(table.createdBy, userId)))
            .run();
        }
      }

      tx.update(dataImportRows)
        .set({ rowStatus: DATA_IMPORT_ROW_STATUSES.ROLLED_BACK })
        .where(
          and(
            eq(dataImportRows.importId, importId),
            eq(dataImportRows.createdBy, userId),
            eq(dataImportRows.rowStatus, DATA_IMPORT_ROW_STATUSES.COMMITTED)
          )
        )
        .run();

      tx.insert(auditEvents)
        .values({
          id: generateId(),
          actorId: userId,
          action: "data_import.rollback",
          entity: "data_import",
          entityId: importId,
          metadata: JSON.stringify({ entityType: record.entityType, deleted: ids.length }),
          createdAt: now,
        })
        .run();

      return {
        importId,
        entityType: record.entityType,
        status: DATA_IMPORT_STATUSES.ROLLED_BACK,
        deleted: ids.length,
      };
    });
  } catch (err: unknown) {
    if (err instanceof DataMigrationError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new DataMigrationError(`Unable to roll back data import: ${message}`, 500);
  }
}

// ---------------------------------------------------------------------------
// Bulk bill operations (Task 16 — filter + preview diff + confirmed commit)
// ---------------------------------------------------------------------------

export interface BulkBillFilters {
  from?: string;
  to?: string;
  status?: string;
  customerId?: string;
  minAmount?: number;
  maxAmount?: number;
  q?: string;
}

export interface BulkBillPatch {
  customerId?: string | null;
  date?: string;
  notes?: string;
  paymentMode?: (typeof PAYMENT_MODES)[keyof typeof PAYMENT_MODES];
}

export interface BulkBillDiff {
  from: unknown;
  to: unknown;
}

export interface BulkBillPreviewRow {
  id: string;
  invoiceNo: string;
  date: string;
  customerId: string | null;
  customerName: string | null;
  status: string | null;
  paymentMode: string | null;
  notes: string | null;
  subtotal: number;
  grandTotal: number;
  diffs: Record<string, BulkBillDiff>;
}

export interface BulkBillPreviewResult {
  total: number;
  invoices: BulkBillPreviewRow[];
  patch: BulkBillPatch;
  requiresConfirmation: true;
}

function hasFilter(filters: BulkBillFilters): boolean {
  return (
    Boolean(filters.from) ||
    Boolean(filters.to) ||
    Boolean(filters.status) ||
    Boolean(filters.customerId) ||
    filters.minAmount !== undefined ||
    filters.maxAmount !== undefined ||
    Boolean(filters.q)
  );
}

function filterConditions(userId: string, filters: BulkBillFilters) {
  const conds: ReturnType<typeof eq>[] = [eq(invoices.createdBy, userId), ne(invoices.status, "cancelled")];
  if (filters.from) conds.push(sql`${invoices.date} >= ${filters.from}`);
  if (filters.to) conds.push(sql`${invoices.date} <= ${filters.to}`);
  if (filters.status) conds.push(eq(invoices.status, filters.status as never));
  if (filters.customerId) conds.push(eq(invoices.customerId, filters.customerId));
  if (filters.minAmount !== undefined) conds.push(sql`${invoices.grandTotal} >= ${filters.minAmount}`);
  if (filters.maxAmount !== undefined) conds.push(sql`${invoices.grandTotal} <= ${filters.maxAmount}`);
  if (filters.q) {
    const like = `%${filters.q.toLowerCase()}%`;
    conds.push(
      sql`(lower(${invoices.invoiceNo}) LIKE ${like} OR lower(${invoices.customerName}) LIKE ${like})`
    );
  }
  return conds;
}

function validatePatch(userId: string, patch: BulkBillPatch): Promise<void> | void {
  if (patch.date && !isValidIsoDate(patch.date)) {
    throw new DataMigrationError(`Date "${patch.date}" must be a valid YYYY-MM-DD date`, 400);
  }
  if (patch.customerId) {
    return db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, patch.customerId!), eq(customers.createdBy, userId)))
      .limit(1)
      .then((rows) => {
        if (rows.length === 0) throw new DataMigrationError("Customer not found", 400);
      });
  }
}

/**
 * Preview a bulk patch: every matched tenant invoice (cancelled excluded)
 * plus a per-field current → proposed diff. Writes nothing.
 * Empty filters intentionally match 0 invoices — a bulk edit must be scoped.
 */
export async function bulkBillPreview(
  userId: string,
  filters: BulkBillFilters,
  patch: BulkBillPatch
): Promise<BulkBillPreviewResult> {
  await validatePatch(userId, patch);

  if (!hasFilter(filters)) {
    return { total: 0, invoices: [], patch, requiresConfirmation: true };
  }

  const rows = await db
    .select({
      id: invoices.id,
      invoiceNo: invoices.invoiceNo,
      date: invoices.date,
      customerId: invoices.customerId,
      customerName: invoices.customerName,
      status: invoices.status,
      paymentMode: invoices.paymentMode,
      notes: invoices.notes,
      subtotal: invoices.subtotal,
      grandTotal: invoices.grandTotal,
    })
    .from(invoices)
    .where(and(...filterConditions(userId, filters)))
    .orderBy(asc(invoices.date), asc(invoices.invoiceNo));

  const patchKeys = Object.keys(patch).filter((k) => (patch as Record<string, unknown>)[k] !== undefined);

  const invoicesOut: BulkBillPreviewRow[] = rows.map((row) => {
    const diffs: Record<string, BulkBillDiff> = {};
    for (const key of patchKeys) {
      const current =
        key === "customerId"
          ? row.customerId
          : key === "date"
            ? row.date
            : key === "notes"
              ? row.notes
              : row.paymentMode;
      diffs[key] = { from: current ?? null, to: (patch as Record<string, unknown>)[key] ?? null };
    }
    return {
      id: row.id,
      invoiceNo: row.invoiceNo,
      date: row.date,
      customerId: row.customerId,
      customerName: row.customerName,
      status: row.status,
      paymentMode: row.paymentMode,
      notes: row.notes,
      subtotal: row.subtotal,
      grandTotal: row.grandTotal,
      diffs,
    };
  });

  return { total: invoicesOut.length, invoices: invoicesOut, patch, requiresConfirmation: true };
}

export interface BulkBillCommitResult {
  updated: number;
  skipped: number;
  audit: { action: string; metadata: { count: number; patch: BulkBillPatch; filters: BulkBillFilters } };
}

/**
 * Apply a bulk patch. Requires `confirm === "CONFIRM"`; updates only the
 * provided patch fields (plus updatedAt) on matched, non-cancelled tenant
 * invoices inside one transaction, and records ONE audit event.
 */
export async function bulkBillCommit(
  userId: string,
  filters: BulkBillFilters,
  patch: BulkBillPatch,
  opts: { confirm?: string } = {}
): Promise<BulkBillCommitResult> {
  if (opts.confirm !== "CONFIRM") {
    throw new DataMigrationError('Type CONFIRM to apply this bulk change', 400);
  }
  await validatePatch(userId, patch);

  const patchKeys = Object.keys(patch).filter(
    (k) => (patch as Record<string, unknown>)[k] !== undefined
  ) as Array<keyof BulkBillPatch>;
  if (patchKeys.length === 0) {
    throw new DataMigrationError("No fields to update", 400);
  }

  // Reassigning the customer keeps the denormalized customerName in sync.
  let customerName: string | null | undefined;
  if (patch.customerId) {
    const [customer] = await db
      .select({ name: customers.name })
      .from(customers)
      .where(and(eq(customers.id, patch.customerId), eq(customers.createdBy, userId)))
      .limit(1);
    customerName = customer?.name ?? null;
  } else if (patch.customerId === null) {
    customerName = null;
  }

  const now = new Date();

  if (!hasFilter(filters)) {
    return {
      updated: 0,
      skipped: 0,
      audit: {
        action: "invoice.bulk_patch",
        metadata: { count: 0, patch, filters },
      },
    };
  }

  let updated = 0;
  let skipped = 0;

  try {
    db.transaction((tx) => {
      const matched = tx
        .select({ id: invoices.id, status: invoices.status })
        .from(invoices)
        .where(and(...filterConditions(userId, filters)))
        .all();

      for (const row of matched) {
        const values: Record<string, unknown> = { updatedAt: now };
        for (const key of patchKeys) {
          if (key === "customerId") {
            values.customerId = patch.customerId ?? null;
            values.customerName = customerName ?? null;
          } else {
            values[key] = patch[key];
          }
        }
        const result = tx
          .update(invoices)
          .set(values as never)
          .where(
            and(
              eq(invoices.id, row.id),
              eq(invoices.createdBy, userId),
              ne(invoices.status, "cancelled")
            )
          )
          .returning({ id: invoices.id })
          .all();
        if (result.length > 0) updated++;
        else skipped++;
      }
    });
  } catch (err: unknown) {
    if (err instanceof DataMigrationError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new DataMigrationError(`Unable to apply bulk change: ${message}`, 500);
  }

  const metadata = { count: updated, patch, filters };
  await auditTrail.record({
    actorId: userId,
    action: "invoice.bulk_patch",
    entity: "invoice",
    metadata,
  });

  return { updated, skipped, audit: { action: "invoice.bulk_patch", metadata } };
}
