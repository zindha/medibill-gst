/**
 * Product Intelligence — alternatives, salt search and substitute links.
 *
 * Answers the counter question "this medicine isn't in stock (or costs too
 * much) — what else can I dispense?" using ONLY the tenant's own active
 * medicines, ranked by how alike they are:
 *
 *   1. exactSalt      — same normalized composition tokens, same strength,
 *                       same dosage form (true interchangeable salt).
 *   2. sameComposition — same composition tokens, strength/form differs or unknown.
 *   3. substitutes    — explicit pharmacist links FIRST, then anything sharing
 *                       >=50% of the composition tokens (Jaccard) or the same
 *                       generic name.
 *
 * Composition matching is textual and deterministic: normalizeComposition()
 * folds case/accents, strips strength tokens, splits on +/,/&/, and drops
 * dosage stopwords so "Paracetamol 500mg + Caffeine 65mg" and
 * "paracetamol + caffeine" compare equal.
 */

import { and, asc, desc, eq, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db/index.js";
import { batches, medicines, medicineSubstitutes, generateId } from "../db/schema/index.js";
import { foldText } from "../lib/normalizeSearch.js";
import { searchCatalog } from "../catalog/db.js";

// ---------------------------------------------------------------------------
// Composition normalization
// ---------------------------------------------------------------------------

/** Dosage/product words that carry no identity — dropped from tokens. */
const STOPWORDS = new Set([
  "tab", "tabs", "tablet", "tablets", "cap", "caps", "capsule", "capsules",
  "pill", "pills", "mg", "mcg", "ug", "g", "gm", "kg", "ml", "l", "iu",
  "dose", "doses", "syrup", "susp", "suspension", "solution", "soln",
  "injection", "inj", "granules", "granule", "packet", "sachet",
  "sr", "xr", "cr", "od", "bd", "tds", "for", "the", "and", "of",
]);

/** Composition separators: + , / & and comma. */
const SEPARATOR_RE = /[+,&\/]/;

/**
 * Numbers (with an optional unit) are strength tokens — remove them so
 * "Paracetamol 500mg" and "Paracetamol" normalize to the same salt.
 * The trailing lookahead keeps digits glued to letters (e.g. "b12") from
 * swallowing part of the following word.
 */
const STRENGTH_RE = /\d+(?:[.,]\d+)?\s*(?:mcg|mg|ug|µg|ml|iu|g|l|%)?(?![a-z0-9])/gi;

/**
 * Normalize a composition (or name) into sorted, unique salt tokens.
 * Case/accent folded, strength numbers stripped, split on +/,/&/, then split
 * into words with dosage stopwords dropped. Ordering-insensitive by
 * construction: `["caffeine","paracetamol"]` for both
 * "Paracetamol 500mg + Caffeine 65mg" and "Caffeine + Paracetamol".
 */
export function normalizeComposition(input: string | null | undefined): string[] {
  const folded = foldText(input ?? "");
  if (!folded) return [];
  const stripped = folded.replace(STRENGTH_RE, " ");
  const tokens = new Set<string>();
  for (const part of stripped.split(SEPARATOR_RE)) {
    for (const word of part.trim().split(/\s+/)) {
      if (!word || STOPWORDS.has(word)) continue;
      tokens.add(word);
    }
  }
  return [...tokens].sort();
}

/** Jaccard similarity of two token sets: |A ∩ B| / |A ∪ B|. Empty → 0. */
function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  let shared = 0;
  for (const t of a) if (setB.has(t)) shared++;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : shared / union;
}

// ---------------------------------------------------------------------------
// Strength extraction
// ---------------------------------------------------------------------------

/** Unit-suffixed number: "500mg", "0.5 g", "20 mcg", "10%". */
const STRENGTH_FIELD_RE = /(\d+(?:\.\d+)?)\s*(mcg|mg|ug|ml|iu|g|%)(?![a-z0-9])/i;

export interface Strength {
  value: number;
  unit: string;
}

