/**
 * Procurement Intelligence — supplier comparison, rate history and supplier
 * performance metrics.
 *
 * Answers the purchasing question "who should I buy this medicine from, at
 * what rate, and how well has each supplier been performing?" using ONLY the
 * tenant's own data:
 *
 *   1. effectiveCost         — real per-unit cost after line discount and free
 *                              units (scheme quantity).
 *   2. getRateHistory        — chronological purchase rates for a medicine plus
 *                              manually recorded supplier quotes.
 *   3. compareSupplierQuotes — latest effective rate per supplier, quote rows,
 *                              credit terms and outstanding balance, cheapest first.
 *   4. getSupplierMetrics    — bill totals, returns, payment lag, expiry risk and
 *                              outstanding for one supplier over a period.
 *   5. recommendation helpers used by the shortbook "recommended supplier".
 *
 * Every read is tenant-scoped (createdBy = userId); foreign supplier/medicine
 * ids resolve to null / empty rather than leaking another tenant's rows.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  batches,
  medicines,
  payments,
  purchaseBills,
  purchaseBillItems,
  purchaseReturns,
  purchaseReturnItems,
  supplierQuotes,
  suppliers,
} from "../db/schema/index.js";

// ---------------------------------------------------------------------------
// Small local helpers (kept local so reports.ts stays untouched)
// ---------------------------------------------------------------------------

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

const inPeriod = (
  dateStr: string | null | undefined,
  from?: string | null,
  to?: string | null
) => {
  if (!dateStr) return false;
  if (from && dateStr < from) return false;
  if (to && dateStr > to) return false;
  return true;
};

const todayISO = () => new Date().toISOString().split("T")[0];

const isoPlusDays = (days: number) =>
  new Date(Date.now() + days * 86400000).toISOString().split("T")[0];

const dateOfTimestamp = (value: Date | number | null | undefined): string => {
  if (value == null) return todayISO();
  return new Date(value).toISOString().split("T")[0];
};

/** Whole days from `start` to `end` (both ISO dates). */
const daysBetween = (start: string, end: string) =>
  Math.round((Date.parse(end) - Date.parse(start)) / 86400000);

// ---------------------------------------------------------------------------
// Effective cost
// ---------------------------------------------------------------------------

export interface EffectiveCost {
  /** Per-unit cost across every unit received (paid + free). */
  unitCost: number;
  /** Line total after discount: rate * quantity - discount. */
  totalCost: number;
}

/**
 * Effective unit cost of a purchase line.
 *
 *   totalCost = rate * quantity - discountAmount
 *   unitCost  = totalCost / (quantity + freeQuantity)
 *
 * Free ("scheme") units are spread over the paid units, so a ₹100 rate on
 * 10 units with 1 free and a ₹5 discount costs ₹995 / 11 ≈ ₹90.45 per unit
 * actually received.
 */
export function effectiveCost(
  rate: number,
  opts: { quantity: number; freeQuantity?: number; discountAmount?: number }
): EffectiveCost {
  const r = Number(rate) || 0;
  const quantity = Number(opts.quantity) || 0;
  const freeQuantity = Number(opts.freeQuantity) || 0;
  const discountAmount = Number(opts.discountAmount) || 0;

  const totalCost = round2(r * quantity - discountAmount);
  const units = quantity + freeQuantity;
  const unitCost = units > 0 ? round2(totalCost / units) : 0;
  return { unitCost, totalCost };
}

// ---------------------------------------------------------------------------
// Rate history
// ---------------------------------------------------------------------------

export interface RateHistoryRow {
  date: string;
  billNo: string | null;
  supplierId: string | null;
  supplierName: string | null;
  rate: number;
  effectiveUnitCost: number;
  quantity: number | null;
  source: "purchase" | "quote";
  freeQuantity?: number;
  discountAmount?: number;
  notes?: string | null;
}

