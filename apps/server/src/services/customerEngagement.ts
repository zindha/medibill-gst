/**
 * Customer Growth (Task 10) — insights (RFM/churn/refills), loyalty ledger,
 * offers and campaigns. Every entry point is userId-first and tenant-scoped.
 *
 * RFM note (documented reuse): the R/F/M scoring below intentionally mirrors
 * `routes/reports.ts buildPartyCustomers` — R = days since last purchase
 * (inverted min-max), F = invoice count in the last 180 days, M = invoice sum
 * in the last 180 days, each normalized to 1..5 across the tenant's customers
 * with `rfmScore = R + F + M`. reports.ts is a 2.8k-line route module and is
 * NOT imported; this file carries a local equivalent so the service stays
 * self-contained while staying numerically identical to the party report.
 *
 * Loyalty consistency note (documented eventual consistency): invoice creation
 * validates the redeem balance BEFORE its transaction and writes the earn /
 * redeem ledger rows AFTER the commit. A post-commit ledger failure never
 * rolls back a completed sale — it is logged and recorded as audit
 * `loyalty.post_failed` for manual reconciliation. The ledger idempotency keys
 * (`sale:<invoiceId>`, `redeem:<invoiceId>`) make retries safe.
 */

import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  campaigns,
  customers,
  invoiceItems,
  invoices,
  loyaltyLedger,
  medicines,
  offers,
  refillReminders,
  settings,
  type Campaign,
  type LoyaltyLedgerEntry,
  type MessageChannel,
  type Offer,
} from "../db/schema/index.js";
import {
  isOptedOut,
  queueMessage,
  readSettingString,
  renderTemplate,
} from "./messaging.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Typed error the routes map onto HTTP status codes (400/404). */
export class EngagementError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "EngagementError";
    this.statusCode = statusCode;
  }
}

// ---------------------------------------------------------------------------
// Small date/math helpers (local equivalents of the reports.ts helpers)
// ---------------------------------------------------------------------------

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

/** Whole days from `b` to `a` (a >= b), floored — reports.ts parity. */
function daysBetween(a: string, b: string): number {
  const ta = new Date(a + "T00:00:00Z").getTime();
  const tb = new Date(b + "T00:00:00Z").getTime();
  return Math.max(0, Math.floor((ta - tb) / DAY_MS));
}

function addDays(dateStr: string, days: number): string {
  const t = new Date(dateStr + "T00:00:00Z").getTime() + days * DAY_MS;
  return new Date(t).toISOString().split("T")[0];
}

/** Min-max normalize to 1..5 (inverted = lower is better). reports.ts parity. */
function normalize15(value: number, min: number, max: number, invert = false): number {
  if (max === min) return 3;
  const ratio = invert ? (max - value) / (max - min) : (value - min) / (max - min);
  const score = Math.round(ratio * 4) + 1;
  return Math.min(5, Math.max(1, score));
}

/** Median of a numeric list; even counts average the two middles. null = empty. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Settings (install-wide singleton key, like the expiry policy)
// ---------------------------------------------------------------------------

export interface LoyaltySettings {
  enabled: boolean;
  pointsPer100Rupee: number;
  rupeePerPoint: number;
}

export const LOYALTY_SETTINGS_KEY = "loyalty";

export const DEFAULT_LOYALTY_SETTINGS: LoyaltySettings = {
  enabled: false,
  pointsPer100Rupee: 1,
  rupeePerPoint: 1,
};

/**
 * Read settings key `loyalty` (`{enabled, pointsPer100Rupee, rupeePerPoint}`),
 * merged over the disabled-by-default constant so existing installs and tests
 * are unaffected until the key is explicitly written.
 */