/**
 * Parse a strength from the medicine: `strength` field first, then a regex
 * over name/composition. Returns null when no unit-suffixed number exists
 * (a bare "650" is a tablet count, not a strength).
 */
export function extractStrength(medicine: {
  strength?: string | null;
  name?: string | null;
  composition?: string | null;
}): Strength | null {
  for (const field of [medicine.strength, medicine.name, medicine.composition]) {
    if (!field) continue;
    const match = STRENGTH_FIELD_RE.exec(field);
    if (match) {
      return { value: parseFloat(match[1]), unit: match[2].toLowerCase() };
    }
  }
  return null;
}

function sameStrength(a: Strength | null, b: Strength | null): boolean {
  return !!a && !!b && a.value === b.value && a.unit === b.unit;
}

const normalizeForm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

// ---------------------------------------------------------------------------
// Annotations
// ---------------------------------------------------------------------------

export interface MedicineAnnotation {
  medicineId: string;
  name: string;
  brand: string | null;
  genericName: string | null;
  composition: string | null;
  compositionTokens: string[];
  strength: string | null;
  dosageForm: string | null;
  schedule: string | null;
  hsnCode: string | null;
  gstRate: string | null;
  unit: string | null;
  packSize: string | null;
  unitsPerPack: number | null;
  mrp: number | null;
  sellingPrice: number;
  purchasePrice: number;
  /** Sum of active batch quantities (packs). */
  stockPacks: number;
  /** Earliest expiry among positive active batches, when any exist. */
  nearestExpiry: string | null;
  /** ((sellingPrice − purchasePrice) / sellingPrice) × 100, 2 decimals. */
  marginPercent: number;
  inStock: boolean;
  /** Substitute-bucket extras. */
  score?: number;
  explicit?: boolean;
  reason?: string | null;
  source?: "stock" | "catalog";
}

export interface AlternativesResult {
  source: MedicineAnnotation;
  buckets: {
    exactSalt: MedicineAnnotation[];
    sameComposition: MedicineAnnotation[];
    substitutes: MedicineAnnotation[];
  };
}

export interface AlternativesOptions {
  inStock?: boolean;
  maxPrice?: number;
  sameSchedule?: boolean;
}

export interface CatalogSearchRow {
  name: string;
  company: string;
  composition: string;
  packSize: string;
  form: string;
  unit: string;
  price: number;
  gstRate: number;
  source: "catalog";
  stockPacks: number;
  inStock: boolean;
  compositionTokens: string[];
}