/** Purchase items for one medicine joined to their bills (tenant-scoped). */
async function fetchMedicinePurchaseLines(userId: string, medicineId: string) {
  return db
    .select({
      billId: purchaseBills.id,
      billNo: purchaseBills.billNo,
      billDate: purchaseBills.billDate,
      supplierId: purchaseBills.supplierId,
      supplierName: purchaseBills.supplierName,
      quantity: purchaseBillItems.quantity,
      freeQuantity: purchaseBillItems.freeQuantity,
      rate: purchaseBillItems.rate,
      discountAmount: purchaseBillItems.discountAmount,
    })
    .from(purchaseBillItems)
    .innerJoin(purchaseBills, eq(purchaseBillItems.purchaseBillId, purchaseBills.id))
    .where(
      and(eq(purchaseBills.createdBy, userId), eq(purchaseBillItems.medicineId, medicineId))
    );
}

async function fetchTenantSuppliers(userId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map<string, any>();
  const rows = await db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.createdBy, userId), inArray(suppliers.id, unique)));
  return new Map((rows as any[]).map((s) => [s.id as string, s]));
}

async function fetchTenantQuotes(
  userId: string,
  medicineId: string,
  supplierId?: string | null
) {
  const conds = [
    eq(supplierQuotes.createdBy, userId),
    eq(supplierQuotes.medicineId, medicineId),
  ];
  if (supplierId) conds.push(eq(supplierQuotes.supplierId, supplierId));
  return db.select().from(supplierQuotes).where(and(...conds));
}

/**
 * Chronological rate records for a medicine: every purchase line (with the
 * effective unit cost after discount/free units) merged with manually
 * recorded quotes (`source: "quote"`). Sorted ascending by date.
 */
export async function getRateHistory(
  userId: string,
  medicineId: string,
  supplierId?: string | null,
  from?: string | null,
  to?: string | null
): Promise<RateHistoryRow[]> {
  const lines = await fetchMedicinePurchaseLines(userId, medicineId);
  const rows: RateHistoryRow[] = [];

  for (const line of lines as any[]) {
    if (supplierId && line.supplierId !== supplierId) continue;
    if (!inPeriod(line.billDate, from, to)) continue;
    const { unitCost } = effectiveCost(line.rate, {
      quantity: line.quantity ?? 0,
      freeQuantity: line.freeQuantity ?? 0,
      discountAmount: line.discountAmount ?? 0,
    });
    rows.push({
      date: line.billDate,
      billNo: line.billNo,
      supplierId: line.supplierId ?? null,
      supplierName: line.supplierName ?? null,
      rate: Number(line.rate) || 0,
      effectiveUnitCost: unitCost,
      quantity: Number(line.quantity) || 0,
      source: "purchase",
      freeQuantity: Number(line.freeQuantity ?? 0),
      discountAmount: Number(line.discountAmount ?? 0),
    });
  }

  const quotes = await fetchTenantQuotes(userId, medicineId, supplierId);
  const supMap = await fetchTenantSuppliers(
    userId,
    quotes.map((q) => q.supplierId)
  );
  for (const q of quotes as any[]) {
    const date = q.quoteDate ?? dateOfTimestamp(q.createdAt);
    if (!inPeriod(date, from, to)) continue;
    rows.push({
      date,
      billNo: null,
      supplierId: q.supplierId,
      supplierName: supMap.get(q.supplierId)?.name ?? null,
      rate: Number(q.quotedRate) || 0,
      effectiveUnitCost: round2(Number(q.quotedRate) || 0),
      quantity: null,
      source: "quote",
      notes: q.notes ?? null,
    });
  }

  rows.sort((a, b) => a.date.localeCompare(b.date) || a.source.localeCompare(b.source));
  return rows;
}

// ---------------------------------------------------------------------------
// Supplier comparison
// ---------------------------------------------------------------------------

export interface CompareQuoteRow {
  supplierId: string;
  supplierName: string;
  source: "purchase" | "quote";
  /** Effective per-unit cost at that supplier. */
  unitCost: number | null;
  lastDate: string | null;
  bills: number;
  terms: string | null;
  outstanding: number;
  creditLimit: number | null;
  /** unitCost * requested quantity. */
  estimatedCost: number | null;
  /** Units of this medicine currently sitting in batches supplied by them. */
  stockQuantity: number;
}

export interface CompareResult {
  medicineId: string;
  quantity: number;
  quotes: CompareQuoteRow[];
}