export async function getLoyaltySettings(_userId?: string): Promise<LoyaltySettings> {
  try {
    const [row] = await db
      .select()
      .from(settings)
      .where(eq(settings.key, LOYALTY_SETTINGS_KEY))
      .limit(1);
    if (!row) return { ...DEFAULT_LOYALTY_SETTINGS };
    const parsed = parseJson<Partial<LoyaltySettings>>(row.value, {});
    return {
      enabled: parsed.enabled === true,
      pointsPer100Rupee:
        typeof parsed.pointsPer100Rupee === "number" && parsed.pointsPer100Rupee >= 0
          ? parsed.pointsPer100Rupee
          : DEFAULT_LOYALTY_SETTINGS.pointsPer100Rupee,
      rupeePerPoint:
        typeof parsed.rupeePerPoint === "number" && parsed.rupeePerPoint >= 0
          ? parsed.rupeePerPoint
          : DEFAULT_LOYALTY_SETTINGS.rupeePerPoint,
    };
  } catch {
    return { ...DEFAULT_LOYALTY_SETTINGS };
  }
}

// ---------------------------------------------------------------------------
// Shared row fetchers
// ---------------------------------------------------------------------------

async function getCustomerOr404(userId: string, customerId: string) {
  const [row] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.createdBy, userId)))
    .limit(1);
  if (!row) throw new EngagementError("Customer not found", 404);
  return row;
}

/** Valid invoices for one customer (not cancelled, not on hold), date ascending. */
async function getCustomerInvoices(userId: string, customerId: string) {
  const rows = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.createdBy, userId), eq(invoices.customerId, customerId)));
  return rows
    .filter((i) => i.status !== "cancelled" && !(i as { hold?: boolean | null }).hold)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// ---------------------------------------------------------------------------
// RFM (local equivalent of reports.ts buildPartyCustomers scoring)
// ---------------------------------------------------------------------------

export interface RfmScore {
  recencyDays: number | null;
  frequency: number;
  monetary: number;
  rScore: number;
  fScore: number;
  mScore: number;
  rfmScore: number;
}

/**
 * Score every customer of the tenant with the reports.ts algorithm and return
 * a customerId → score map. Pool = all tenant customers (the party report also
 * hides inactive rows; a single-customer insight must still score its target).
 */
export async function computeRfmScores(userId: string): Promise<Map<string, RfmScore>> {
  const allCustomers = await db.select().from(customers).where(eq(customers.createdBy, userId));
  const allInvoices = await db.select().from(invoices).where(eq(invoices.createdBy, userId));
  const valid = allInvoices.filter((i) => i.status !== "cancelled" && !(i as { hold?: boolean | null }).hold);

  const byCustomer = new Map<string, typeof valid>();
  for (const inv of valid) {
    if (!inv.customerId) continue;
    const arr = byCustomer.get(inv.customerId) ?? [];
    arr.push(inv);
    byCustomer.set(inv.customerId, arr);
  }

  const today = todayStr();
  const cutoff180 = addDays(today, -180);

  type Raw = { id: string; recencyDays: number | null; freq: number; monetary: number };
  const rawList: Raw[] = [];
  for (const c of allCustomers) {
    const invs = byCustomer.get(c.id) ?? [];
    const lastPurchase = (c as { lastPurchaseDate?: string | null }).lastPurchaseDate ?? null;
    let maxInvoiceDate: string | null = null;
    for (const inv of invs) {
      const d = String(inv.date);
      if (!maxInvoiceDate || d > maxInvoiceDate) maxInvoiceDate = d;
    }
    const recencySource = lastPurchase ?? maxInvoiceDate ?? null;
    const recencyDays = recencySource ? daysBetween(today, recencySource) : null;
    const inWindow = invs.filter((inv) => String(inv.date) >= cutoff180);
    rawList.push({
      id: c.id,
      recencyDays,
      freq: inWindow.length,
      monetary: inWindow.reduce((sum, inv) => sum + Number(inv.grandTotal ?? 0), 0),
    });
  }

  const withHistory = rawList.filter((r) => r.recencyDays !== null);
  const recencyVals = withHistory.map((r) => r.recencyDays as number);
  const freqVals = withHistory.map((r) => r.freq);
  const monetaryVals = withHistory.map((r) => r.monetary);
  const recMin = recencyVals.length ? Math.min(...recencyVals) : 0;
  const recMax = recencyVals.length ? Math.max(...recencyVals) : 0;
  const freqMin = freqVals.length ? Math.min(...freqVals) : 0;
  const freqMax = freqVals.length ? Math.max(...freqVals) : 0;
  const monMin = monetaryVals.length ? Math.min(...monetaryVals) : 0;
  const monMax = monetaryVals.length ? Math.max(...monetaryVals) : 0;

  const scores = new Map<string, RfmScore>();
  for (const raw of rawList) {
    if (raw.recencyDays === null) {
      scores.set(raw.id, {
        recencyDays: null,
        frequency: raw.freq,
        monetary: round2(raw.monetary),
        rScore: 0,
        fScore: 0,
        mScore: 0,
        rfmScore: 0,
      });
      continue;
    }
    const rScore = normalize15(raw.recencyDays, recMin, recMax, true);
    const fScore = normalize15(raw.freq, freqMin, freqMax, false);
    const mScore = normalize15(raw.monetary, monMin, monMax, false);
    scores.set(raw.id, {
      recencyDays: raw.recencyDays,
      frequency: raw.freq,
      monetary: round2(raw.monetary),
      rScore,
      fScore,
      mScore,
      rfmScore: rScore + fScore + mScore,
    });
  }
  return scores;
}

