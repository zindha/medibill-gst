import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import { applySchema, seedUser, type SeededUser } from "./helpers.js";
import { db } from "../src/db/index.js";
import {
  communicationPreferences,
  customers,
  generateId,
  invoices,
  messageDeliveries,
  outboxEvents,
  refillReminders,
  settings,
} from "../src/db/schema/index.js";
import messageRoutes from "../src/routes/messages.js";
import invoiceRoutes from "../src/routes/invoices.js";
import refillRoutes from "../src/routes/refills.js";
import {
  __setProviderForTest,
  isOptedOut,
  processMessageEvent,
  queueMessage,
  renderTemplate,
  runOutboxWorkerOnce,
  sendRefillDue,
  setPreference,
} from "../src/services/messaging.js";
import type { MessageProvider } from "../src/providers/messaging.js";

let app: FastifyInstance;
let ctx: SeededUser;

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

const PROVIDER_ENV = [
  "WHATSAPP_API_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "SMS_WEBHOOK_URL",
  "SMS_API_KEY",
  "SMS_SENDER",
  "EMAIL_WEBHOOK_URL",
];

/** Fake provider that records every send and resolves with providerId "w1". */
function fakeProvider(overrides: Partial<MessageProvider> = {}) {
  const send = vi.fn(async () => ({ providerId: "w1" }));
  const provider: MessageProvider = { send: (overrides.send as any) ?? send };
  return { provider, send };
}

async function getDelivery(id: string) {
  const rows = await db.select().from(messageDeliveries).where(eq(messageDeliveries.id, id)).limit(1);
  return rows[0];
}

async function getEvent(id: string) {
  const rows = await db.select().from(outboxEvents).where(eq(outboxEvents.id, id)).limit(1);
  return rows[0];
}

async function countEventsForKey(key: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(outboxEvents)
    .where(eq(outboxEvents.idempotencyKey, key));
  return rows[0]?.count ?? 0;
}

async function countEventsMentioning(token: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(outboxEvents)
    .where(sql`${outboxEvents.payload} LIKE ${`%${token}%`}`);
  return rows[0]?.count ?? 0;
}

async function seedCustomerRow(
  ownerId: string,
  opts: { name?: string; phone?: string | null; email?: string | null } = {}
) {
  const id = generateId();
  await db.insert(customers).values({
    id,
    name: opts.name ?? "Test Customer",
    phone: opts.phone ?? null,
    email: opts.email ?? null,
    createdBy: ownerId,
  });
  return id;
}

async function seedInvoiceRow(
  ownerId: string,
  opts: { customerPhone?: string | null; customerId?: string | null; grandTotal?: number } = {}
) {
  const id = generateId();
  const now = new Date();
  await db.insert(invoices).values({
    id,
    invoiceNo: `MB-T-${id.slice(0, 6)}`,
    customerId: opts.customerId ?? null,
    customerName: "Share Customer",
    customerPhone: opts.customerPhone ?? null,
    date: now.toISOString().split("T")[0],
    grandTotal: opts.grandTotal ?? 250,
    amountPaid: opts.grandTotal ?? 250,
    status: "paid",
    createdBy: ownerId,
  });
  return id;
}

async function seedRefillRow(
  ownerId: string,
  opts: { customerPhone?: string | null; customerId?: string | null; reminderDate?: string; medicineName?: string } = {}
) {
  const id = generateId();
  const today = opts.reminderDate ?? new Date().toISOString().split("T")[0];
  await db.insert(refillReminders).values({
    id,
    customerId: opts.customerId ?? null,
    customerName: "Refill Patient",
    customerPhone: opts.customerPhone ?? null,
    medicineName: opts.medicineName ?? "Metformin 500",
    lastPurchaseDate: "2026-08-01",
    reminderDate: today,
    status: "pending",
    createdBy: ownerId,
  });
  return id;
}

async function upsertSetting(key: string, value: unknown) {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  await db
    .insert(settings)
    .values({ key, value: raw })
    .onConflictDoUpdate({ target: settings.key, set: { value: raw, updatedAt: new Date() } });
}