/**
 * Rank every supplier that has ever quoted or supplied this medicine by
 * effective unit cost (cheapest first, unknown costs last).
 *
 * One row per supplier per source: `purchase` rows carry the LATEST effective
 * unit cost from real bills; `quote` rows carry the most recent manual quote —
 * so a fresh quote always competes against the older purchase rate.
 */
export async function compareSupplierQuotes(
  userId: string,
  medicineId: string,
  quantity = 1
): Promise<CompareResult> {
  const qty = Math.max(1, Number(quantity) || 1);
  const lines = await fetchMedicinePurchaseLines(userId, medicineId);

  interface Agg {
    supplierId: string;
    supplierName: string;
    bills: Set<string>;
    lastDate: string;
    lastCost: number;
  }
  const perSupplier = new Map<string, Agg>();
  const supplierNames = new Map<string, string>();

  for (const line of lines as any[]) {
    const supplierId: string | null = line.supplierId ?? null;
    if (!supplierId) continue; // cash bills have no supplier to rank
    const { unitCost } = effectiveCost(line.rate, {
      quantity: line.quantity ?? 0,
      freeQuantity: line.freeQuantity ?? 0,
      discountAmount: line.discountAmount ?? 0,
    });
    if (line.supplierName) supplierNames.set(supplierId, line.supplierName);
    const agg = perSupplier.get(supplierId) ?? {
      supplierId,
      supplierName: String(line.supplierName ?? ""),
      bills: new Set<string>(),
      lastDate: "",
      lastCost: unitCost,
    };
    agg.bills.add(line.billId);
    if (String(line.billDate) >= agg.lastDate) {
      agg.lastDate = String(line.billDate);
      agg.lastCost = unitCost;
    }
    perSupplier.set(supplierId, agg);
  }

  // Manual quotes — most recent per supplier.
  const quoteRows = await fetchTenantQuotes(userId, medicineId);
  const latestQuote = new Map<string, any>();
  for (const q of quoteRows as any[]) {
    const date = q.quoteDate ?? dateOfTimestamp(q.createdAt);
    const prev = latestQuote.get(q.supplierId);
    const prevDate = prev ? prev._date ?? (prev.quoteDate ?? dateOfTimestamp(prev.createdAt)) : "";
    if (!prev || date >= prevDate) latestQuote.set(q.supplierId, { ...q, _date: date });
  }

  const allIds = [...new Set([...perSupplier.keys(), ...latestQuote.keys()])];
  const supMap = await fetchTenantSuppliers(userId, allIds);

  // Current stock per supplier for this medicine (availability note).
  const stockRows = await db
    .select()
    .from(batches)
    .where(and(eq(batches.createdBy, userId), eq(batches.medicineId, medicineId)));
  const stockBySupplier = new Map<string, number>();
  for (const b of stockRows as any[]) {
    const sid = b.supplierId as string | null;
    if (!sid) continue;
    stockBySupplier.set(sid, (stockBySupplier.get(sid) ?? 0) + (Number(b.quantity ?? 0) || 0));
  }

  const rows: CompareQuoteRow[] = [];

  for (const agg of perSupplier.values()) {
    const sup = supMap.get(agg.supplierId);
    if (!sup) continue; // supplier belongs to another tenant — never leak it
    const unitCost = agg.lastCost;
    rows.push({
      supplierId: agg.supplierId,
      supplierName: sup.name ?? agg.supplierName,
      source: "purchase",
      unitCost,
      lastDate: agg.lastDate || null,
      bills: agg.bills.size,
      terms: sup.paymentTerms ?? null,
      outstanding: round2(Number(sup.balance ?? 0)),
      creditLimit: sup.creditLimit ?? null,
      estimatedCost: round2(unitCost * qty),
      stockQuantity: stockBySupplier.get(agg.supplierId) ?? 0,
    });
  }

  for (const q of latestQuote.values()) {
    const sup = supMap.get(q.supplierId);
    if (!sup) continue;
    const unitCost = round2(Number(q.quotedRate) || 0);
    const hist = perSupplier.get(q.supplierId);
    rows.push({
      supplierId: q.supplierId,
      supplierName: sup.name ?? supplierNames.get(q.supplierId) ?? "",
      source: "quote",
      unitCost,
      lastDate: q._date ?? null,
      bills: hist ? hist.bills.size : 0,
      terms: sup.paymentTerms ?? null,
      outstanding: round2(Number(sup.balance ?? 0)),
      creditLimit: sup.creditLimit ?? null,
      estimatedCost: round2(unitCost * qty),
      stockQuantity: stockBySupplier.get(q.supplierId) ?? 0,
    });
  }

  rows.sort((a, b) => {
    const au = a.unitCost ?? Number.POSITIVE_INFINITY;
    const bu = b.unitCost ?? Number.POSITIVE_INFINITY;
    return (
      au - bu ||
      a.supplierName.localeCompare(b.supplierName) ||
      a.source.localeCompare(b.source)
    );
  });

  return { medicineId, quantity: qty, quotes: rows };
}