// ---------------------------------------------------------------------------
// 1. Customer insights
// ---------------------------------------------------------------------------

export interface FrequentMedicine {
  medicineId: string;
  name: string;
  brand: string | null;
  qty: number;
  lastBought: string;
  /** Median days between purchases of this medicine; null when only one buy. */
  avgGapDays: number | null;
  /** lastBought + avgGapDays — the suggested refill date. */
  dueDate: string | null;
}

export type ChurnRisk = "unknown" | "low" | "medium" | "high";

export interface CustomerInsights {
  customer: { id: string; name: string; phone: string | null; email: string | null };
  rfm: RfmScore;
  ltv: number;
  invoiceCount: number;
  /** Median gap between consecutive invoices (null with fewer than 2 invoices). */
  avgIntervalDays: number | null;
  churnRisk: ChurnRisk;
  daysIdle: number | null;
  lastPurchaseAt: string | null;
  frequentMedicines: FrequentMedicine[];
  refillCandidates: FrequentMedicine[];
  balance: number;
}

/**
 * Purchase analytics for one customer:
 * - intervals: median of the gaps between consecutive invoices,
 * - frequent medicines: last 180 days, ranked by quantity, with the median
 *   gap between repeat purchases,
 * - churn: high when idle > 2x the invoice interval, medium when idle >
 *   1.5x the interval or > 90 days, low otherwise, "unknown" with no invoices,
 * - refill candidates: frequent medicines whose next run-out date falls within
 *   the next 7 days.
 */
