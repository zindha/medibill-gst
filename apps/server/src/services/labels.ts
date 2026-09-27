import { db } from "../db/index.js";
import { batches, medicines, settings } from "../db/schema/index.js";
import { and, eq } from "drizzle-orm";

/** Domain error with an HTTP status the route layer maps straight to a reply. */
export class LabelError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status = 400, details?: unknown) {
    super(message);
    this.name = "LabelError";
    this.status = status;
    this.details = details;
  }
}

export interface LabelTemplate {
  id: string;
  widthMm: number;
  heightMm: number;
  cols: number;
  rows: number;
  /** cols x rows — how many labels one A4 sheet holds. */
  perSheet: number;
}

/**
 * Built-in label geometries. Every template must fit the printer's printable
 * A4 area — the app-wide `@page` rule (src/index.css) leaves a 180 x 273 mm
 * content box, and the `.label-sheet` grid uses 2 mm gutters, so:
 *   cols * widthMm  + (cols - 1) * 2 <= 180
 *   rows * heightMm + (rows - 1) * 2 <= 273
 * (which also keeps the raw sheet inside the 210 x 297 mm paper).
 *
 * - `40x25mm` — 4 cols x 10 rows = 40 labels (166 x 268 mm with gutters), small shelf label.
 * - `50x30mm` — 3 cols x 8 rows = 24 labels (154 x 254 mm), standard shelf label.
 * - `A4-24`   — 3 cols x 8 rows = 24 labels of 58 x 32 mm (178 x 270 mm). The plan's
 *   60 x 40 mm would need 320 mm of height (8 rows) — taller than A4 — so the sheet
 *   is trimmed to 58 x 32 mm to keep the 24-up promise without overflowing the page.
 */
export const LABEL_TEMPLATES: Record<string, LabelTemplate> = {
  "40x25mm": { id: "40x25mm", widthMm: 40, heightMm: 25, cols: 4, rows: 10, perSheet: 40 },
  "50x30mm": { id: "50x30mm", widthMm: 50, heightMm: 30, cols: 3, rows: 8, perSheet: 24 },
  "A4-24": { id: "A4-24", widthMm: 58, heightMm: 32, cols: 3, rows: 8, perSheet: 24 },
};

export function getTemplates(): LabelTemplate[] {
  return Object.values(LABEL_TEMPLATES);
}

/** One rendered shelf label. `barcode: null` + `needsBarcode: true` when the
 *  medicine has no EAN stored — the client then prints a name-only label. */
export interface LabelData {
  barcode: string | null;
  needsBarcode: boolean;
  /** Name truncated to 28 chars (+ ellipsis); `fullName` keeps the original. */
  name: string;
  fullName: string;
  brand: string | null;
  /** packSize when present, otherwise "N <unit>s" from unitsPerPack. */
  pack: string;
  batchNo: string | null;
  /** Batch expiry formatted MM/YY (e.g. 2027-12-31 -> 12/27). */
  expiry: string | null;
  mrp: number | null;
  storeName: string | null;
}

export interface LabelPreview {
  template: LabelTemplate;
  labels: LabelData[];
  totalLabels: number;
}

export interface LabelItemInput {
  medicineId: string;
  batchId?: string;
  quantity: number;
  template: string;
}

export interface BuildLabelInput {
  items: LabelItemInput[];
  /** When false the labels are batch-agnostic (no batch/expiry, medicine MRP). Default true. */
  includeBatch?: boolean;
}

const NAME_MAX = 28;
const EXPIRY_RE = /^(\d{4})-(\d{2})-(\d{2})/;

function truncateName(name: string): string {
  return name.length <= NAME_MAX ? name : name.slice(0, NAME_MAX) + "…";
}

function packLabel(m: {
  packSize: string | null;
  unitsPerPack: number | null;
  unit: string | null;
}): string {
  const packSize = m.packSize?.trim();
  if (packSize) return packSize;
  const upp = m.unitsPerPack ?? 1;
  const unit = m.unit ?? "unit";
  if (upp > 1) return `${upp} ${unit.toLowerCase()}s`;
  return unit;
}

function formatExpiryMMYY(expiryDate: string | null): string | null {
  if (!expiryDate) return null;
  const match = EXPIRY_RE.exec(expiryDate);
  if (!match) return null;
  const [, year, mm] = match;
  return `${mm}/${year.slice(2)}`;
}

/**
 * Read `store_name` from the settings table. The settings route stores plain
 * strings raw and objects/arrays JSON-encoded, and its GET tries JSON.parse
 * first — mirror that: JSON-wrapped strings unwrap, non-JSON values pass through.
 */
async function readStoreName(): Promise<string | null> {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, "store_name"))
    .limit(1);
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value);
    if (typeof parsed === "string") return parsed.trim() || null;
  } catch {
    // Plain (non-JSON) string — fall through to the raw value.
  }
  const raw = row.value.trim();
  return raw || null;
}

export async function buildLabelData(
  userId: string,
  input: BuildLabelInput
): Promise<LabelPreview> {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new LabelError("At least one label item is required", 400);
  }

  let templateId: string | null = null;
  input.items.forEach((item, i) => {
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 500) {
      throw new LabelError(
        `items[${i}].quantity must be an integer between 1 and 500`,
        400
      );
    }
    const template = LABEL_TEMPLATES[item.template];
    if (!template) {
      throw new LabelError(`Unknown label template: ${item.template}`, 400);
    }
    if (templateId === null) templateId = item.template;
    else if (templateId !== item.template) {
      throw new LabelError(
        "All items in one preview must use the same label template",
        400
      );
    }
  });

  const template = LABEL_TEMPLATES[templateId!];
  const includeBatch = input.includeBatch !== false;
  const storeName = await readStoreName();
  const labels: LabelData[] = [];

  for (const item of input.items) {
    const [medicine] = await db
      .select()
      .from(medicines)
      .where(and(eq(medicines.id, item.medicineId), eq(medicines.createdBy, userId)))
      .limit(1);
    if (!medicine) throw new LabelError("Medicine not found", 404);

    let batch: typeof batches.$inferSelect | undefined;
    if (item.batchId) {
      const [row] = await db
        .select()
        .from(batches)
        .where(and(eq(batches.id, item.batchId), eq(batches.createdBy, userId)))
        .limit(1);
      if (!row) throw new LabelError("Batch not found", 404);
      if (row.medicineId !== medicine.id) {
        throw new LabelError("batchId does not match the medicine", 400);
      }
      batch = row;
    }

    const useBatch = includeBatch && batch !== undefined;
    const barcode = medicine.barcode?.trim() || null;
    const name = medicine.name ?? "";

    for (let i = 0; i < item.quantity; i++) {
      labels.push({
        barcode,
        needsBarcode: barcode === null,
        name: truncateName(name),
        fullName: name,
        brand: medicine.brand ?? null,
        pack: packLabel(medicine),
        batchNo: useBatch ? batch!.batchNo : null,
        expiry: useBatch ? formatExpiryMMYY(batch!.expiryDate) : null,
        mrp: (useBatch ? batch!.mrp : null) ?? medicine.mrp ?? null,
        storeName,
      });
    }
  }

  return { template, labels, totalLabels: labels.length };
}