// ---------------------------------------------------------------------------
// Recommendation (used by shortbook + compare panel)
// ---------------------------------------------------------------------------

export interface SupplierRecommendation {
  medicineId: string;
  quantity: number;
  cheapest: CompareQuoteRow | null;
  recommendation: CompareQuoteRow | null;
  suppliersConsidered: number;
  inStockSupplierIds: string[];
  notes: string[];
  quotes: CompareQuoteRow[];
}

export async function getSupplierRecommendation(
  userId: string,
  medicineId: string,
  quantity = 1
): Promise<SupplierRecommendation> {
  const compare = await compareSupplierQuotes(userId, medicineId, quantity);
  const ranked = compare.quotes.filter((q) => q.unitCost != null);
  const cheapest = ranked.length > 0 ? ranked[0] : null;
  const inStockSupplierIds = compare.quotes
    .filter((q) => q.stockQuantity > 0)
    .map((q) => q.supplierId);

  const notes: string[] = [];
  if (!cheapest) {
    notes.push("No purchase history or quotes recorded for this medicine yet.");
  } else {
    notes.push(
      `${cheapest.supplierName} is cheapest at Rs.${(cheapest.unitCost ?? 0).toFixed(2)} per unit (source: ${cheapest.source}).`
    );
  }
  if (cheapest && !inStockSupplierIds.includes(cheapest.supplierId)) {
    notes.push(`${cheapest.supplierName} currently has no stock of this medicine in hand.`);
  }
  if (inStockSupplierIds.length > 0) {
    notes.push(`${inStockSupplierIds.length} supplier(s) currently hold stock of this medicine.`);
  }

  return {
    medicineId,
    quantity: compare.quantity,
    cheapest,
    recommendation: cheapest,
    suppliersConsidered: compare.quotes.length,
    inStockSupplierIds,
    notes,
    quotes: compare.quotes,
  };
}

export interface ShortbookRecommendation {
  recommendedSupplierId: string;
  recommendedSupplierName: string;
  unitCost: number;
  source: "purchase" | "quote";
}

/**
 * Cheap per-row recommendation for the shortbook: cheapest supplier (latest
 * effective rate or freshest quote) for one medicine. Null when the medicine
 * has no purchase/quote history — callers then simply omit the fields.
 */
export async function recommendForShortbookRow(
  userId: string,
  medicineId: string
): Promise<ShortbookRecommendation | null> {
  if (!medicineId) return null;
  const compare = await compareSupplierQuotes(userId, medicineId, 1);
  const best = compare.quotes.find((q) => q.unitCost != null);
  if (!best || best.unitCost == null) return null;
  return {
    recommendedSupplierId: best.supplierId,
    recommendedSupplierName: best.supplierName,
    unitCost: best.unitCost,
    source: best.source,
  };
}

// ---------------------------------------------------------------------------
// Expiry risk (shared by metrics + drill-down)
// ---------------------------------------------------------------------------

export interface ExpiryRiskRow {
  medicineId: string | null;
  medicineName: string;
  batchNo: string | null;
  expiryDate: string | null;
  daysToExpiry: number | null;
  quantity: number;
  rate: number;
  value: number;
  billNo: string | null;
}

/**
 * Purchase lines whose batch (joined by medicine + batch number, falling back
 * to the line's own expiry snapshot) expires within 365 days or already
 * expired, valued at purchase cost (quantity * rate).
 */