export async function getCustomerInsights(userId: string, customerId: string): Promise<CustomerInsights> {
  const customer = await getCustomerOr404(userId, customerId);
  const invs = await getCustomerInvoices(userId, customerId);
  const today = todayStr();

  const lastPurchaseAt = invs.length ? invs[invs.length - 1].date : null;
  const ltv = round2(invs.reduce((sum, i) => sum + Number(i.grandTotal ?? 0), 0));
  const invoiceCount = invs.length;

  const gaps: number[] = [];
  for (let i = 1; i < invs.length; i++) gaps.push(daysBetween(invs[i].date, invs[i - 1].date));
  const avgIntervalDays = median(gaps);

  const daysIdle = lastPurchaseAt ? daysBetween(today, lastPurchaseAt) : null;

  let churnRisk: ChurnRisk;
  if (daysIdle === null) {
    churnRisk = "unknown";
  } else if (avgIntervalDays !== null && daysIdle > 2 * avgIntervalDays) {
    churnRisk = "high";
  } else if ((avgIntervalDays !== null && daysIdle > 1.5 * avgIntervalDays) || daysIdle > 90) {
    churnRisk = "medium";
  } else {
    churnRisk = "low";
  }

  // Frequent medicines — invoice items joined to invoices, last 180 days.
  const cutoff180 = addDays(today, -180);
  const itemRows = invs.length
    ? await db
        .select({
          medicineId: invoiceItems.medicineId,
          medicineName: invoiceItems.medicineName,
          quantity: invoiceItems.quantity,
          invoiceDate: invoices.date,
        })
        .from(invoiceItems)
        .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
        .where(
          and(
            eq(invoices.createdBy, userId),
            eq(invoices.customerId, customerId),
            gte(invoices.date, cutoff180)
          )
        )
    : [];

  const validDates = new Set(invs.map((i) => i.date));
  const grouped = new Map<string, { qty: number; dates: Set<string>; fallbackName: string }>();
  for (const row of itemRows) {
    if (!row.medicineId || !validDates.has(row.invoiceDate)) continue;
    const g = grouped.get(row.medicineId) ?? { qty: 0, dates: new Set<string>(), fallbackName: row.medicineName };
    g.qty += Number(row.quantity ?? 0);
    g.dates.add(row.invoiceDate);
    grouped.set(row.medicineId, g);
  }

  const medicineIds = [...grouped.keys()];
  const medicineRows = medicineIds.length
    ? await db
        .select({ id: medicines.id, name: medicines.name, brand: medicines.brand })
        .from(medicines)
        .where(inArray(medicines.id, medicineIds))
    : [];
  const medicineById = new Map(medicineRows.map((m) => [m.id, m]));

  const frequentMedicines: FrequentMedicine[] = [];
  for (const [medicineId, g] of grouped) {
    const dates = [...g.dates].sort();
    const buyGaps: number[] = [];
    for (let i = 1; i < dates.length; i++) buyGaps.push(daysBetween(dates[i], dates[i - 1]));
    const avgGapDays = median(buyGaps);
    const lastBought = dates[dates.length - 1];
    const meta = medicineById.get(medicineId);
    frequentMedicines.push({
      medicineId,
      name: meta?.name ?? g.fallbackName,
      brand: meta?.brand ?? null,
      qty: g.qty,
      lastBought,
      avgGapDays,
      dueDate: avgGapDays === null ? null : addDays(lastBought, avgGapDays),
    });
  }
  frequentMedicines.sort((a, b) => b.qty - a.qty || (a.name < b.name ? -1 : 1));
  frequentMedicines.splice(10);

  const horizon = addDays(today, 7);
  const refillCandidates = frequentMedicines.filter(
    (m) => m.dueDate !== null && m.dueDate <= horizon
  );

  const rfmMap = await computeRfmScores(userId);
  const rfm: RfmScore = rfmMap.get(customerId) ?? {
    recencyDays: null,
    frequency: 0,
    monetary: 0,
    rScore: 0,
    fScore: 0,
    mScore: 0,
    rfmScore: 0,
  };

  return {
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone ?? null,
      email: customer.email ?? null,
    },
    rfm,
    ltv,
    invoiceCount,
    avgIntervalDays,
    churnRisk,
    daysIdle,
    lastPurchaseAt,
    frequentMedicines,
    refillCandidates,
    balance: round2(Number(customer.balance ?? 0)),
  };
}

// ---------------------------------------------------------------------------
// 2/3. Loyalty ledger
// ---------------------------------------------------------------------------

export async function loyaltyBalance(userId: string, customerId: string): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`COALESCE(SUM(${loyaltyLedger.points}), 0)` })
    .from(loyaltyLedger)
    .where(
      and(eq(loyaltyLedger.createdBy, userId), eq(loyaltyLedger.customerId, customerId))
    );
  return round2(Number(rows[0]?.total ?? 0));
}

export interface LoyaltyEntryInput {
  points: number;
  reason?: string;
  invoiceId?: string;
  idempotencyKey?: string;
}

async function findLedgerByIdempotency(
  userId: string,
  idempotencyKey: string
): Promise<LoyaltyLedgerEntry | null> {
  const [row] = await db
    .select()
    .from(loyaltyLedger)
    .where(
      and(
        eq(loyaltyLedger.createdBy, userId),
        eq(loyaltyLedger.idempotencyKey, idempotencyKey)
      )
    )
    .limit(1);
  return row ?? null;
}

async function insertLedger(
  userId: string,
  customerId: string,
  type: "earn" | "redeem" | "adjust",
  input: LoyaltyEntryInput
): Promise<LoyaltyLedgerEntry> {
  const [row] = await db
    .insert(loyaltyLedger)
    .values({
      createdBy: userId,
      customerId,
      points: type === "redeem" ? -Math.abs(input.points) : Math.abs(input.points),
      type,
      reason: input.reason ?? null,
      invoiceId: input.invoiceId ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      createdAt: new Date(),
    })
    .returning();
  return row;
}