beforeAll(async () => {
  // NEVER let provider env leak into tests — the unconfigured path must be used.
  for (const key of PROVIDER_ENV) delete process.env[key];
  applySchema();
  ctx = seedUser();
  app = Fastify({ logger: false });
  await app.register(messageRoutes, { prefix: "/api/messages" });
  await app.register(invoiceRoutes, { prefix: "/api/invoices" });
  await app.register(refillRoutes, { prefix: "/api/refills" });
});

afterEach(() => {
  __setProviderForTest(null);
});

afterAll(async () => {
  await app?.close();
});

// ---------------------------------------------------------------------------
// queueMessage
// ---------------------------------------------------------------------------
describe("queueMessage", () => {
  it("creates a delivery row plus one pending message.send outbox event", async () => {
    const result = await queueMessage(ctx.id, {
      channel: "whatsapp",
      recipient: "+91111111111",
      template: "invoice_share",
      variables: { customerName: "Asha", invoiceNo: "MB-1", amount: "10.00" },
      aggregateType: "invoice",
      aggregateId: "inv-q1",
    });

    expect(result.status).toBe("queued");
    expect(result.outboxEventId).toBeTruthy();

    const delivery = await getDelivery(result.deliveryId);
    expect(delivery).toBeTruthy();
    expect(delivery!.recipient).toBe("+91111111111");
    expect(delivery!.status).toBe("queued");
    expect(delivery!.outboxEventId).toBe(result.outboxEventId);

    const event = await getEvent(result.outboxEventId!);
    expect(event!.type).toBe("message.send");
    expect(event!.status).toBe("pending");
    expect(JSON.parse(event!.payload).deliveryId).toBe(result.deliveryId);
  });

  it("is idempotent: same explicit idempotencyKey yields ONE outbox event and ONE delivery", async () => {
    const key = `dup-test-${generateId()}`;
    const first = await queueMessage(ctx.id, {
      channel: "whatsapp",
      recipient: "+91222222222",
      template: "payment_due",
      variables: { customerName: "Ravi", amount: "99.00" },
      aggregateType: "invoice",
      aggregateId: "inv-dup",
      idempotencyKey: key,
    });
    const second = await queueMessage(ctx.id, {
      channel: "whatsapp",
      recipient: "+91222222222",
      template: "payment_due",
      variables: { customerName: "Ravi", amount: "99.00" },
      aggregateType: "invoice",
      aggregateId: "inv-dup",
      idempotencyKey: key,
    });

    // Second call replays the first result instead of inserting a duplicate.
    expect(second.deliveryId).toBe(first.deliveryId);
    expect(second.outboxEventId).toBe(first.outboxEventId);
    expect(await countEventsForKey(key)).toBe(1);
    const event = await getEvent(first.outboxEventId!);
    expect(event!.status).toBe("pending");
    const rows = await db
      .select()
      .from(messageDeliveries)
      .where(eq(messageDeliveries.aggregateId, "inv-dup"));
    expect(rows).toHaveLength(1);
  });

  it("rejects when no recipient can be resolved", async () => {
    await expect(
      queueMessage(ctx.id, { channel: "whatsapp", template: "invoice_share" })
    ).rejects.toThrow(/recipient/i);
  });

  it("resolves the recipient from the customer phone when only customerId is given", async () => {
    const customerId = await seedCustomerRow(ctx.id, { phone: "+91333333333", name: "Meena" });
    const result = await queueMessage(ctx.id, {
      channel: "whatsapp",
      customerId,
      template: "refill_reminder",
      variables: { medicineName: "Amlodipine" },
    });
    const delivery = await getDelivery(result.deliveryId);
    expect(delivery!.recipient).toBe("+91333333333");
    expect(JSON.parse(delivery!.variables).customerName).toBe("Meena");
  });
});