async function collectExpiryRisk(userId: string, items: any[]) {
  const horizon = isoPlusDays(365);
  const medIds = [...new Set(items.map((i) => i.medicineId).filter(Boolean))] as string[];
  const batchRows = medIds.length
    ? await db
        .select()
        .from(batches)
        .where(and(eq(batches.createdBy, userId), inArray(batches.medicineId, medIds)))
    : [];
  const batchKey = new Map<string, any>();
  for (const b of batchRows as any[]) {
    batchKey.set(`${b.medicineId}|${b.batchNo}`, b);
  }

  const rows: ExpiryRiskRow[] = [];
  let value = 0;
  const today = todayISO();
  for (const it of items) {
    const batch =
      it.medicineId && it.batchNo ? batchKey.get(`${it.medicineId}|${it.batchNo}`) : undefined;
    const expiry: string | null = batch?.expiryDate ?? it.expiryDate ?? null;
    if (!expiry) continue;
    if (expiry > horizon) continue; // still fresh for the next 365 days
    const qty = Number(it.quantity ?? 0) || 0;
    const rate = Number(it.rate ?? 0) || 0;
    const lineValue = round2(qty * rate);
    value += lineValue;
    rows.push({
      medicineId: it.medicineId ?? null,
      medicineName: String(it.medicineName ?? ""),
      batchNo: it.batchNo ?? null,
      expiryDate: expiry,
      daysToExpiry: daysBetween(today, expiry),
      quantity: qty,
      rate,
      value: lineValue,
      billNo: it.__billNo ?? null,
    });
  }
  rows.sort((a, b) => String(a.expiryDate).localeCompare(String(b.expiryDate)));
  return { value: round2(value), rows };
}

/** Purchase lines (with bill numbers) for one supplier inside a period. */
async function fetchSupplierPurchaseItems(
  userId: string,
  supplierId: string,
  from?: string | null,
  to?: string | null
) {
  const bills = (await db
    .select()
    .from(purchaseBills)
    .where(
      and(eq(purchaseBills.createdBy, userId), eq(purchaseBills.supplierId, supplierId))
    )) as any[];
  const inScope = bills.filter((b) => inPeriod(b.billDate, from, to));
  const billIds = inScope.map((b) => b.id as string);
  const billNoById = new Map<string, string>(
    inScope.map((b) => [b.id as string, String(b.billNo ?? "")])
  );
  const items = billIds.length
    ? ((await db
        .select()
        .from(purchaseBillItems)
        .where(inArray(purchaseBillItems.purchaseBillId, billIds))) as any[])
    : [];
  return {
    bills,
    billsInPeriod: inScope,
    items: items.map((i) => ({ ...i, __billNo: billNoById.get(i.purchaseBillId) ?? null })),
  };
}

// ---------------------------------------------------------------------------
// Supplier metrics
// ---------------------------------------------------------------------------

export interface SupplierMetricsResult {
  supplierId: string;
  supplierName: string;
  from: string | null;
  to: string | null;
  totals: {
    totalPurchased: number;
    totalPaid: number;
    outstanding: number;
  };
  outstanding: number;
  paymentTerms: string | null;
  creditLimit: number | null;
  metrics: {
    billCount: number;
    returnCount: number;
    returnRatePct: number;
    fillRatePct: number;
    returnQtyPct: number;
    avgPaymentDays: number;
    expiryRiskValue: number;
  };
  bills: Array<{
    billNo: string;
    billDate: string;
    grandTotal: number;
    amountPaid: number;
    paymentStatus: string | null;
    dueDate: string | null;
  }>;
}

/**
 * Performance of one supplier over a period (both bounds optional; an empty
 * period returns zeroed metrics rather than failing).
 *
 * Returns `null` when the supplier does not exist OR belongs to another
 * tenant — routes translate that into a 404.
 */