/** Earn positive points. Replaying the same idempotency key returns the original row. */
export async function loyaltyEarn(
  userId: string,
  customerId: string,
  input: LoyaltyEntryInput
): Promise<LoyaltyLedgerEntry> {
  if (!(input.points > 0)) throw new EngagementError("points must be greater than 0");
  await getCustomerOr404(userId, customerId);
  if (input.idempotencyKey) {
    const existing = await findLedgerByIdempotency(userId, input.idempotencyKey);
    if (existing) return existing;
  }
  return insertLedger(userId, customerId, "earn", input);
}

/**
 * Redeem points as a negative ledger row. 400 "insufficient balance" when the
 * request exceeds SUM(points); replaying an idempotency key never re-checks
 * the balance (the original redemption already passed it).
 */
export async function loyaltyRedeem(
  userId: string,
  customerId: string,
  input: LoyaltyEntryInput
): Promise<LoyaltyLedgerEntry> {
  if (!(input.points > 0)) throw new EngagementError("points must be greater than 0");
  await getCustomerOr404(userId, customerId);
  if (input.idempotencyKey) {
    const existing = await findLedgerByIdempotency(userId, input.idempotencyKey);
    if (existing) return existing;
  }
  const balance = await loyaltyBalance(userId, customerId);
  if (input.points > balance) throw new EngagementError("insufficient balance", 400);
  return insertLedger(userId, customerId, "redeem", input);
}

/** Balance plus the most recent ledger entries (newest first). */
export async function loyaltyLedgerView(
  userId: string,
  customerId: string,
  limit = 20
): Promise<{ customerId: string; balance: number; entries: LoyaltyLedgerEntry[] }> {
  await getCustomerOr404(userId, customerId);
  const balance = await loyaltyBalance(userId, customerId);
  const entries = await db
    .select()
    .from(loyaltyLedger)
    .where(and(eq(loyaltyLedger.createdBy, userId), eq(loyaltyLedger.customerId, customerId)))
    .orderBy(desc(loyaltyLedger.createdAt), sql`rowid DESC`)
    .limit(limit);
  return { customerId, balance, entries };
}

// ---------------------------------------------------------------------------
// 4. Offers
// ---------------------------------------------------------------------------

export interface OfferInput {
  name: string;
  type: "fixed" | "percent";
  value: number;
  medicineId?: string | null;
  minAmount?: number;
  startsOn: string;
  endsOn: string;
  isActive?: boolean;
}

export interface OfferEvaluation {
  applies: boolean;
  discount: number;
  reason: string | null;
}

async function getOfferOr404(userId: string, offerId: string): Promise<Offer> {
  const [row] = await db
    .select()
    .from(offers)
    .where(and(eq(offers.id, offerId), eq(offers.createdBy, userId)))
    .limit(1);
  if (!row) throw new EngagementError("Offer not found", 404);
  return row;
}

function assertDateWindow(startsOn: string, endsOn: string): void {
  if (endsOn < startsOn) throw new EngagementError("endsOn must be on or after startsOn");
}

export async function listOffers(
  userId: string,
  opts: { activeOnly?: boolean; q?: string } = {}
): Promise<Offer[]> {
  const rows = await db
    .select()
    .from(offers)
    .where(eq(offers.createdBy, userId))
    .orderBy(desc(offers.createdAt), sql`rowid DESC`);
  const q = opts.q?.trim().toLowerCase();
  return rows.filter((o) => {
    if (opts.activeOnly && !o.isActive) return false;
    if (q && !o.name.toLowerCase().includes(q)) return false;
    return true;
  });
}