export interface ProductSearchResult {
  stock: MedicineAnnotation[];
  catalog: CatalogSearchRow[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function marginPercent(sellingPrice: number, purchasePrice: number): number {
  if (!(sellingPrice > 0)) return 0;
  return round2(((sellingPrice - purchasePrice) / sellingPrice) * 100);
}

interface StockInfo {
  stockPacks: number;
  nearestExpiry: string | null;
}

const NO_STOCK: StockInfo = { stockPacks: 0, nearestExpiry: null };

/** Sum active batch quantities (+ nearest positive expiry) for many medicines. */
async function loadStockMap(
  userId: string,
  ids: string[]
): Promise<Map<string, StockInfo>> {
  const map = new Map<string, StockInfo>();
  if (ids.length === 0) return map;
  const rows = await db
    .select({
      medicineId: batches.medicineId,
      total: sql<number>`COALESCE(SUM(${batches.quantity}), 0)`,
      nearest: sql<string | null>`MIN(CASE WHEN ${batches.quantity} > 0 THEN ${batches.expiryDate} ELSE NULL END)`,
    })
    .from(batches)
    .where(
      and(
        eq(batches.createdBy, userId),
        eq(batches.isActive, true),
        inArray(batches.medicineId, ids)
      )
    )
    .groupBy(batches.medicineId);
  for (const row of rows) {
    map.set(row.medicineId, {
      stockPacks: Number(row.total ?? 0),
      nearestExpiry: row.nearest ?? null,
    });
  }
  return map;
}

type MedicineRow = typeof medicines.$inferSelect;

function annotate(
  med: MedicineRow,
  stock: StockInfo | undefined,
  extras: Partial<MedicineAnnotation> = {}
): MedicineAnnotation {
  const info = stock ?? NO_STOCK;
  const sellingPrice = med.sellingPrice ?? 0;
  const purchasePrice = med.purchasePrice ?? 0;
  return {
    medicineId: med.id,
    name: med.name,
    brand: med.brand ?? null,
    genericName: med.genericName ?? null,
    composition: med.composition ?? null,
    compositionTokens: normalizeComposition(med.composition || med.name || ""),
    strength: med.strength ?? null,
    dosageForm: med.dosageForm ?? null,
    schedule: med.schedule ?? null,
    hsnCode: med.hsnCode ?? null,
    gstRate: med.gstRate ?? null,
    unit: med.unit ?? null,
    packSize: med.packSize ?? null,
    unitsPerPack: med.unitsPerPack ?? null,
    mrp: med.mrp ?? null,
    sellingPrice,
    purchasePrice,
    stockPacks: info.stockPacks,
    nearestExpiry: info.nearestExpiry,
    marginPercent: marginPercent(sellingPrice, purchasePrice),
    inStock: info.stockPacks > 0,
    ...extras,
  };
}

/** Explicit links first, then stocked first, then cheapest first. */
function byRank(a: MedicineAnnotation, b: MedicineAnnotation): number {
  const explicit = Number(!!b.explicit) - Number(!!a.explicit);
  if (explicit !== 0) return explicit;
  if (b.stockPacks !== a.stockPacks) return b.stockPacks - a.stockPacks;
  return a.sellingPrice - b.sellingPrice;
}

// ---------------------------------------------------------------------------
// Alternatives
// ---------------------------------------------------------------------------

/**
 * Alternatives to `medicineId` within the tenant. Returns null when the
 * medicine doesn't exist / belongs to another tenant (callers map to 404).
 */
export async function getAlternatives(
  userId: string,
  medicineId: string,
  opts: AlternativesOptions = {}
): Promise<AlternativesResult | null> {
  const sameSchedule = opts.sameSchedule !== false; // default true

  const [source] = await db
    .select()
    .from(medicines)
    .where(
      and(
        eq(medicines.id, medicineId),
        eq(medicines.createdBy, userId),
        eq(medicines.isActive, true)
      )
    )
    .limit(1);
  if (!source) return null;

  const sourceTokens = normalizeComposition(source.composition || source.name || "");
  const sourceStrength = extractStrength(source);
  const sourceForm = normalizeForm(source.dosageForm);
  const sourceGeneric = foldText(source.genericName ?? "");
  const sourceSchedule = source.schedule ?? "";

  const candidates = await db
    .select()
    .from(medicines)
    .where(
      and(
        eq(medicines.createdBy, userId),
        eq(medicines.isActive, true),
        ne(medicines.id, medicineId)
      )
    );

  // Explicit links load FIRST: they own their row in `substitutes` and are
  // deduped out of the automatic buckets below.
  const explicitRows = await db
    .select()
    .from(medicineSubstitutes)
    .where(
      and(
        eq(medicineSubstitutes.createdBy, userId),
        eq(medicineSubstitutes.medicineId, medicineId)
      )
    );
  const explicitById = new Map(explicitRows.map((r) => [r.substituteMedicineId, r]));

  const stockMap = await loadStockMap(userId, [medicineId, ...candidates.map((m) => m.id)]);

  const buckets: AlternativesResult["buckets"] = {
    exactSalt: [],
    sameComposition: [],
    substitutes: [],
  };

  for (const med of candidates) {
    if (sameSchedule && (med.schedule ?? "") !== sourceSchedule) continue;
    if (opts.inStock && (stockMap.get(med.id)?.stockPacks ?? 0) <= 0) continue;
    if (opts.maxPrice !== undefined && (med.sellingPrice ?? 0) > opts.maxPrice) continue;

    const explicit = explicitById.get(med.id);
    if (explicit) {
      buckets.substitutes.push(
        annotate(med, stockMap.get(med.id), {
          explicit: true,
          score: 1,
          reason: explicit.reason ?? null,
        })
      );
      continue;
    }

    const ann = annotate(med, stockMap.get(med.id));
    const tokens = ann.compositionTokens;
    const sameTokens =
      sourceTokens.length > 0 &&
      tokens.length === sourceTokens.length &&
      sourceTokens.every((t, i) => t === tokens[i]); // both arrays are sorted

    if (sameTokens) {
      const exact =
        sameStrength(sourceStrength, extractStrength(med)) &&
        normalizeForm(med.dosageForm) === sourceForm;
      if (exact) buckets.exactSalt.push(ann);
      else buckets.sameComposition.push(ann);
      continue;
    }

    const overlap = jaccard(sourceTokens, tokens);
    const genericMatch =
      !!sourceGeneric && foldText(med.genericName ?? "") === sourceGeneric;
    if (overlap >= 0.5 || genericMatch) {
      buckets.substitutes.push({
        ...ann,
        score: round2(Math.max(overlap, genericMatch ? 0.5 : 0)),
      });
    }
  }

  buckets.exactSalt.sort(byRank);
  buckets.sameComposition.sort(byRank);
  buckets.substitutes.sort(byRank);

  return { source: annotate(source, stockMap.get(source.id)), buckets };
}

// ---------------------------------------------------------------------------
// Salt search (tenant stock first, reference catalog as fallback)
// ---------------------------------------------------------------------------

/**
 * Search the tenant's medicines by name/brand/generic/composition, then fall
 * back to the bundled reference catalog (rows carry no stock, so they are
 * marked `source: "catalog"` with `inStock: false`).
 */
export async function searchProducts(
  userId: string,
  q: string,
  composition?: string,
  limit = 20
): Promise<ProductSearchResult> {
  const query = (q ?? "").trim();
  const comp = (composition ?? "").trim();
  if (!query && !comp) return { stock: [], catalog: [] };

  const effective = query || comp;
  const pat = `%${foldText(effective)}%`;
  const conds: SQL[] = [
    eq(medicines.isActive, true),
    eq(medicines.createdBy, userId),
    or(
      sql`fold(${medicines.name}) LIKE ${pat}`,
      sql`fold(${medicines.genericName}) LIKE ${pat}`,
      sql`fold(${medicines.brand}) LIKE ${pat}`,
      sql`fold(${medicines.composition}) LIKE ${pat}`,
      sql`fold(${medicines.barcode}) LIKE ${pat}`
    )!,
  ];
  if (comp) conds.push(sql`fold(${medicines.composition}) LIKE ${`%${foldText(comp)}%`}`);

  // Simplified version of the /api/medicines ranking: exact name beats name
  // prefix beats brand/generic beats composition.
  const qFold = foldText(effective);
  const order = desc(sql<number>`(
    CASE
      WHEN fold(${medicines.name}) = ${qFold} THEN 100
      WHEN fold(${medicines.name}) LIKE ${qFold + "%"} THEN 80
      WHEN fold(${medicines.brand}) LIKE ${qFold + "%"} THEN 60
      WHEN fold(${medicines.genericName}) LIKE ${qFold + "%"} THEN 50
      WHEN fold(${medicines.composition}) LIKE ${qFold + "%"} THEN 40
      ELSE 10
    END
  )`);

  const rows = await db
    .select()
    .from(medicines)
    .where(and(...conds))
    .orderBy(order, asc(medicines.name))
    .limit(Math.min(Math.max(limit, 1), 50));

  const stockMap = await loadStockMap(userId, rows.map((r) => r.id));
  const stock = rows.map((r) => annotate(r, stockMap.get(r.id), { source: "stock" }));

  let catalog: CatalogSearchRow[] = [];
  try {
    const { rows: catalogRows } = await searchCatalog(effective, Math.min(Math.max(limit, 1), 50));
    const stockNames = new Set(stock.map((s) => foldText(s.name)));
    catalog = catalogRows
      .filter((r) => !stockNames.has(foldText(r.name)))
      .map((r) => ({
        name: r.name,
        company: r.company,
        composition: r.composition,
        packSize: r.pack,
        form: r.form,
        unit: r.unit,
        price: r.price,
        gstRate: r.gst,
        source: "catalog" as const,
        stockPacks: 0,
        inStock: false,
        compositionTokens: normalizeComposition(r.composition || r.name),
      }));
  } catch {
    // No reference catalog on disk — stock results still stand alone.
    catalog = [];
  }

  return { stock, catalog };
}

// ---------------------------------------------------------------------------
// Explicit substitute links
// ---------------------------------------------------------------------------

export interface SubstituteLinkResult {
  created: boolean;
  link: {
    id: string;
    medicineId: string;
    substituteMedicineId: string;
    reason: string | null;
    createdAt: Date | null;
  };
}

export type AddSubstituteError = "not_found" | "same_medicine";

/**
 * Store an explicit substitute link. Idempotent: the unique constraint makes
 * repeat inserts a no-op (`created: false`). Returns an error discriminator
 * instead of throwing so routes can map to 404/400.
 */
export async function addSubstituteLink(
  userId: string,
  medicineId: string,
  substituteMedicineId: string,
  reason?: string
): Promise<SubstituteLinkResult | AddSubstituteError> {
  if (medicineId === substituteMedicineId) return "same_medicine";

  const owned = await db
    .select({ id: medicines.id })
    .from(medicines)
    .where(
      and(
        eq(medicines.createdBy, userId),
        eq(medicines.isActive, true),
        inArray(medicines.id, [medicineId, substituteMedicineId])
      )
    );
  if (owned.length !== 2) return "not_found";

  const [inserted] = await db
    .insert(medicineSubstitutes)
    .values({
      id: generateId(),
      createdBy: userId,
      medicineId,
      substituteMedicineId,
      reason: reason?.trim() ? reason.trim() : null,
      createdAt: new Date(),
    })
    .onConflictDoNothing()
    .returning();

  if (inserted) {
    return {
      created: true,
      link: {
        id: inserted.id,
        medicineId: inserted.medicineId,
        substituteMedicineId: inserted.substituteMedicineId,
        reason: inserted.reason,
        createdAt: inserted.createdAt,
      },
    };
  }

  const [existing] = await db
    .select()
    .from(medicineSubstitutes)
    .where(
      and(
        eq(medicineSubstitutes.createdBy, userId),
        eq(medicineSubstitutes.medicineId, medicineId),
        eq(medicineSubstitutes.substituteMedicineId, substituteMedicineId)
      )
    )
    .limit(1);
  return {
    created: false,
    link: {
      id: existing!.id,
      medicineId: existing!.medicineId,
      substituteMedicineId: existing!.substituteMedicineId,
      reason: existing!.reason,
      createdAt: existing!.createdAt,
    },
  };
}

/** Explicit substitute links for a medicine, annotated for display. */
export async function listSubstituteLinks(userId: string, medicineId: string) {
  const links = await db
    .select()
    .from(medicineSubstitutes)
    .where(
      and(
        eq(medicineSubstitutes.createdBy, userId),
        eq(medicineSubstitutes.medicineId, medicineId)
      )
    )
    .orderBy(asc(medicineSubstitutes.createdAt));

  const ids = links.map((l) => l.substituteMedicineId);
  const meds = ids.length
    ? await db
        .select()
        .from(medicines)
        .where(and(eq(medicines.createdBy, userId), inArray(medicines.id, ids)))
    : [];
  const medById = new Map(meds.map((m) => [m.id, m]));
  const stockMap = await loadStockMap(userId, ids);

  return links.map((l) => ({
    id: l.id,
    medicineId: l.medicineId,
    substituteMedicineId: l.substituteMedicineId,
    reason: l.reason,
    createdAt: l.createdAt,
    medicine: medById.get(l.substituteMedicineId)
      ? annotate(medById.get(l.substituteMedicineId)!, stockMap.get(l.substituteMedicineId), {
          explicit: true,
          reason: l.reason,
        })
      : null,
  }));
}