export async function getSupplierMetrics(
  userId: string,
  supplierId: string,
  from?: string | null,
  to?: string | null
): Promise<SupplierMetricsResult | null> {
  const [sup] = await db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, supplierId), eq(suppliers.createdBy, userId)))
    .limit(1);
  if (!sup) return null;

  const { bills, billsInPeriod, items } = await fetchSupplierPurchaseItems(
    userId,
    supplierId,
    from,
    to
  );
  const billsScoped = billsInPeriod;
  const totalPurchased = round2(
    billsScoped.reduce((s, b) => s + (Number(b.grandTotal) || 0), 0)
  );

  // Payments to this supplier (type = paid).
  const payRows = (await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.createdBy, userId),
        eq(payments.supplierId, supplierId),
        eq(payments.type, "paid")
      )
    )) as any[];
  const paidInPeriod = payRows.filter((p) => !p.voided && inPeriod(p.date, from, to));
  const totalPaid = round2(paidInPeriod.reduce((s, p) => s + (Number(p.amount) || 0), 0));

  // Average payment lag: bill date -> date the money actually went out.
  const billDateByNo = new Map<string, string>(
    bills.map((b) => [String(b.billNo), String(b.billDate ?? "")])
  );
  const lags: number[] = [];
  for (const p of paidInPeriod) {
    const ref = p.reference ? billDateByNo.get(String(p.reference)) : undefined;
    if (!ref) continue;
    const lag = daysBetween(ref, String(p.date));
    if (lag >= 0) lags.push(lag);
  }
  const avgPaymentDays =
    lags.length > 0 ? round2(lags.reduce((a, b) => a + b, 0) / lags.length) : 0;

  // Returns: bills touched by a purchase return, plus returned-quantity ratio.
  const allReturns = (await db
    .select()
    .from(purchaseReturns)
    .where(
      and(eq(purchaseReturns.createdBy, userId), eq(purchaseReturns.supplierId, supplierId))
    )) as any[];
  const returnsInPeriod = allReturns.filter((r) => inPeriod(r.date, from, to));
  const returnIds = returnsInPeriod.map((r) => r.id as string);
  const returnItems = returnIds.length
    ? ((await db
        .select()
        .from(purchaseReturnItems)
        .where(inArray(purchaseReturnItems.returnId, returnIds))) as any[])
    : [];

  const returnBillIds = new Set(
    returnsInPeriod.map((r) => r.purchaseBillId).filter(Boolean) as string[]
  );
  const billCount = billsScoped.length;
  const billsWithReturns = billsScoped.filter((b) => returnBillIds.has(b.id)).length;
  const returnCount = returnsInPeriod.length;
  const returnRatePct = billCount > 0 ? round2((billsWithReturns / billCount) * 100) : 0;
  const fillRatePct = billCount > 0 ? round2(100 - returnRatePct) : 0;

  const purchasedQty = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  const returnedQty = returnItems.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  const returnQtyPct = purchasedQty > 0 ? round2((returnedQty / purchasedQty) * 100) : 0;

  // Expiry risk: purchase lines whose batch expires (or already expired)
  // within the next 365 days, valued at purchase cost.
  const { value: expiryRiskValue } = await collectExpiryRisk(userId, items);

  return {
    supplierId,
    supplierName: sup.name,
    from: from ?? null,
    to: to ?? null,
    totals: {
      totalPurchased,
      totalPaid,
      outstanding: round2(Number(sup.balance ?? 0)),
    },
    outstanding: round2(Number(sup.balance ?? 0)),
    paymentTerms: sup.paymentTerms ?? null,
    creditLimit: sup.creditLimit ?? null,
    metrics: {
      billCount,
      returnCount,
      returnRatePct,
      fillRatePct,
      returnQtyPct,
      avgPaymentDays,
      expiryRiskValue,
    },
    bills: billsScoped
      .map((b) => ({
        billNo: String(b.billNo ?? ""),
        billDate: String(b.billDate ?? ""),
        grandTotal: round2(Number(b.grandTotal) || 0),
        amountPaid: round2(Number(b.amountPaid) || 0),
        paymentStatus: b.paymentStatus ?? null,
        dueDate: b.dueDate ?? null,
      }))
      .sort((a, b) => b.billDate.localeCompare(a.billDate)),
  };
}

/**
 * Batch-level expiry drill-down for one supplier: every purchase line whose
 * batch expires (or already expired) within 365 days.
 */