export async function createOffer(userId: string, input: OfferInput): Promise<Offer> {
  assertDateWindow(input.startsOn, input.endsOn);
  const now = new Date();
  const [row] = await db
    .insert(offers)
    .values({
      createdBy: userId,
      name: input.name,
      type: input.type,
      value: input.value,
      medicineId: input.medicineId ?? null,
      minAmount: input.minAmount ?? 0,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return row;
}

export async function updateOffer(
  userId: string,
  offerId: string,
  patch: Partial<OfferInput> & { isActive?: boolean }
): Promise<Offer> {
  const existing = await getOfferOr404(userId, offerId);
  const startsOn = patch.startsOn ?? existing.startsOn;
  const endsOn = patch.endsOn ?? existing.endsOn;
  assertDateWindow(startsOn, endsOn);

  const [row] = await db
    .update(offers)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.value !== undefined ? { value: patch.value } : {}),
      ...(patch.medicineId !== undefined ? { medicineId: patch.medicineId } : {}),
      ...(patch.minAmount !== undefined ? { minAmount: patch.minAmount } : {}),
      ...(patch.startsOn !== undefined ? { startsOn: patch.startsOn } : {}),
      ...(patch.endsOn !== undefined ? { endsOn: patch.endsOn } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(offers.id, offerId), eq(offers.createdBy, userId)))
    .returning();
  return row;
}

/** Soft delete — offers are deactivated (is_active = 0), never hard-deleted. */
export async function deactivateOffer(userId: string, offerId: string): Promise<Offer> {
  return updateOffer(userId, offerId, { isActive: false });
}

/**
 * Evaluate an offer against a bill. `subtotal` is the server's computed
 * pre-GST subtotal (sum of line amounts net of GST) and `medicineIds` are the
 * distinct medicines on the bill. Date window and min_amount are inclusive;
 * a medicine-specific offer requires its medicine on the bill.
 */
export async function evaluateOffer(
  userId: string,
  offerId: string,
  subtotal: number,
  medicineIds: string[] = []
): Promise<OfferEvaluation> {
  const offer = await getOfferOr404(userId, offerId);
  const today = todayStr();

  if (!offer.isActive) {
    return { applies: false, discount: 0, reason: "Offer is not active" };
  }
  if (today < offer.startsOn) {
    return { applies: false, discount: 0, reason: `Offer starts on ${offer.startsOn}` };
  }
  if (today > offer.endsOn) {
    return { applies: false, discount: 0, reason: `Offer ended on ${offer.endsOn}` };
  }
  if (subtotal < Number(offer.minAmount ?? 0)) {
    return {
      applies: false,
      discount: 0,
      reason: `Minimum bill of ₹${Number(offer.minAmount ?? 0)} required`,
    };
  }
  if (offer.medicineId && !medicineIds.includes(offer.medicineId)) {
    return { applies: false, discount: 0, reason: "Offer applies only to specific medicines on the bill" };
  }

  const base = Math.max(0, Number(subtotal));
  const raw =
    offer.type === "percent" ? (base * Number(offer.value ?? 0)) / 100 : Number(offer.value ?? 0);
  const discount = round2(Math.max(0, Math.min(raw, base)));
  return { applies: true, discount, reason: null };
}

// ---------------------------------------------------------------------------
// 6. Campaign audiences
// ---------------------------------------------------------------------------

export type CampaignAudience =
  | { type: "all" }
  | { type: "rfm"; minScore: number }
  | { type: "medicine"; medicineId: string; withinDays?: number }
  | { type: "balance"; minAmount: number }
  | { type: "refill"; withinDays: number };

export interface AudienceResolution {
  customerIds: string[];
  /** Candidates matching the audience filter (before consent/contact gates). */
  matched: number;
  skippedOptOut: number;
  skippedNoContact: number;
}

function parseAudience(raw: unknown): CampaignAudience {
  const value = typeof raw === "string" ? parseJson<Record<string, unknown>>(raw, {}) : (raw ?? {});
  const audience = value as CampaignAudience;
  if (!audience || typeof audience !== "object" || typeof audience.type !== "string") {
    throw new EngagementError("Audience must be an object with a type");
  }
  return audience;
}

/**
 * Resolve an audience JSON into reachable, non-opted-out customer ids for the
 * campaign channel. Phone is required for whatsapp/sms, email for email;
 * everything else is skipped and counted.
 */
