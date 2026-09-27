import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import {
  applySchema,
  countFor,
  seedCustomer,
  seedMedicine,
  seedUser,
  type SeededMedicine,
  type SeededUser,
} from "./helpers.js";
import { db } from "../src/db/index.js";
import {
  auditEvents,
  campaigns as campaignsTable,
  customers,
  invoiceItems,
  invoices,
  loyaltyLedger,
  medicines,
  messageDeliveries,
  offers as offersTable,
  outboxEvents,
  refillReminders,
  settings,
} from "../src/db/schema/index.js";
import engagementRoutes from "../src/routes/customerEngagement.js";
import invoiceRoutes from "../src/routes/invoices.js";
import settingsRoutes from "../src/routes/settings.js";
import {
  getCustomerInsights,
  loyaltyEarn,
  resolveAudience,
} from "../src/services/customerEngagement.js";
import { setPreference } from "../src/services/messaging.js";

let app: FastifyInstance;

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().split("T")[0];
const daysAhead = (n: number) => daysAgo(-n);
const today = () => new Date().toISOString().split("T")[0];

async function seedCustomerRow(
  ownerId: string,
  opts: { name?: string; phone?: string | null; email?: string | null; balance?: number } = {}
): Promise<string> {
  const id = `cus-${Math.random().toString(36).slice(2, 12)}`;
  await db.insert(customers).values({
    id,
    name: opts.name ?? "Test Customer",
    phone: opts.phone ?? null,
    email: opts.email ?? null,
    balance: opts.balance ?? 0,
    createdBy: ownerId,
  });
  return id;
}

async function seedInvoiceRow(
  ownerId: string,
  opts: {
    customerId?: string | null;
    date: string;
    grandTotal?: number;
    status?: "paid" | "unpaid" | "cancelled";
    hold?: boolean;
  }
): Promise<string> {
  const id = `inv-${Math.random().toString(36).slice(2, 12)}`;
  await db.insert(invoices).values({
    id,
    invoiceNo: `MB-T-${id.slice(4, 12)}`,
    customerId: opts.customerId ?? null,
    customerName: "Insights Customer",
    date: opts.date,
    grandTotal: opts.grandTotal ?? 100,
    amountPaid: opts.grandTotal ?? 100,
    status: opts.status ?? "paid",
    hold: opts.hold ?? false,
    createdBy: ownerId,
  });
  return id;
}

async function seedItemRow(
  invoiceId: string,
  opts: { medicineId: string; medicineName?: string; quantity?: number }
): Promise<void> {
  await db.insert(invoiceItems).values({
    invoiceId,
    medicineId: opts.medicineId,
    medicineName: opts.medicineName ?? "Item",
    quantity: opts.quantity ?? 1,
    rate: 10,
    amount: (opts.quantity ?? 1) * 10,
  });
}