export async function getSupplierExpiryItems(
  userId: string,
  supplierId: string,
  from?: string | null,
  to?: string | null
): Promise<{ supplierId: string; supplierName: string; rows: ExpiryRiskRow[]; totalValue: number } | null> {
  const [sup] = await db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, supplierId), eq(suppliers.createdBy, userId)))
    .limit(1);
  if (!sup) return null;

  const { items } = await fetchSupplierPurchaseItems(userId, supplierId, from, to);
  const { value, rows } = await collectExpiryRisk(userId, items);
  return { supplierId, supplierName: sup.name, rows, totalValue: value };
}

// ---------------------------------------------------------------------------
// Quotes CRUD
// ---------------------------------------------------------------------------

export interface QuoteRecord {
  id: string;
  supplierId: string;
  supplierName: string | null;
  medicineId: string;
  medicineName: string | null;
  quotedRate: number;
  quoteDate: string | null;
  notes: string | null;
  createdAt: string;
}

export type CreateQuoteResult =
  | { ok: true; quote: QuoteRecord }
  | { ok: false; error: "supplier_not_found" | "medicine_not_found" };

/** Record a manual supplier quotation. Supplier/medicine must belong to the tenant. */
export async function createQuote(
  userId: string,
  input: {
    supplierId: string;
    medicineId: string;
    quotedRate: number;
    quoteDate?: string | null;
    notes?: string | null;
  }
): Promise<CreateQuoteResult> {
  const [sup] = await db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.createdBy, userId)))
    .limit(1);
  if (!sup) return { ok: false, error: "supplier_not_found" };

  const [med] = await db
    .select({ id: medicines.id, name: medicines.name })
    .from(medicines)
    .where(and(eq(medicines.id, input.medicineId), eq(medicines.createdBy, userId)))
    .limit(1);
  if (!med) return { ok: false, error: "medicine_not_found" };

  const now = new Date();
  const [inserted] = await db
    .insert(supplierQuotes)
    .values({
      createdBy: userId,
      supplierId: input.supplierId,
      medicineId: input.medicineId,
      quotedRate: Number(input.quotedRate),
      quoteDate: input.quoteDate ?? todayISO(),
      notes: input.notes ?? null,
      createdAt: now,
    })
    .returning();

  return {
    ok: true,
    quote: {
      id: inserted.id,
      supplierId: input.supplierId,
      supplierName: sup.name,
      medicineId: input.medicineId,
      medicineName: med.name,
      quotedRate: Number(inserted.quotedRate),
      quoteDate: inserted.quoteDate,
      notes: inserted.notes,
      createdAt: dateOfTimestamp(inserted.createdAt),
    },
  };
}

/** List quotes for the tenant, optionally filtered by medicine and/or supplier. */
export async function listQuotes(
  userId: string,
  filters: { medicineId?: string | null; supplierId?: string | null } = {}
): Promise<QuoteRecord[]> {
  const conds = [eq(supplierQuotes.createdBy, userId)];
  if (filters.medicineId) conds.push(eq(supplierQuotes.medicineId, filters.medicineId));
  if (filters.supplierId) conds.push(eq(supplierQuotes.supplierId, filters.supplierId));

  const rows = (await db.select().from(supplierQuotes).where(and(...conds))) as any[];
  if (rows.length === 0) return [];

  const supMap = await fetchTenantSuppliers(
    userId,
    rows.map((r) => r.supplierId)
  );
  const medIds = [...new Set(rows.map((r) => r.medicineId))];
  const medRows = await db
    .select({ id: medicines.id, name: medicines.name })
    .from(medicines)
    .where(and(eq(medicines.createdBy, userId), inArray(medicines.id, medIds)));
  const medMap = new Map((medRows as any[]).map((m) => [m.id, m.name]));

  return rows
    .map((r) => ({
      id: r.id,
      supplierId: r.supplierId,
      supplierName: supMap.get(r.supplierId)?.name ?? null,
      medicineId: r.medicineId,
      medicineName: medMap.get(r.medicineId) ?? null,
      quotedRate: Number(r.quotedRate) || 0,
      quoteDate: r.quoteDate ?? null,
      notes: r.notes ?? null,
      createdAt: dateOfTimestamp(r.createdAt),
    }))
    .sort(
      (a, b) =>
        String(b.quoteDate).localeCompare(String(a.quoteDate)) || a.id.localeCompare(b.id)
    );
}