export async function resolveAudience(
  userId: string,
  audience: unknown,
  channel: MessageChannel
): Promise<AudienceResolution> {
  const parsed = parseAudience(audience);
  const today = todayStr();
  const candidateIds = new Set<string>();

  if (parsed.type === "all") {
    const rows = await db.select({ id: customers.id }).from(customers).where(eq(customers.createdBy, userId));
    for (const r of rows) candidateIds.add(r.id);
  } else if (parsed.type === "rfm") {
    const minScore = Number(parsed.minScore ?? 0);
    const scores = await computeRfmScores(userId);
    for (const [id, score] of scores) {
      if (score.rfmScore >= minScore) candidateIds.add(id);
    }
  } else if (parsed.type === "medicine") {
    if (!parsed.medicineId) throw new EngagementError("Audience medicineId is required");
    const conds = [
      eq(invoices.createdBy, userId),
      eq(invoiceItems.medicineId, parsed.medicineId),
      sql`COALESCE(${invoices.hold}, 0) = 0`,
    ];
    if (parsed.withinDays) conds.push(gte(invoices.date, addDays(today, -Number(parsed.withinDays))));
    const rows = await db
      .select({ customerId: invoices.customerId, date: invoices.date, status: invoices.status })
      .from(invoiceItems)
      .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
      .where(and(...conds));
    for (const r of rows) {
      if (r.customerId && r.status !== "cancelled") candidateIds.add(r.customerId);
    }
  } else if (parsed.type === "balance") {
    const minAmount = Number(parsed.minAmount ?? 0);
    const rows = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.createdBy, userId), gte(customers.balance, minAmount)));
    for (const r of rows) candidateIds.add(r.id);
  } else if (parsed.type === "refill") {
    const withinDays = Number(parsed.withinDays ?? 0);
    const rows = await db
      .select({ customerId: refillReminders.customerId })
      .from(refillReminders)
      .where(
        and(
          eq(refillReminders.createdBy, userId),
          eq(refillReminders.status, "pending"),
          lte(refillReminders.reminderDate, addDays(today, withinDays))
        )
      );
    for (const r of rows) {
      if (r.customerId) candidateIds.add(r.customerId);
    }
  } else {
    throw new EngagementError(`Unknown audience type: ${(parsed as { type?: string }).type}`);
  }

  const ids = [...candidateIds];
  const customerRows = ids.length
    ? await db
        .select({
          id: customers.id,
          phone: customers.phone,
          email: customers.email,
        })
        .from(customers)
        .where(and(eq(customers.createdBy, userId), inArray(customers.id, ids)))
    : [];

  const customerIds: string[] = [];
  let skippedOptOut = 0;
  let skippedNoContact = 0;
  for (const row of customerRows) {
    if (await isOptedOut(userId, row.id, channel)) {
      skippedOptOut++;
      continue;
    }
    const contact = channel === "email" ? (row.email ?? "").trim() : (row.phone ?? "").trim();
    if (!contact) {
      skippedNoContact++;
      continue;
    }
    customerIds.push(row.id);
  }

  return {
    customerIds,
    matched: ids.length,
    skippedOptOut,
    skippedNoContact,
  };
}

// ---------------------------------------------------------------------------
// 7/8. Campaigns
// ---------------------------------------------------------------------------

export interface CampaignInput {
  name: string;
  channel: MessageChannel;
  template?: string;
  body?: string;
  audience: unknown;
  scheduleAt?: string | null;
}

export interface CampaignStats {
  audience: number;
  queued: number;
  skippedOptOut: number;
  skippedNoContact: number;
}

async function getCampaignOr404(userId: string, campaignId: string): Promise<Campaign> {
  const [row] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.createdBy, userId)))
    .limit(1);
  if (!row) throw new EngagementError("Campaign not found", 404);
  return row;
}