async function seedMedicineRow(ownerId: string, name: string): Promise<string> {
  const id = `med-${Math.random().toString(36).slice(2, 12)}`;
  const now = new Date();
  await db.insert(medicines).values({
    id,
    name,
    createdBy: ownerId,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

async function upsertSetting(key: string, value: unknown): Promise<void> {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  await db
    .insert(settings)
    .values({ key, value: raw })
    .onConflictDoUpdate({ target: settings.key, set: { value: raw, updatedAt: new Date() } });
}

async function countLedger(ownerId: string, customerId?: string): Promise<number> {
  const conds = [eq(loyaltyLedger.createdBy, ownerId)];
  if (customerId) conds.push(eq(loyaltyLedger.customerId, customerId));
  const rows = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(loyaltyLedger)
    .where(and(...conds));
  return Number(rows[0]?.c ?? 0);
}

async function outboxCountForPrefix(prefix: string): Promise<number> {
  const rows = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(outboxEvents)
    .where(sql`${outboxEvents.idempotencyKey} LIKE ${prefix + "%"}`);
  return Number(rows[0]?.c ?? 0);
}

/** Minimal app: engagement + invoices + settings routes. */
beforeAll(async () => {
  applySchema();
  app = Fastify({ logger: false });
  await app.register(engagementRoutes, { prefix: "/api/customer-engagement" });
  await app.register(invoiceRoutes, { prefix: "/api/invoices" });
  await app.register(settingsRoutes, { prefix: "/api/settings" });
});

afterAll(async () => {
  await app?.close();
});

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------
describe("GET /api/customer-engagement/insights/:customerId", () => {
  it("computes median interval, LTV, invoice count and churn from purchase history", async () => {
    const ctx = seedUser();
    const customer = await seedCustomerRow(ctx.id, { name: "Regular", phone: "+91111111111" });
    await seedInvoiceRow(ctx.id, { customerId: customer, date: daysAgo(100), grandTotal: 100 });
    await seedInvoiceRow(ctx.id, { customerId: customer, date: daysAgo(70), grandTotal: 200 });
    await seedInvoiceRow(ctx.id, { customerId: customer, date: daysAgo(30), grandTotal: 300 });

    const res = await app.inject({
      method: "GET",
      url: `/api/customer-engagement/insights/${customer}`,
      headers: auth(ctx.token),
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;

    // Gaps 30 and 40 days → median 35.
    expect(data.avgIntervalDays).toBe(35);
    expect(data.ltv).toBeCloseTo(600, 2);
    expect(data.invoiceCount).toBe(3);
    expect(data.daysIdle).toBe(30);
    expect(data.lastPurchaseAt).toBe(daysAgo(30));
    // Idle 30d < 1.5 × 35 and < 90d → low churn.
    expect(data.churnRisk).toBe("low");
    expect(data.customer).toEqual({
      id: customer,
      name: "Regular",
      phone: "+91111111111",
      email: null,
    });
    expect(data.balance).toBe(0);
  });

  it("ranks frequent medicines by quantity and flags refill candidates", async () => {
    const ctx = seedUser();
    const customer = await seedCustomerRow(ctx.id, { name: "Chronic" });
    const medA = await seedMedicineRow(ctx.id, "Metformin 500");
    const medB = await seedMedicineRow(ctx.id, "Atorvastatin 10");

    const inv1 = await seedInvoiceRow(ctx.id, { customerId: customer, date: daysAgo(40) });
    await seedItemRow(inv1, { medicineId: medA, quantity: 5 });
    const inv2 = await seedInvoiceRow(ctx.id, { customerId: customer, date: daysAgo(20) });
    await seedItemRow(inv2, { medicineId: medA, quantity: 3 });
    await seedItemRow(inv2, { medicineId: medB, quantity: 10 });

    const insights = await getCustomerInsights(ctx.id, customer);

    // Top by quantity: Atorvastatin qty 10 beats Metformin qty 8.
    expect(insights.frequentMedicines[0].medicineId).toBe(medB);
    expect(insights.frequentMedicines[0].qty).toBe(10);
    // Single purchase → no repeat gap.
    expect(insights.frequentMedicines[0].avgGapDays).toBeNull();

    const metformin = insights.frequentMedicines.find((m) => m.medicineId === medA)!;
    expect(metformin.qty).toBe(8);
    expect(metformin.avgGapDays).toBe(20);
    expect(metformin.lastBought).toBe(daysAgo(20));
    // Due date = lastBought + 20d = today → within the 7-day horizon.
    expect(metformin.dueDate).toBe(today());
    expect(insights.refillCandidates.map((m) => m.medicineId)).toContain(medA);
    expect(insights.refillCandidates.map((m) => m.medicineId)).not.toContain(medB);
  });

  it("flags high churn when idle beyond 2× the purchase interval", async () => {
    const ctx = seedUser();
    const customer = await seedCustomerRow(ctx.id, { name: "Lapsed" });
    await seedInvoiceRow(ctx.id, { customerId: customer, date: daysAgo(100) });
    await seedInvoiceRow(ctx.id, { customerId: customer, date: daysAgo(70) });

    const insights = await getCustomerInsights(ctx.id, customer);
    expect(insights.avgIntervalDays).toBe(30);
    expect(insights.daysIdle).toBe(70); // > 2 × 30
    expect(insights.churnRisk).toBe("high");
  });

  it("flags medium churn for a single stale purchase (> 90 days idle)", async () => {
    const ctx = seedUser();
    const customer = await seedCustomerRow(ctx.id, { name: "One-timer" });
    await seedInvoiceRow(ctx.id, { customerId: customer, date: daysAgo(120) });

    const insights = await getCustomerInsights(ctx.id, customer);
    expect(insights.avgIntervalDays).toBeNull(); // no gaps yet
    expect(insights.churnRisk).toBe("medium");
  });

  it("returns RFM scores (same algorithm as the party report)", async () => {
    const ctx = seedUser();
    const customer = await seedCustomerRow(ctx.id, { name: "Scored" });
    await seedInvoiceRow(ctx.id, { customerId: customer, date: daysAgo(10), grandTotal: 500 });

    const res = await app.inject({
      method: "GET",
      url: `/api/customer-engagement/insights/${customer}`,
      headers: auth(ctx.token),
    });
    const rfm = res.json().data.rfm;
    expect(rfm.recencyDays).toBe(10);
    expect(rfm.frequency).toBe(1);
    expect(rfm.monetary).toBeCloseTo(500, 2);
    for (const key of ["rScore", "fScore", "mScore", "rfmScore"]) {
      expect(typeof rfm[key]).toBe("number");
      expect(rfm[key]).toBeGreaterThanOrEqual(key === "rfmScore" ? 3 : 1);
      expect(rfm[key]).toBeLessThanOrEqual(key === "rfmScore" ? 15 : 5);
    }
    // Only customer in the tenant pool → every dimension normalizes to 3.
    expect(rfm.rfmScore).toBe(9);
  });

  it("is safe for a customer with no invoices (churn unknown, empty lists)", async () => {
    const ctx = seedUser();
    const customer = await seedCustomerRow(ctx.id, { name: "Walk-in" });

    const res = await app.inject({
      method: "GET",
      url: `/api/customer-engagement/insights/${customer}`,
      headers: auth(ctx.token),
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.invoiceCount).toBe(0);
    expect(data.ltv).toBe(0);
    expect(data.avgIntervalDays).toBeNull();
    expect(data.daysIdle).toBeNull();
    expect(data.churnRisk).toBe("unknown");
    expect(data.frequentMedicines).toEqual([]);
    expect(data.refillCandidates).toEqual([]);
    expect(data.rfm.rfmScore).toBe(0);
    expect(data.rfm.recencyDays).toBeNull();
  });

  it("404s a customer that belongs to another tenant and requires auth", async () => {
    const other = seedUser();
    const foreign = await seedCustomerRow(other.id, { name: "Foreign" });

    const unauth = await app.inject({
      method: "GET",
      url: `/api/customer-engagement/insights/${foreign}`,
    });
    expect(unauth.statusCode).toBe(401);

    const mine = seedUser();
    const res = await app.inject({
      method: "GET",
      url: `/api/customer-engagement/insights/${foreign}`,
      headers: auth(mine.token),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toMatch(/not found/i);
  });

  it("ignores cancelled and held invoices", async () => {
    const ctx = seedUser();
    const customer = await seedCustomerRow(ctx.id, { name: "Picky" });
    await seedInvoiceRow(ctx.id, { customerId: customer, date: daysAgo(5), grandTotal: 100 });
    await seedInvoiceRow(ctx.id, { customerId: customer, date: daysAgo(4), grandTotal: 999, status: "cancelled" });
    await seedInvoiceRow(ctx.id, { customerId: customer, date: daysAgo(3), grandTotal: 888, hold: true });

    const insights = await getCustomerInsights(ctx.id, customer);
    expect(insights.invoiceCount).toBe(1);
    expect(insights.ltv).toBeCloseTo(100, 2);
    expect(insights.lastPurchaseAt).toBe(daysAgo(5));
  });
});

// ---------------------------------------------------------------------------
// Loyalty
// ---------------------------------------------------------------------------
describe("loyalty ledger", () => {
  it("earn is idempotent: the same key replays instead of duplicating", async () => {
    const ctx = seedUser();
    const customer = await seedCustomerRow(ctx.id, { name: "Loyal" });

    const first = await app.inject({
      method: "POST",
      url: "/api/customer-engagement/loyalty/earn",
      headers: auth(ctx.token),
      payload: { customerId: customer, points: 10, reason: "Bonus", idempotencyKey: "earn-1" },
    });
    expect(first.statusCode).toBe(201);
    const second = await app.inject({
      method: "POST",
      url: "/api/customer-engagement/loyalty/earn",
      headers: auth(ctx.token),
      payload: { customerId: customer, points: 10, reason: "Bonus", idempotencyKey: "earn-1" },
    });
    expect(second.statusCode).toBe(201);
    expect(second.json().data.id).toBe(first.json().data.id);

    expect(await countLedger(ctx.id, customer)).toBe(1);
    const balance = await app.inject({
      method: "GET",
      url: `/api/customer-engagement/loyalty?customerId=${customer}`,
      headers: auth(ctx.token),
    });
    expect(balance.json().data.balance).toBe(10);
  });

  it("redeem writes a negative entry and reduces the balance", async () => {
    const ctx = seedUser();
    const customer = await seedCustomerRow(ctx.id, { name: "Spender" });
    await loyaltyEarn(ctx.id, customer, { points: 100, reason: "Sale earn" });

    const res = await app.inject({
      method: "POST",
      url: "/api/customer-engagement/loyalty/redeem",
      headers: auth(ctx.token),
      payload: { customerId: customer, points: 30, reason: "Bill discount" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.points).toBe(-30);
    expect(res.json().data.type).toBe("redeem");

    const view = await app.inject({
      method: "GET",
      url: `/api/customer-engagement/loyalty?customerId=${customer}`,
      headers: auth(ctx.token),
    });
    expect(view.json().data.balance).toBe(70);
    // Recent first: the redeem sits above the earn.
    expect(view.json().data.entries[0].points).toBe(-30);
    expect(view.json().data.entries[1].points).toBe(100);
  });

  it("redeem above the balance is refused with 400 insufficient balance", async () => {
    const ctx = seedUser();
    const customer = await seedCustomerRow(ctx.id, { name: "Broke" });
    await loyaltyEarn(ctx.id, customer, { points: 5 });

    const res = await app.inject({
      method: "POST",
      url: "/api/customer-engagement/loyalty/redeem",
      headers: auth(ctx.token),
      payload: { customerId: customer, points: 6 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/insufficient balance/);
    expect(await countLedger(ctx.id, customer)).toBe(1); // earn only
  });

  it("validates points > 0 on earn and redeem", async () => {
    const ctx = seedUser();
    const customer = await seedCustomerRow(ctx.id, { name: "Zero" });
    const earn = await app.inject({
      method: "POST",
      url: "/api/customer-engagement/loyalty/earn",
      headers: auth(ctx.token),
      payload: { customerId: customer, points: 0 },
    });
    expect(earn.statusCode).toBe(400);
    const redeem = await app.inject({
      method: "POST",
      url: "/api/customer-engagement/loyalty/redeem",
      headers: auth(ctx.token),
      payload: { customerId: customer, points: -5 },
    });
    expect(redeem.statusCode).toBe(400);
  });

  it("is tenant isolated: another tenant cannot read or spend a balance", async () => {
    const owner = seedUser();
    const customer = await seedCustomerRow(owner.id, { name: "Owned" });
    await loyaltyEarn(owner.id, customer, { points: 50 });

    const intruder = seedUser();
    const read = await app.inject({
      method: "GET",
      url: `/api/customer-engagement/loyalty?customerId=${customer}`,
      headers: auth(intruder.token),
    });
    expect(read.statusCode).toBe(404);

    const spend = await app.inject({
      method: "POST",
      url: "/api/customer-engagement/loyalty/redeem",
      headers: auth(intruder.token),
      payload: { customerId: customer, points: 1 },
    });
    expect(spend.statusCode).toBe(404);
    // Owner's balance untouched.
    expect(await countLedger(owner.id, customer)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Offers
// ---------------------------------------------------------------------------
describe("offers", () => {
  async function createOfferVia(
    ctx: SeededUser,
    payload: Record<string, unknown>
  ): Promise<{ statusCode: number; body: any }> {
    const res = await app.inject({
      method: "POST",
      url: "/api/customer-engagement/offers",
      headers: auth(ctx.token),
      payload,
    });
    return { statusCode: res.statusCode, body: res.json() };
  }

  it("creates, lists, deactivates (never hard-deletes)", async () => {
    const ctx = seedUser();
    const created = await createOfferVia(ctx, {
      name: "Festive ₹50 off",
      type: "fixed",
      value: 50,
      startsOn: daysAgo(1),
      endsOn: daysAhead(30),
    });
    expect(created.statusCode).toBe(201);
    const offerId = created.body.data.id;

    const list = await app.inject({
      method: "GET",
      url: "/api/customer-engagement/offers",
      headers: auth(ctx.token),
    });
    expect(list.json().data).toHaveLength(1);

    const activeOnly = await app.inject({
      method: "GET",
      url: "/api/customer-engagement/offers?activeOnly=1",
      headers: auth(ctx.token),
    });
    expect(activeOnly.json().data).toHaveLength(1);

    const off = await app.inject({
      method: "PUT",
      url: `/api/customer-engagement/offers/${offerId}`,
      headers: auth(ctx.token),
      payload: { isActive: false },
    });
    expect(off.statusCode).toBe(200);
    expect(off.json().data.isActive).toBe(false);

    const after = await app.inject({
      method: "GET",
      url: "/api/customer-engagement/offers?activeOnly=1",
      headers: auth(ctx.token),
    });
    expect(after.json().data).toHaveLength(0);
    // Row still exists — deactivation, not deletion.
    expect(countFor("offers", ctx.id)).toBe(1);
  });

  it("rejects an inverted date window", async () => {
    const ctx = seedUser();
    const res = await createOfferVia(ctx, {
      name: "Backwards",
      type: "fixed",
      value: 10,
      startsOn: daysAgo(5),
      endsOn: daysAgo(10),
    });
    expect(res.statusCode).toBe(400);
  });

  it("evaluates a fixed offer and clamps the discount to the subtotal", async () => {
    const ctx = seedUser();
    const { body } = await createOfferVia(ctx, {
      name: "Big fixed",
      type: "fixed",
      value: 500,
      startsOn: daysAgo(1),
      endsOn: daysAhead(10),
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/customer-engagement/offers/${body.data.id}/evaluate`,
      headers: auth(ctx.token),
      payload: { subtotal: 100 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ applies: true, discount: 100, reason: null });
  });

  it("evaluates a percent offer as subtotal × value / 100", async () => {
    const ctx = seedUser();
    const { body } = await createOfferVia(ctx, {
      name: "10 percent",
      type: "percent",
      value: 10,
      startsOn: daysAgo(1),
      endsOn: daysAhead(10),
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/customer-engagement/offers/${body.data.id}/evaluate`,
      headers: auth(ctx.token),
      payload: { subtotal: 200 },
    });
    expect(res.json().data).toEqual({ applies: true, discount: 20, reason: null });
  });

  it("treats the date window edges as inclusive", async () => {
    const ctx = seedUser();
    const { body: startsToday } = await createOfferVia(ctx, {
      name: "Starts today",
      type: "fixed",
      value: 10,
      startsOn: today(),
      endsOn: daysAhead(5),
    });
    const onStart = await app.inject({
      method: "POST",
      url: `/api/customer-engagement/offers/${startsToday.data.id}/evaluate`,
      headers: auth(ctx.token),
      payload: { subtotal: 100 },
    });
    expect(onStart.json().data.applies).toBe(true);

    const { body: endsToday } = await createOfferVia(ctx, {
      name: "Ends today",
      type: "fixed",
      value: 10,
      startsOn: daysAgo(5),
      endsOn: today(),
    });
    const onEnd = await app.inject({
      method: "POST",
      url: `/api/customer-engagement/offers/${endsToday.data.id}/evaluate`,
      headers: auth(ctx.token),
      payload: { subtotal: 100 },
    });
    expect(onEnd.json().data.applies).toBe(true);

    const { body: future } = await createOfferVia(ctx, {
      name: "Future",
      type: "fixed",
      value: 10,
      startsOn: daysAhead(1),
      endsOn: daysAhead(5),
    });
    const beforeStart = await app.inject({
      method: "POST",
      url: `/api/customer-engagement/offers/${future.data.id}/evaluate`,
      headers: auth(ctx.token),
      payload: { subtotal: 100 },
    });
    expect(beforeStart.json().data.applies).toBe(false);
    expect(beforeStart.json().data.discount).toBe(0);
    expect(beforeStart.json().data.reason).toMatch(/starts on/);

    const { body: past } = await createOfferVia(ctx, {
      name: "Past",
      type: "fixed",
      value: 10,
      startsOn: daysAgo(10),
      endsOn: daysAgo(1),
    });
    const afterEnd = await app.inject({
      method: "POST",
      url: `/api/customer-engagement/offers/${past.data.id}/evaluate`,
      headers: auth(ctx.token),
      payload: { subtotal: 100 },
    });
    expect(afterEnd.json().data.applies).toBe(false);
    expect(afterEnd.json().data.reason).toMatch(/ended on/);
  });

  it("gates on min_amount and on medicine-specific offers", async () => {
    const ctx = seedUser();
    const med = await seedMedicineRow(ctx.id, "Offer Med");
    const otherMed = await seedMedicineRow(ctx.id, "Other Med");

    const { body: minOffer } = await createOfferVia(ctx, {
      name: "Min 500",
      type: "fixed",
      value: 50,
      minAmount: 500,
      startsOn: daysAgo(1),
      endsOn: daysAhead(5),
    });
    const tooSmall = await app.inject({
      method: "POST",
      url: `/api/customer-engagement/offers/${minOffer.data.id}/evaluate`,
      headers: auth(ctx.token),
      payload: { subtotal: 100 },
    });
    expect(tooSmall.json().data.applies).toBe(false);
    expect(tooSmall.json().data.reason).toMatch(/Minimum bill/);

    const { body: medOffer } = await createOfferVia(ctx, {
      name: "Only Metformin",
      type: "percent",
      value: 5,
      medicineId: med,
      startsOn: daysAgo(1),
      endsOn: daysAhead(5),
    });
    const wrongMed = await app.inject({
      method: "POST",
      url: `/api/customer-engagement/offers/${medOffer.data.id}/evaluate`,
      headers: auth(ctx.token),
      payload: { subtotal: 100, medicineIds: [otherMed] },
    });
    expect(wrongMed.json().data.applies).toBe(false);
    expect(wrongMed.json().data.reason).toMatch(/specific medicines/);

    const rightMed = await app.inject({
      method: "POST",
      url: `/api/customer-engagement/offers/${medOffer.data.id}/evaluate`,
      headers: auth(ctx.token),
      payload: { subtotal: 200, medicineIds: [med] },
    });
    expect(rightMed.json().data).toEqual({ applies: true, discount: 10, reason: null });
  });

  it("refuses inactive offers and 404s foreign ones", async () => {
    const ctx = seedUser();
    const { body } = await createOfferVia(ctx, {
      name: "Deactivated",
      type: "fixed",
      value: 10,
      startsOn: daysAgo(1),
      endsOn: daysAhead(5),
    });
    await app.inject({
      method: "PUT",
      url: `/api/customer-engagement/offers/${body.data.id}`,
      headers: auth(ctx.token),
      payload: { isActive: false },
    });
    const inactive = await app.inject({
      method: "POST",
      url: `/api/customer-engagement/offers/${body.data.id}/evaluate`,
      headers: auth(ctx.token),
      payload: { subtotal: 100 },
    });
    expect(inactive.json().data.applies).toBe(false);
    expect(inactive.json().data.reason).toMatch(/not active/);

    const other = seedUser();
    const foreignEval = await app.inject({
      method: "POST",
      url: `/api/customer-engagement/offers/${body.data.id}/evaluate`,
      headers: auth(other.token),
      payload: { subtotal: 100 },
    });
    expect(foreignEval.statusCode).toBe(404);

    const foreignPut = await app.inject({
      method: "PUT",
      url: `/api/customer-engagement/offers/${body.data.id}`,
      headers: auth(other.token),
      payload: { value: 999 },
    });
    expect(foreignPut.statusCode).toBe(404);
    // Owner's offer untouched by the foreign PUT (still deactivated, value 10).
    const rows = await db.select().from(offersTable).where(eq(offersTable.id, body.data.id));
    expect(rows[0].value).toBe(10);
    expect(rows[0].isActive).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Invoice integration (offer + loyalty folded into the bill)
// ---------------------------------------------------------------------------
describe("invoice creation with offers and loyalty", () => {
  const PAYLOAD_ITEM = (med: SeededMedicine) => ({
    medicineId: med.medicineId,
    medicineName: "Test Med",
    quantity: 1,
    unit: "Strip",
    mrp: 100,
    rate: 95.24,
    amount: 95.24,
    gstRate: "5",
    gstAmount: 4.76,
    cgst: 2.38,
    sgst: 2.38,
  });

  function baseBody(med: SeededMedicine, extra: Record<string, unknown> = {}) {
    return {
      date: "2099-01-01",
      subtotal: 95.24,
      totalGst: 4.76,
      cgst: 2.38,
      sgst: 2.38,
      grandTotal: 95.24,
      amountPaid: 100,
      paymentMode: "cash",
      status: "paid",
      discount: 0,
      discountAmount: 0,
      items: [PAYLOAD_ITEM(med)],
      ...extra,
    };
  }

  it("folds an applicable offer into the discount and records the audit event", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { quantity: 10 });
    const cust = seedCustomer(ctx.id);
    const offerRes = await app.inject({
      method: "POST",
      url: "/api/customer-engagement/offers",
      headers: auth(ctx.token),
      payload: {
        name: "₹10 off",
        type: "fixed",
        value: 10,
        startsOn: daysAgo(1),
        endsOn: daysAhead(5),
      },
    });
    const offerId = offerRes.json().data.id;

    const res = await app.inject({
      method: "POST",
      url: "/api/invoices",
      headers: auth(ctx.token),
      payload: baseBody(med, { customerId: cust.id, offerId }),
    });
    expect(res.statusCode).toBe(201);
    const inv = res.json().data;
    // Server subtotal is the GST-exclusive line sum (90.70) + GST (4.54) = 95.24.
    expect(inv.discountAmount).toBeCloseTo(10, 2);
    expect(inv.grandTotal).toBeCloseTo(85.24, 2);

    const audits = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.actorId, ctx.id), eq(auditEvents.action, "invoice.offer_applied")));
    expect(audits).toHaveLength(1);
    expect(audits[0].entityId).toBe(inv.id);
    expect(JSON.parse(audits[0].metadata!)).toMatchObject({ offerId, discount: 10 });
  });

  it("rejects the sale with 400 when the offer does not apply", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { quantity: 10 });
    const offerRes = await app.inject({
      method: "POST",
      url: "/api/customer-engagement/offers",
      headers: auth(ctx.token),
      payload: {
        name: "Inactive",
        type: "fixed",
        value: 10,
        startsOn: daysAgo(1),
        endsOn: daysAhead(5),
        isActive: false,
      },
    });
    const offerId = offerRes.json().data.id;

    const res = await app.inject({
      method: "POST",
      url: "/api/invoices",
      headers: auth(ctx.token),
      payload: baseBody(med, { offerId }),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/not active/);
    // No partial writes.
    expect(countFor("invoices", ctx.id)).toBe(0);
  });

  it("400s a foreign offer id", async () => {
    const owner = seedUser();
    const offerRes = await app.inject({
      method: "POST",
      url: "/api/customer-engagement/offers",
      headers: auth(owner.token),
      payload: {
        name: "Not yours",
        type: "fixed",
        value: 5,
        startsOn: daysAgo(1),
        endsOn: daysAhead(5),
      },
    });
    const foreignOfferId = offerRes.json().data.id;

    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { quantity: 10 });
    const res = await app.inject({
      method: "POST",
      url: "/api/invoices",
      headers: auth(ctx.token),
      payload: baseBody(med, { offerId: foreignOfferId }),
    });
    expect(res.statusCode).toBe(404);
    expect(countFor("invoices", ctx.id)).toBe(0);
  });

  it("folds loyaltyRedeemPoints into the discount and writes a negative ledger row", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { quantity: 10 });
    const cust = seedCustomer(ctx.id);
    await loyaltyEarn(ctx.id, cust.id, { points: 50, reason: "Seed" });

    const res = await app.inject({
      method: "POST",
      url: "/api/invoices",
      headers: auth(ctx.token),
      payload: baseBody(med, { customerId: cust.id, loyaltyRedeemPoints: 10 }),
    });
    expect(res.statusCode).toBe(201);
    const inv = res.json().data;
    expect(inv.discountAmount).toBeCloseTo(10, 2);
    expect(inv.grandTotal).toBeCloseTo(85.24, 2);

    const entries = await db
      .select()
      .from(loyaltyLedger)
      .where(and(eq(loyaltyLedger.createdBy, ctx.id), eq(loyaltyLedger.customerId, cust.id)))
      .orderBy(sql`rowid DESC`);
    expect(entries).toHaveLength(2);
    expect(entries[0].points).toBe(-10);
    expect(entries[0].type).toBe("redeem");
    expect(entries[0].idempotencyKey).toBe(`redeem:${inv.id}`);
    expect(entries[0].invoiceId).toBe(inv.id);
  });

  it("refuses redemption beyond the balance before anything is written", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { quantity: 10 });
    const cust = seedCustomer(ctx.id);
    await loyaltyEarn(ctx.id, cust.id, { points: 5 });

    const res = await app.inject({
      method: "POST",
      url: "/api/invoices",
      headers: auth(ctx.token),
      payload: baseBody(med, { customerId: cust.id, loyaltyRedeemPoints: 50 }),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/insufficient balance/);
    expect(countFor("invoices", ctx.id)).toBe(0);
    expect(await countLedger(ctx.id, cust.id)).toBe(1); // the seed earn only
  });

  it("requires a customer on the bill for loyalty redemption", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { quantity: 10 });
    const res = await app.inject({
      method: "POST",
      url: "/api/invoices",
      headers: auth(ctx.token),
      payload: baseBody(med, { loyaltyRedeemPoints: 5 }),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/requires a customer/);
  });

  it("earns points after commit when loyalty is enabled (idempotent per invoice)", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { quantity: 10 });
    const cust = seedCustomer(ctx.id);
    await upsertSetting("loyalty", {
      enabled: true,
      pointsPer100Rupee: 2,
      rupeePerPoint: 1,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/invoices",
      headers: auth(ctx.token),
      payload: baseBody(med, { customerId: cust.id }),
    });
    expect(res.statusCode).toBe(201);
    const inv = res.json().data;

    const entries = await db
      .select()
      .from(loyaltyLedger)
      .where(and(eq(loyaltyLedger.createdBy, ctx.id), eq(loyaltyLedger.customerId, cust.id)));
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe("earn");
    expect(entries[0].idempotencyKey).toBe(`sale:${inv.id}`);
    // round(95.24 / 100 × 2) = 2
    expect(entries[0].points).toBe(2);

    // A retry with the same idempotency key replays instead of double-crediting.
    const replay = await loyaltyEarn(ctx.id, cust.id, {
      points: 2,
      idempotencyKey: `sale:${inv.id}`,
    });
    expect(replay.id).toBe(entries[0].id);
    expect(await countLedger(ctx.id, cust.id)).toBe(1);
  });

  it("leaves legacy totals unchanged when no offer or loyalty points are sent", async () => {
    // Ensure loyalty is off so a plain sale never touches the ledger.
    await upsertSetting("loyalty", { enabled: false, pointsPer100Rupee: 1, rupeePerPoint: 1 });
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { quantity: 10 });
    const cust = seedCustomer(ctx.id);

    const res = await app.inject({
      method: "POST",
      url: "/api/invoices",
      headers: auth(ctx.token),
      payload: baseBody(med, { customerId: cust.id }),
    });
    expect(res.statusCode).toBe(201);
    const inv = res.json().data;
    expect(inv.discountAmount).toBe(0);
    expect(inv.grandTotal).toBeCloseTo(95.24, 2);

    expect(await countLedger(ctx.id, cust.id)).toBe(0);
    const offerAudits = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.actorId, ctx.id), eq(auditEvents.action, "invoice.offer_applied")));
    expect(offerAudits).toHaveLength(0);
  });

  it("loyalty stays disabled by default: no ledger rows for a normal sale", async () => {
    await db.delete(settings).where(eq(settings.key, "loyalty"));
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { quantity: 10 });
    const cust = seedCustomer(ctx.id);

    const res = await app.inject({
      method: "POST",
      url: "/api/invoices",
      headers: auth(ctx.token),
      payload: baseBody(med, { customerId: cust.id }),
    });
    expect(res.statusCode).toBe(201);
    expect(await countLedger(ctx.id, cust.id)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Campaign audiences
// ---------------------------------------------------------------------------
describe("resolveAudience", () => {
  it("type all returns every customer reachable on the channel", async () => {
    const ctx = seedUser();
    const a = await seedCustomerRow(ctx.id, { phone: "+91111111111" });
    const b = await seedCustomerRow(ctx.id, { phone: "+91222222222" });
    const noPhone = await seedCustomerRow(ctx.id, { phone: null });

    const res = await resolveAudience(ctx.id, { type: "all" }, "whatsapp");
    expect(res.matched).toBe(3);
    // Reachability gate: the phone-less customer is skipped, not messaged.
    expect(res.customerIds.sort()).toEqual([a, b].sort());
    expect(res.skippedNoContact).toBe(1);
    expect(res.customerIds).not.toContain(noPhone);
  });

  it("type rfm keeps customers at or above the minimum score", async () => {
    const ctx = seedUser();
    const buyer = await seedCustomerRow(ctx.id, { phone: "+91111111111" });
    await seedCustomerRow(ctx.id, { phone: "+91222222222" }); // no invoices → score 0
    await seedInvoiceRow(ctx.id, { customerId: buyer, date: daysAgo(5) });

    const res = await resolveAudience(ctx.id, { type: "rfm", minScore: 5 }, "whatsapp");
    expect(res.customerIds).toEqual([buyer]);

    const everyone = await resolveAudience(ctx.id, { type: "rfm", minScore: 0 }, "whatsapp");
    expect(everyone.customerIds).toHaveLength(2);
  });

  it("type medicine keeps only customers who bought that medicine", async () => {
    const ctx = seedUser();
    const med = await seedMedicineRow(ctx.id, "Campaign Med");
    const buyer = await seedCustomerRow(ctx.id, { phone: "+91111111111" });
    const other = await seedCustomerRow(ctx.id, { phone: "+91222222222" });
    const inv = await seedInvoiceRow(ctx.id, { customerId: buyer, date: daysAgo(10) });
    await seedItemRow(inv, { medicineId: med });
    await seedInvoiceRow(ctx.id, { customerId: other, date: daysAgo(10) });

    const res = await resolveAudience(
      ctx.id,
      { type: "medicine", medicineId: med, withinDays: 30 },
      "whatsapp"
    );
    expect(res.customerIds).toEqual([buyer]);

    const stale = await resolveAudience(
      ctx.id,
      { type: "medicine", medicineId: med, withinDays: 5 },
      "whatsapp"
    );
    expect(stale.customerIds).toEqual([]);
  });

  it("type balance filters on the outstanding balance", async () => {
    const ctx = seedUser();
    const debtor = await seedCustomerRow(ctx.id, { phone: "+91111111111", balance: 500 });
    await seedCustomerRow(ctx.id, { phone: "+91222222222", balance: 0 });

    const res = await resolveAudience(ctx.id, { type: "balance", minAmount: 100 }, "whatsapp");
    expect(res.customerIds).toEqual([debtor]);
  });

  it("type refill keeps pending reminders due within the window", async () => {
    const ctx = seedUser();
    const due = await seedCustomerRow(ctx.id, { phone: "+91111111111" });
    const later = await seedCustomerRow(ctx.id, { phone: "+91222222222" });
    const now = new Date();
    await db.insert(refillReminders).values({
      customerId: due,
      customerName: "Due",
      medicineName: "Amlodipine 5",
      lastPurchaseDate: daysAgo(30),
      reminderDate: daysAhead(3),
      status: "pending",
      createdBy: ctx.id,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(refillReminders).values({
      customerId: later,
      customerName: "Later",
      medicineName: "Telmisartan 40",
      lastPurchaseDate: daysAgo(30),
      reminderDate: daysAhead(30),
      status: "pending",
      createdBy: ctx.id,
      createdAt: now,
      updatedAt: now,
    });

    const res = await resolveAudience(ctx.id, { type: "refill", withinDays: 7 }, "whatsapp");
    expect(res.customerIds).toEqual([due]);
  });

  it("excludes opted-out customers and counts them, per channel", async () => {
    const ctx = seedUser();
    const ok = await seedCustomerRow(ctx.id, { phone: "+91111111111" });
    const opted = await seedCustomerRow(ctx.id, { phone: "+91222222222" });
    await setPreference(ctx.id, opted, "whatsapp", true);

    const wa = await resolveAudience(ctx.id, { type: "all" }, "whatsapp");
    expect(wa.customerIds).toEqual([ok]);
    expect(wa.skippedOptOut).toBe(1);

    // The opt-out is channel-specific: sms still reaches the customer.
    const sms = await resolveAudience(ctx.id, { type: "all" }, "sms");
    expect(sms.customerIds.sort()).toEqual([ok, opted].sort());
    expect(sms.skippedOptOut).toBe(0);
  });

  it("requires a reachable contact: phone for whatsapp/sms, email for email", async () => {
    const ctx = seedUser();
    await seedCustomerRow(ctx.id, { phone: "+91111111111", email: null });
    await seedCustomerRow(ctx.id, { phone: null, email: "a@example.com" });
    await seedCustomerRow(ctx.id, { phone: null, email: null });

    const wa = await resolveAudience(ctx.id, { type: "all" }, "whatsapp");
    expect(wa.customerIds).toHaveLength(1);
    expect(wa.skippedNoContact).toBe(2);

    const mail = await resolveAudience(ctx.id, { type: "all" }, "email");
    expect(mail.customerIds).toHaveLength(1);
    expect(mail.skippedNoContact).toBe(2);
  });

  it("rejects unknown audience types", async () => {
    const ctx = seedUser();
    await expect(resolveAudience(ctx.id, { type: "astrology" }, "whatsapp")).rejects.toThrow(
      /unknown audience type/i
    );
  });
});

// ---------------------------------------------------------------------------
// Campaign routes + send
// ---------------------------------------------------------------------------
describe("campaigns", () => {
  async function createCampaignVia(
    ctx: SeededUser,
    payload: Record<string, unknown>
  ): Promise<{ statusCode: number; body: any }> {
    const res = await app.inject({
      method: "POST",
      url: "/api/customer-engagement/campaigns",
      headers: auth(ctx.token),
      payload,
    });
    return { statusCode: res.statusCode, body: res.json() };
  }

  it("creates a draft campaign and lists it tenant-scoped", async () => {
    const ctx = seedUser();
    const created = await createCampaignVia(ctx, {
      name: "Monsoon health tips",
      channel: "whatsapp",
      body: "Hi {customerName} from {storeName}!",
      audience: { type: "all" },
    });
    expect(created.statusCode).toBe(201);
    expect(created.body.data.status).toBe("draft");

    const other = seedUser();
    const foreignList = await app.inject({
      method: "GET",
      url: "/api/customer-engagement/campaigns",
      headers: auth(other.token),
    });
    expect(foreignList.json().data).toHaveLength(0);

    const mine = await app.inject({
      method: "GET",
      url: "/api/customer-engagement/campaigns",
      headers: auth(ctx.token),
    });
    expect(mine.json().data).toHaveLength(1);
  });

  it("immediate send queues one message per recipient and is idempotent", async () => {
    const ctx = seedUser();
    await upsertSetting("store_name", "Test Pharmacy");
    const a = await seedCustomerRow(ctx.id, { name: "Anita", phone: "+91111111111" });
    const b = await seedCustomerRow(ctx.id, { name: "Babu", phone: "+91222222222" });

    const created = await createCampaignVia(ctx, {
      name: "Refill day",
      channel: "whatsapp",
      body: "Hello {customerName}, refill at {storeName}.",
      audience: { type: "all" },
    });
    const campaignId = created.body.data.id;

    const send = await app.inject({
      method: "POST",
      url: `/api/customer-engagement/campaigns/${campaignId}/send`,
      headers: auth(ctx.token),
    });
    expect(send.statusCode).toBe(200);
    expect(send.json().data).toMatchObject({
      audience: 2,
      queued: 2,
      skippedOptOut: 0,
      skippedNoContact: 0,
      status: "done",
    });

    expect(await outboxCountForPrefix(`camp:${campaignId}:`)).toBe(2);
    const deliveries = await db
      .select()
      .from(messageDeliveries)
      .where(eq(messageDeliveries.aggregateId, campaignId));
    expect(deliveries).toHaveLength(2);
    expect(deliveries.every((d) => d.template === "custom")).toBe(true);
    expect(deliveries.every((d) => d.status === "queued")).toBe(true);

    // Body tokens rendered per recipient.
    const bodies = deliveries.map((d) => JSON.parse(d.variables!).body);
    expect(bodies.sort()).toEqual([
      "Hello Anita, refill at Test Pharmacy.",
      "Hello Babu, refill at Test Pharmacy.",
    ].sort());

    // Double send → same outbox/delivery counts (idempotency camp:<id>:<cus>).
    const again = await app.inject({
      method: "POST",
      url: `/api/customer-engagement/campaigns/${campaignId}/send`,
      headers: auth(ctx.token),
    });
    expect(again.statusCode).toBe(200);
    expect(again.json().data.queued).toBe(2);
    expect(await outboxCountForPrefix(`camp:${campaignId}:`)).toBe(2);
    const afterDeliveries = await db
      .select()
      .from(messageDeliveries)
      .where(eq(messageDeliveries.aggregateId, campaignId));
    expect(afterDeliveries).toHaveLength(2);
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
  });

  it("counts opt-outs and missing contacts in the send stats", async () => {
    const ctx = seedUser();
    await seedCustomerRow(ctx.id, { name: "Ok", phone: "+91111111111" });
    const opted = await seedCustomerRow(ctx.id, { name: "Opted", phone: "+91222222222" });
    await seedCustomerRow(ctx.id, { name: "NoPhone", phone: null });
    await setPreference(ctx.id, opted, "whatsapp", true);

    const created = await createCampaignVia(ctx, {
      name: "Consent check",
      channel: "whatsapp",
      body: "Hi {customerName}",
      audience: { type: "all" },
    });
    const campaignId = created.body.data.id;

    const send = await app.inject({
      method: "POST",
      url: `/api/customer-engagement/campaigns/${campaignId}/send`,
      headers: auth(ctx.token),
    });
    expect(send.json().data).toMatchObject({
      audience: 3,
      queued: 1,
      skippedOptOut: 1,
      skippedNoContact: 1,
      status: "done",
    });
    expect(await outboxCountForPrefix(`camp:${campaignId}:`)).toBe(1);
  });

  it("a scheduled send leaves outbox events in the future and marks the campaign scheduled", async () => {
    const ctx = seedUser();
    await seedCustomerRow(ctx.id, { name: "Future Fan", phone: "+91111111111" });
    const scheduleAt = new Date(Date.now() + 3600_000).toISOString();

    const created = await createCampaignVia(ctx, {
      name: "Scheduled blast",
      channel: "whatsapp",
      body: "Scheduled hi {customerName}",
      audience: { type: "all" },
      scheduleAt,
    });
    const campaignId = created.body.data.id;

    const send = await app.inject({
      method: "POST",
      url: `/api/customer-engagement/campaigns/${campaignId}/send`,
      headers: auth(ctx.token),
    });
    expect(send.statusCode).toBe(200);
    expect(send.json().data.status).toBe("scheduled");

    const events = await db
      .select()
      .from(outboxEvents)
      .where(sql`${outboxEvents.idempotencyKey} LIKE ${`camp:${campaignId}:%`}`);
    expect(events).toHaveLength(1);
    expect(events[0].availableAt.getTime()).toBeGreaterThan(Date.now());
    expect(events[0].status).toBe("pending");
  });

  it("cancel works only for draft/scheduled campaigns", async () => {
    const ctx = seedUser();
    const created = await createCampaignVia(ctx, {
      name: "Cancellable",
      channel: "sms",
      body: "Hi",
      audience: { type: "all" },
    });
    const campaignId = created.body.data.id;

    const cancel = await app.inject({
      method: "POST",
      url: `/api/customer-engagement/campaigns/${campaignId}/cancel`,
      headers: auth(ctx.token),
    });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json().data.status).toBe("cancelled");

    // A cancelled campaign can neither be sent nor cancelled again.
    const send = await app.inject({
      method: "POST",
      url: `/api/customer-engagement/campaigns/${campaignId}/send`,
      headers: auth(ctx.token),
    });
    expect(send.statusCode).toBe(400);

    // Done campaigns are immutable.
    const other = await createCampaignVia(ctx, {
      name: "Sent one",
      channel: "whatsapp",
      body: "Hi",
      audience: { type: "all" },
    });
    await app.inject({
      method: "POST",
      url: `/api/customer-engagement/campaigns/${other.body.data.id}/send`,
      headers: auth(ctx.token),
    });
    const cancelDone = await app.inject({
      method: "POST",
      url: `/api/customer-engagement/campaigns/${other.body.data.id}/cancel`,
      headers: auth(ctx.token),
    });
    expect(cancelDone.statusCode).toBe(400);
    expect(cancelDone.json().error).toMatch(/done/);
  });

  it("404s a campaign belonging to another tenant", async () => {
    const owner = seedUser();
    const created = await createCampaignVia(owner, {
      name: "Private",
      channel: "whatsapp",
      body: "Hi",
      audience: { type: "all" },
    });
    const campaignId = created.body.data.id;

    const intruder = seedUser();
    for (const [method, url] of [
      ["GET", `/api/customer-engagement/campaigns/${campaignId}`],
      ["POST", `/api/customer-engagement/campaigns/${campaignId}/send`],
      ["POST", `/api/customer-engagement/campaigns/${campaignId}/cancel`],
    ] as const) {
      const res = await app.inject({ method, url, headers: auth(intruder.token) });
      expect(res.statusCode).toBe(404);
    }
  });

  it("persists send stats on the campaign row", async () => {
    const ctx = seedUser();
    await seedCustomerRow(ctx.id, { name: "Only", phone: "+91111111111" });
    const created = await createCampaignVia(ctx, {
      name: "Stats carrier",
      channel: "whatsapp",
      body: "Hi {customerName}",
      audience: { type: "all" },
    });
    const campaignId = created.body.data.id;

    await app.inject({
      method: "POST",
      url: `/api/customer-engagement/campaigns/${campaignId}/send`,
      headers: auth(ctx.token),
    });

    const rows = await db
      .select()
      .from(campaignsTable)
      .where(eq(campaignsTable.id, campaignId));
    expect(rows[0].status).toBe("done");
    expect(JSON.parse(rows[0].stats!)).toEqual({
      audience: 1,
      queued: 1,
      skippedOptOut: 0,
      skippedNoContact: 0,
    });
  });
});