// ---------------------------------------------------------------------------
// Consent / opt-out
// ---------------------------------------------------------------------------
describe("opt-out consent", () => {
  it("records an opted_out delivery with NO outbox event and never sends", async () => {
    const customerId = await seedCustomerRow(ctx.id, { phone: "+91444444444" });
    await setPreference(ctx.id, customerId, "whatsapp", true);
    expect(await isOptedOut(ctx.id, customerId, "whatsapp")).toBe(true);

    const result = await queueMessage(ctx.id, {
      channel: "whatsapp",
      customerId,
      template: "refill_reminder",
      variables: { medicineName: "Rosuvastatin" },
      aggregateType: "refill",
      aggregateId: "refill-optout",
    });

    expect(result.status).toBe("opted_out");
    expect(result.outboxEventId).toBeNull();
    const delivery = await getDelivery(result.deliveryId);
    expect(delivery!.status).toBe("opted_out");
    expect(delivery!.error).toMatch(/opted out/i);
    expect(await countEventsMentioning(result.deliveryId)).toBe(0);

    // Nothing to process — the worker must not touch it.
    await runOutboxWorkerOnce();
    expect((await getDelivery(result.deliveryId))!.status).toBe("opted_out");
  });

  it("setPreference upserts instead of duplicating rows", async () => {
    const customerId = await seedCustomerRow(ctx.id, { phone: "+91555555555" });
    await setPreference(ctx.id, customerId, "sms", true);
    await setPreference(ctx.id, customerId, "sms", false);
    await setPreference(ctx.id, customerId, "sms", true);

    const rows = await db
      .select()
      .from(communicationPreferences)
      .where(
        and(
          eq(communicationPreferences.createdBy, ctx.id),
          eq(communicationPreferences.customerId, customerId),
          eq(communicationPreferences.channel, "sms")
        )
      );
    expect(rows).toHaveLength(1);
    expect(rows[0].optedOut).toBe(true);
    expect(await isOptedOut(ctx.id, customerId, "sms")).toBe(true);
  });

  it("consent is tenant scoped", async () => {
    const other = seedUser();
    const customerId = await seedCustomerRow(ctx.id, { phone: "+91666666666" });
    await setPreference(ctx.id, customerId, "email", true);
    expect(await isOptedOut(other.id, customerId, "email")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// processMessageEvent
// ---------------------------------------------------------------------------
describe("processMessageEvent", () => {
  it("sends through a fake provider: delivery sent, providerId stored, outbox done", async () => {
    const { provider, send } = fakeProvider();
    __setProviderForTest(provider);

    const result = await queueMessage(ctx.id, {
      channel: "whatsapp",
      recipient: "+91777777777",
      template: "invoice_share",
      variables: { customerName: "Kiran", invoiceNo: "MB-2", amount: "50.00", invoiceUrl: "http://x" },
      aggregateType: "invoice",
      aggregateId: "inv-sent",
    });

    const processed = await processMessageEvent(result.outboxEventId!);
    expect(processed.outcome).toBe("sent");

    const delivery = await getDelivery(result.deliveryId);
    expect(delivery!.status).toBe("sent");
    expect(delivery!.providerId).toBe("w1");
    expect(delivery!.error).toBeNull();

    const event = await getEvent(result.outboxEventId!);
    expect(event!.status).toBe("done");

    expect(send).toHaveBeenCalledTimes(1);
    const arg = send.mock.calls[0][0] as any;
    expect(arg.recipient).toBe("+91777777777");
    expect(arg.body).toContain("Kiran");
  });

  it("NotConfigured provider → delivery failed with a clear message, outbox done (permanent)", async () => {
    // No test provider, no env: getProvider throws NotConfiguredError.
    const result = await queueMessage(ctx.id, {
      channel: "sms",
      recipient: "+91888888888",
      template: "invoice_share",
      variables: { customerName: "Neha", invoiceNo: "MB-3", amount: "10.00" },
      aggregateType: "invoice",
      aggregateId: "inv-notcfg",
    });

    const processed = await processMessageEvent(result.outboxEventId!);
    expect(processed.outcome).toBe("not_configured");

    const delivery = await getDelivery(result.deliveryId);
    expect(delivery!.status).toBe("failed");
    expect(delivery!.error).toMatch(/SMS provider not configured/i);
    expect(delivery!.error).toContain("SMS_WEBHOOK_URL");

    const event = await getEvent(result.outboxEventId!);
    expect(event!.status).toBe("done");
  });

  it("transient error → backoff retry: attempts++, delivery queued, NEW pending event with availableAt > now, old event not done", async () => {
    const { provider } = fakeProvider({
      send: vi.fn(async () => {
        throw new Error("rate limited");
      }) as any,
    });
    __setProviderForTest(provider);

    const result = await queueMessage(ctx.id, {
      channel: "whatsapp",
      recipient: "+91999999999",
      template: "payment_due",
      variables: { customerName: "Omkar", amount: "15.00" },
      aggregateType: "invoice",
      aggregateId: "inv-transient",
    });
    const firstEventId = result.outboxEventId!;

    const processed = await processMessageEvent(firstEventId);
    expect(processed.outcome).toBe("retry_scheduled");

    const delivery = await getDelivery(result.deliveryId);
    expect(delivery!.status).toBe("queued");
    expect(delivery!.attempts).toBe(1);
    expect(delivery!.error).toMatch(/rate limited/);

    // Old event is terminal (failed, NOT done) and a fresh one is scheduled.
    const oldEvent = await getEvent(firstEventId);
    expect(oldEvent!.status).toBe("failed");
    expect(oldEvent!.status).not.toBe("done");

    const retryRows = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.idempotencyKey, `msg-retry:${result.deliveryId}:1`));
    expect(retryRows).toHaveLength(1);
    expect(retryRows[0].status).toBe("pending");
    expect(retryRows[0].availableAt.getTime()).toBeGreaterThan(Date.now());
    expect(retryRows[0].attempts).toBe(0);
    expect(delivery!.outboxEventId).toBe(retryRows[0].id);
  });

  it("gives up permanently after more than 5 attempts", async () => {
    const { provider } = fakeProvider({
      send: vi.fn(async () => {
        throw new Error("boom");
      }) as any,
    });
    __setProviderForTest(provider);

    const result = await queueMessage(ctx.id, {
      channel: "whatsapp",
      recipient: "+91000000000",
      template: "payment_due",
      variables: { customerName: "Zed", amount: "1.00" },
      aggregateType: "invoice",
      aggregateId: "inv-exhaust",
    });
    // Simulate 5 prior attempts (attempt 6 = the limit).
    await db
      .update(messageDeliveries)
      .set({ attempts: 5 })
      .where(eq(messageDeliveries.id, result.deliveryId));

    const processed = await processMessageEvent(result.outboxEventId!);
    expect(processed.outcome).toBe("permanently_failed");

    const delivery = await getDelivery(result.deliveryId);
    expect(delivery!.status).toBe("failed");
    expect(delivery!.attempts).toBe(6);
    expect(delivery!.error).toMatch(/Giving up after 6 attempts/);
    expect((await getEvent(result.outboxEventId!))!.status).toBe("done");
    // No further retry event was created.
    expect(await countEventsForKey(`msg-retry:${result.deliveryId}:6`)).toBe(0);
  });

  it("skips events that are no longer pending (safe to run repeatedly)", async () => {
    const result = await queueMessage(ctx.id, {
      channel: "whatsapp",
      recipient: "+91123456789",
      template: "payment_due",
      variables: { customerName: "Twice", amount: "5.00" },
      aggregateType: "invoice",
      aggregateId: "inv-skip",
    });
    await db.update(outboxEvents).set({ status: "done" }).where(eq(outboxEvents.id, result.outboxEventId!));
    const processed = await processMessageEvent(result.outboxEventId!);
    expect(processed.outcome).toBe("skipped");
  });
});

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
describe("template rendering", () => {
  it("missing variables render as empty strings and never throw", () => {
    const body = renderTemplate("Hi {customerName}, total {amount} at {storeName}.", {});
    expect(body).toBe("Hi , total  at .");
    expect(() => renderTemplate("{unknown}/{alsoUnknown}", {})).not.toThrow();
  });

  it("replaces known tokens", () => {
    expect(renderTemplate("Invoice {invoiceNo} — ₹{amount}", { invoiceNo: "MB-9", amount: "42.00" })).toBe(
      "Invoice MB-9 — ₹42.00"
    );
  });

  it("storeName defaults from the store_name setting when queueing", async () => {
    await upsertSetting("store_name", "City Care Pharmacy");
    const { provider, send } = fakeProvider();
    __setProviderForTest(provider);

    const result = await queueMessage(ctx.id, {
      channel: "whatsapp",
      recipient: "+91111100000",
      template: "payment_due",
      variables: { customerName: "Tara" }, // amount + storeName intentionally missing
      aggregateType: "invoice",
      aggregateId: "inv-store",
    });
    await processMessageEvent(result.outboxEventId!);

    const body = (send.mock.calls[0][0] as any).body as string;
    expect(body).toContain("City Care Pharmacy");
    expect(body).toContain("Tara");
    // Missing {amount} renders as empty — no crash, no "undefined".
    expect(body).not.toContain("undefined");
  });

  it("custom template uses variables.body", async () => {
    const { provider, send } = fakeProvider();
    __setProviderForTest(provider);
    const result = await queueMessage(ctx.id, {
      channel: "whatsapp",
      recipient: "+91111100001",
      template: "custom",
      variables: { body: "Ping {customerName}!", customerName: "Sam" },
    });
    await processMessageEvent(result.outboxEventId!);
    expect((send.mock.calls[0][0] as any).body).toBe("Ping Sam!");
  });
});

// ---------------------------------------------------------------------------
// Invoice sharing
// ---------------------------------------------------------------------------
describe("POST /api/invoices/:id/share", () => {
  it("404s an invoice belonging to another tenant", async () => {
    const other = seedUser();
    const foreignId = await seedInvoiceRow(other.id, { customerPhone: "+91000000001" });

    const res = await app.inject({
      method: "POST",
      url: `/api/invoices/${foreignId}/share`,
      headers: auth(ctx.token),
      payload: { channels: ["whatsapp"] },
    });
    expect(res.statusCode).toBe(404);
  });

  it("queues one delivery per selected channel — even when the provider is not configured", async () => {
    const invoiceId = await seedInvoiceRow(ctx.id, { customerPhone: "+91000000002", grandTotal: 199 });

    const res = await app.inject({
      method: "POST",
      url: `/api/invoices/${invoiceId}/share`,
      headers: auth(ctx.token),
      payload: { channels: ["whatsapp", "sms"] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.deliveries).toHaveLength(2);
    expect(body.deliveries.every((d: any) => d.status === "queued")).toBe(true);
    expect(body.deliveries.every((d: any) => d.aggregateType === "invoice")).toBe(true);
    expect(body.deliveries.map((d: any) => d.aggregateId)).toEqual([invoiceId, invoiceId]);

    const rows = await db
      .select()
      .from(messageDeliveries)
      .where(eq(messageDeliveries.aggregateId, invoiceId));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.template === "invoice_share")).toBe(true);
    expect(JSON.parse(rows[0].variables).invoiceUrl).toContain(`/dashboard/invoices/${invoiceId}`);
  });

  it("processing an unconfigured channel fails cleanly with no network access", async () => {
    const invoiceId = await seedInvoiceRow(ctx.id, { customerPhone: "+91000000003" });
    const res = await app.inject({
      method: "POST",
      url: `/api/invoices/${invoiceId}/share`,
      headers: auth(ctx.token),
      payload: { channels: ["sms"] },
    });
    expect(res.statusCode).toBe(200);
    const deliveryId = res.json().data.deliveries[0].id;
    const delivery = await getDelivery(deliveryId);
    const processed = await processMessageEvent(delivery!.outboxEventId!);

    expect(processed.outcome).toBe("not_configured");
    const after = await getDelivery(deliveryId);
    expect(after!.status).toBe("failed");
    expect(after!.error).toMatch(/not configured/i);
    expect((await getEvent(delivery!.outboxEventId!))!.status).toBe("done");
  });

  it("400s when no destination exists for the selected channels", async () => {
    const invoiceId = await seedInvoiceRow(ctx.id, { customerPhone: null });
    const res = await app.inject({
      method: "POST",
      url: `/api/invoices/${invoiceId}/share`,
      headers: auth(ctx.token),
      payload: { channels: ["whatsapp"] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("validates the channels array", async () => {
    const invoiceId = await seedInvoiceRow(ctx.id, { customerPhone: "+91000000004" });
    const res = await app.inject({
      method: "POST",
      url: `/api/invoices/${invoiceId}/share`,
      headers: auth(ctx.token),
      payload: { channels: ["telegram"] },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Refill automation
// ---------------------------------------------------------------------------
describe("refill automation", () => {
  it("send-due queues 1 of 3 rows: skips the phone-less and the opted-out", async () => {
    const noPhone = await seedRefillRow(ctx.id, { customerPhone: null, medicineName: "No Phone Med" });
    const customerId = await seedCustomerRow(ctx.id, { phone: "+91000000005" });
    const optedOut = await seedRefillRow(ctx.id, { customerId, medicineName: "Opted Out Med" });
    await setPreference(ctx.id, customerId, "whatsapp", true);
    const ok = await seedRefillRow(ctx.id, { customerPhone: "+91000000006", medicineName: "OK Med" });

    const res = await app.inject({
      method: "POST",
      url: "/api/refills/send-due",
      headers: auth(ctx.token),
      payload: { channel: "whatsapp" },
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.queued).toBe(1);
    expect(data.skipped_nophone).toBe(1);
    expect(data.skipped_optout).toBe(1);

    const okRows = await db.select().from(messageDeliveries).where(eq(messageDeliveries.aggregateId, ok));
    expect(okRows).toHaveLength(1);
    expect(okRows[0].template).toBe("refill_reminder");
    expect(okRows[0].status).toBe("queued");
    expect(okRows[0].recipient).toBe("+91000000006");

    // Skipped rows never produced deliveries.
    const noPhoneDeliveries = await db
      .select()
      .from(messageDeliveries)
      .where(eq(messageDeliveries.aggregateId, noPhone));
    expect(noPhoneDeliveries).toHaveLength(0);
    const optOutDeliveries = await db
      .select()
      .from(messageDeliveries)
      .where(eq(messageDeliveries.aggregateId, optedOut));
    expect(optOutDeliveries).toHaveLength(0);
  });

  it("reconciles the refill to sent only after the delivery actually sends", async () => {
    const refillId = await seedRefillRow(ctx.id, { customerPhone: "+91000000007", medicineName: "Reconcile Med" });

    const queued = await queueMessage(ctx.id, {
      channel: "whatsapp",
      recipient: "+91000000007",
      template: "refill_reminder",
      variables: { customerName: "Refill Patient", medicineName: "Reconcile Med" },
      aggregateType: "refill",
      aggregateId: refillId,
      idempotencyKey: `refill:${refillId}`,
    });

    // Still pending until the provider confirms the send.
    let row = (await db.select().from(refillReminders).where(eq(refillReminders.id, refillId)))[0];
    expect(row.status).toBe("pending");

    const { provider } = fakeProvider();
    __setProviderForTest(provider);
    await processMessageEvent(queued.outboxEventId!);

    row = (await db.select().from(refillReminders).where(eq(refillReminders.id, refillId)))[0];
    expect(row.status).toBe("sent");
    expect(row.sentAt).toBeTruthy();
  });

  it("POST /api/refills/:id/send queues one delivery without marking the reminder sent", async () => {
    const refillId = await seedRefillRow(ctx.id, { customerPhone: "+91000000008" });

    const res = await app.inject({
      method: "POST",
      url: `/api/refills/${refillId}/send`,
      headers: auth(ctx.token),
      payload: { channel: "whatsapp" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.status).toBe("queued");

    const row = (await db.select().from(refillReminders).where(eq(refillReminders.id, refillId)))[0];
    expect(row.status).toBe("pending");
  });

  it("POST /api/refills/:id/send 400s when the reminder has no phone", async () => {
    const refillId = await seedRefillRow(ctx.id, { customerPhone: null });
    const res = await app.inject({
      method: "POST",
      url: `/api/refills/${refillId}/send`,
      headers: auth(ctx.token),
      payload: { channel: "whatsapp" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("sendRefillDue is idempotent per reminder row (one outbox event, one delivery)", async () => {
    const refillId = await seedRefillRow(ctx.id, { customerPhone: "+91000000009" });
    const first = await sendRefillDue(ctx.id, "whatsapp");
    expect(first.queued).toBeGreaterThanOrEqual(1);
    const again = await sendRefillDue(ctx.id, "whatsapp");
    expect(again.queued).toBe(0);
    expect(again.alreadyQueued).toBeGreaterThanOrEqual(1);
    expect(await countEventsForKey(`refill:${refillId}`)).toBe(1);
    const rows = await db.select().from(messageDeliveries).where(eq(messageDeliveries.aggregateId, refillId));
    expect(rows.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Routes: preferences, providers, history, retry
// ---------------------------------------------------------------------------
describe("GET /api/messages/providers", () => {
  it("returns booleans only — false in the test env", async () => {
    const res = await app.inject({ method: "GET", url: "/api/messages/providers", headers: auth(ctx.token) });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data).toEqual({ whatsapp: false, sms: false, email: false });
    // Never leaks values.
    expect(JSON.stringify(data)).not.toMatch(/token|key|url/i);
  });

  it("requires authentication", async () => {
    const res = await app.inject({ method: "GET", url: "/api/messages/providers" });
    expect(res.statusCode).toBe(401);
  });
});

describe("communication preferences routes", () => {
  it("PUT + GET are tenant scoped and update in place", async () => {
    const customerId = await seedCustomerRow(ctx.id, { phone: "+91000000010", name: "Pref Customer" });
    const other = seedUser();

    const put = await app.inject({
      method: "PUT",
      url: "/api/messages/preferences",
      headers: auth(ctx.token),
      payload: { customerId, channel: "whatsapp", optedOut: true },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().data.optedOut).toBe(true);

    // Update in place — no duplicate row.
    await app.inject({
      method: "PUT",
      url: "/api/messages/preferences",
      headers: auth(ctx.token),
      payload: { customerId, channel: "whatsapp", optedOut: false },
    });

    const mine = await app.inject({ method: "GET", url: "/api/messages/preferences", headers: auth(ctx.token) });
    const mineRows = mine.json().data.filter((r: any) => r.customerId === customerId);
    expect(mineRows).toHaveLength(1);
    expect(mineRows[0].optedOut).toBe(false);
    expect(mineRows[0].customerName).toBe("Pref Customer");

    const theirs = await app.inject({ method: "GET", url: "/api/messages/preferences", headers: auth(other.token) });
    expect(theirs.json().data.filter((r: any) => r.customerId === customerId)).toHaveLength(0);
  });

  it("404s a preference for a customer the tenant does not own", async () => {
    const other = seedUser();
    const foreignCustomer = await seedCustomerRow(other.id, { phone: "+91000000011" });
    const res = await app.inject({
      method: "PUT",
      url: "/api/messages/preferences",
      headers: auth(ctx.token),
      payload: { customerId: foreignCustomer, channel: "sms", optedOut: true },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("GET /api/messages history", () => {
  it("is tenant scoped and filters by channel, status and aggregate", async () => {
    const other = seedUser();
    const invA = `hist-a-${generateId()}`;
    const invB = `hist-b-${generateId()}`;

    const mine1 = await queueMessage(ctx.id, {
      channel: "whatsapp",
      recipient: "+91000000020",
      template: "invoice_share",
      variables: { customerName: "H1", invoiceNo: "MB-H1", amount: "1.00" },
      aggregateType: "invoice",
      aggregateId: invA,
    });
    await queueMessage(ctx.id, {
      channel: "email",
      recipient: "h2@example.com",
      template: "invoice_share",
      variables: { customerName: "H2", invoiceNo: "MB-H2", amount: "2.00" },
      aggregateType: "invoice",
      aggregateId: invB,
    });
    await queueMessage(other.id, {
      channel: "whatsapp",
      recipient: "+91000000021",
      template: "invoice_share",
      variables: { customerName: "Other", invoiceNo: "MB-OTHER", amount: "3.00" },
      aggregateType: "invoice",
      aggregateId: "inv-other",
    });

    const all = await app.inject({ method: "GET", url: "/api/messages", headers: auth(ctx.token) });
    expect(all.statusCode).toBe(200);
    const allIds = all.json().data.map((r: any) => r.id);
    expect(allIds).toContain(mine1.deliveryId);
    // Tenant isolation: the other user's delivery never appears.
    expect(all.json().data.map((r: any) => r.recipient)).not.toContain("+91000000021");
    expect(all.json().total).toBeGreaterThanOrEqual(2);

    const byChannel = await app.inject({
      method: "GET",
      url: "/api/messages?channel=email",
      headers: auth(ctx.token),
    });
    expect(byChannel.json().data.every((r: any) => r.channel === "email")).toBe(true);

    const byStatus = await app.inject({
      method: "GET",
      url: "/api/messages?status=queued",
      headers: auth(ctx.token),
    });
    expect(byStatus.json().data.every((r: any) => r.status === "queued")).toBe(true);

    const byAggregate = await app.inject({
      method: "GET",
      url: `/api/messages?aggregateType=invoice&aggregateId=${invA}`,
      headers: auth(ctx.token),
    });
    expect(byAggregate.json().data).toHaveLength(1);
    expect(byAggregate.json().data[0].id).toBe(mine1.deliveryId);
  });

  it("requires authentication", async () => {
    const res = await app.inject({ method: "GET", url: "/api/messages" });
    expect(res.statusCode).toBe(401);
  });
});

describe("POST /api/messages/:id/retry", () => {
  it("re-queues a failed delivery with a fresh pending event", async () => {
    const result = await queueMessage(ctx.id, {
      channel: "sms",
      recipient: "+91000000030",
      template: "payment_due",
      variables: { customerName: "Retry", amount: "5.00" },
    });
    await processMessageEvent(result.outboxEventId!); // NotConfigured → failed

    const retry = await app.inject({
      method: "POST",
      url: `/api/messages/${result.deliveryId}/retry`,
      headers: auth(ctx.token),
    });
    expect(retry.statusCode).toBe(200);
    expect(retry.json().data.status).toBe("queued");
    expect(retry.json().data.outboxEventId).toBeTruthy();
    expect(retry.json().data.outboxEventId).not.toBe(result.outboxEventId);

    const event = await getEvent(retry.json().data.outboxEventId);
    expect(event!.status).toBe("pending");
  });

  it("refuses to retry an opted-out delivery (consent cannot be bypassed)", async () => {
    const customerId = await seedCustomerRow(ctx.id, { phone: "+91000000031" });
    await setPreference(ctx.id, customerId, "whatsapp", true);
    const result = await queueMessage(ctx.id, {
      channel: "whatsapp",
      customerId,
      template: "refill_reminder",
      variables: { medicineName: "Nope" },
    });

    const retry = await app.inject({
      method: "POST",
      url: `/api/messages/${result.deliveryId}/retry`,
      headers: auth(ctx.token),
    });
    expect(retry.statusCode).toBe(400);
    expect(retry.json().error).toMatch(/opted out/i);
  });

  it("400s when the delivery is not failed and 404s for other tenants", async () => {
    const queued = await queueMessage(ctx.id, {
      channel: "whatsapp",
      recipient: "+91000000032",
      template: "payment_due",
      variables: { customerName: "Q", amount: "1.00" },
    });
    const notFailed = await app.inject({
      method: "POST",
      url: `/api/messages/${queued.deliveryId}/retry`,
      headers: auth(ctx.token),
    });
    expect(notFailed.statusCode).toBe(400);

    const other = seedUser();
    const foreign = await app.inject({
      method: "POST",
      url: `/api/messages/${queued.deliveryId}/retry`,
      headers: auth(other.token),
    });
    expect(foreign.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------
describe("runOutboxWorkerOnce", () => {
  it("processes due message.send events globally and leaves future events alone", async () => {
    const { provider, send } = fakeProvider();
    __setProviderForTest(provider);

    const due = await queueMessage(ctx.id, {
      channel: "whatsapp",
      recipient: "+91000000040",
      template: "payment_due",
      variables: { customerName: "Due", amount: "9.00" },
      aggregateType: "invoice",
      aggregateId: "inv-worker-due",
    });
    const future = await queueMessage(ctx.id, {
      channel: "whatsapp",
      recipient: "+91000000041",
      template: "payment_due",
      variables: { customerName: "Future", amount: "9.00" },
      aggregateType: "invoice",
      aggregateId: "inv-worker-future",
    });
    await db
      .update(outboxEvents)
      .set({ availableAt: new Date(Date.now() + 60_000) })
      .where(eq(outboxEvents.id, future.outboxEventId!));

    await runOutboxWorkerOnce();

    expect((await getDelivery(due.deliveryId))!.status).toBe("sent");
    expect((await getEvent(due.outboxEventId!))!.status).toBe("done");
    expect((await getDelivery(future.deliveryId))!.status).toBe("queued");
    expect((await getEvent(future.outboxEventId!))!.status).toBe("pending");

    // Cleanup the future event so later runs are not affected.
    await db.update(outboxEvents).set({ status: "done" }).where(eq(outboxEvents.id, future.outboxEventId!));
    expect(send).toHaveBeenCalled();
  });
});