export async function createCampaign(userId: string, input: CampaignInput): Promise<Campaign> {
  const audience = parseAudience(input.audience);
  const now = new Date();
  const [row] = await db
    .insert(campaigns)
    .values({
      createdBy: userId,
      name: input.name,
      channel: input.channel,
      template: input.template ?? "custom",
      body: input.body ?? "",
      audience: JSON.stringify(audience),
      scheduleAt: input.scheduleAt ?? null,
      status: "draft",
      stats: JSON.stringify({ audience: 0, queued: 0, skippedOptOut: 0, skippedNoContact: 0 }),
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return row;
}

export async function listCampaigns(userId: string): Promise<Campaign[]> {
  return db
    .select()
    .from(campaigns)
    .where(eq(campaigns.createdBy, userId))
    .orderBy(desc(campaigns.createdAt), sql`rowid DESC`);
}

export async function getCampaign(userId: string, campaignId: string): Promise<Campaign> {
  return getCampaignOr404(userId, campaignId);
}

/** draft | scheduled → cancelled. Sent (done) campaigns are immutable. */
export async function cancelCampaign(userId: string, campaignId: string): Promise<Campaign> {
  const campaign = await getCampaignOr404(userId, campaignId);
  if (campaign.status !== "draft" && campaign.status !== "scheduled") {
    throw new EngagementError(`Cannot cancel a ${campaign.status} campaign`);
  }
  const [row] = await db
    .update(campaigns)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.createdBy, userId)))
    .returning();
  return row;
}

export interface SendCampaignResult extends CampaignStats {
  id: string;
  status: Campaign["status"];
}

/**
 * Resolve the audience and queue one `custom` message per recipient through
 * the Task 9 outbox. Idempotency key `camp:<campaignId>:<customerId>` means a
 * double send replays instead of duplicating deliveries. A future scheduleAt
 * becomes the outbox `availableAt` and leaves the campaign `scheduled`;
 * immediate sends finish `done`.
 */
export async function sendCampaign(
  userId: string,
  campaignId: string
): Promise<SendCampaignResult> {
  const campaign = await getCampaignOr404(userId, campaignId);
  if (campaign.status === "cancelled") {
    throw new EngagementError("Cannot send a cancelled campaign");
  }

  const audience = parseAudience(parseJson<unknown>(campaign.audience, {}));
  const resolution = await resolveAudience(userId, audience, campaign.channel);
  const storeName = (await readSettingString("store_name")) ?? "";

  const scheduledAt =
    campaign.scheduleAt && Number.isNaN(new Date(campaign.scheduleAt).getTime()) === false
      ? new Date(campaign.scheduleAt)
      : null;
  const availableAt = scheduledAt && scheduledAt.getTime() > Date.now() ? scheduledAt : null;

  const customerRows = resolution.customerIds.length
    ? await db
        .select({
          id: customers.id,
          name: customers.name,
          phone: customers.phone,
          email: customers.email,
        })
        .from(customers)
        .where(and(eq(customers.createdBy, userId), inArray(customers.id, resolution.customerIds)))
    : [];

  let queued = 0;
  let skippedOptOut = resolution.skippedOptOut;
  let skippedNoContact = resolution.skippedNoContact;

  for (const customer of customerRows) {
    // Consent double-check (resolveAudience already excluded opted-out rows).
    if (await isOptedOut(userId, customer.id, campaign.channel)) {
      skippedOptOut++;
      continue;
    }
    const recipient =
      campaign.channel === "email"
        ? (customer.email ?? "").trim()
        : (customer.phone ?? "").trim();
    if (!recipient) {
      skippedNoContact++;
      continue;
    }
    const variables = {
      body: renderTemplate(campaign.body ?? "", {
        customerName: customer.name ?? "",
        storeName,
      }),
      customerName: customer.name ?? "",
      storeName,
    };
    try {
      await queueMessage(userId, {
        channel: campaign.channel,
        recipient,
        customerId: customer.id,
        template: "custom",
        variables,
        aggregateType: "campaign",
        aggregateId: campaign.id,
        idempotencyKey: `camp:${campaign.id}:${customer.id}`,
        availableAt: availableAt ?? undefined,
      });
      queued++;
    } catch {
      skippedNoContact++;
    }
  }

  const stats: CampaignStats = {
    audience: resolution.matched,
    queued,
    skippedOptOut,
    skippedNoContact,
  };
  const status: Campaign["status"] = availableAt ? "scheduled" : "done";

  const [updated] = await db
    .update(campaigns)
    .set({ status, stats: JSON.stringify(stats), updatedAt: new Date() })
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.createdBy, userId)))
    .returning();

  return { id: campaign.id, status: updated?.status ?? status, ...stats };
}
