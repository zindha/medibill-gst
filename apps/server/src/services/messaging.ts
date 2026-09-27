/**
 * Messaging service (Task 9) — templates, consent, queueing, outbox processing
 * and refill automation.
 *
 * Retry semantics (documented intentionally):
 * - Retry state lives on `message_deliveries.attempts` (the delivery is the
 *   source of truth for how many send attempts have happened).
 * - Each processing attempt claims the current outbox event (status
 *   processing, attempts+1). On success / permanent failure the event is acked
 *   `done`. On a transient failure the event is acked `failed` (terminal for
 *   that event) AND a NEW outbox event is enqueued with an exponential
 *   `availableAt` backoff (2^attempts minutes, capped at 60) and idempotency
 *   key `msg-retry:<deliveryId>:<attempt>` — so re-running the worker never
 *   double-sends and the ack API's `pending` semantics are not abused.
 * - After 5 attempts the delivery is failed permanently.
 * - After a successful send of a `refill` aggregate, the linked
 *   refillReminders row is reconciled to status `sent` + sentAt.
 */

import { and, desc, eq, isNull, lte, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  communicationPreferences,
  customers,
  messageDeliveries,
  outboxEvents,
  refillReminders,
  settings,
  type CommunicationPreference,
  type MessageChannel,
  type MessageDelivery,
} from "../db/schema/index.js";
import { enqueueOutbox } from "./outbox.js";
import {
  getProvider,
  NotConfiguredError,
  type MessageProvider,
} from "../providers/messaging.js";

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export const MESSAGE_TEMPLATES: Record<string, string> = {
  invoice_share:
    "Hi {customerName}! Invoice {invoiceNo} (₹{amount}) from {storeName}. {invoiceUrl} — thank you!",
  refill_reminder:
    "Hi {customerName}, it's time to refill {medicineName}. Reply or visit us for the next pack.",
  payment_due: "Hi {customerName}, ₹{amount} is due on your account at {storeName}.",
  custom: "",
};

export const TEMPLATE_IDS = Object.keys(MESSAGE_TEMPLATES);

/** Replace {tokens} with values; missing tokens render as "" (never throws). */
export function renderTemplate(body: string, variables: Record<string, unknown> = {}): string {
  return String(body ?? "").replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = variables[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

/** Read + JSON-parse a settings row (settings route stores JSON strings). */
async function readSettingObject(key: string): Promise<Record<string, any> | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Read a settings value as a string. The settings route stores plain strings
 * raw and objects JSON-encoded, and GET tries JSON.parse first — mirror
 * labels.ts: JSON-wrapped strings unwrap, non-JSON values pass through.
 */
export async function readSettingString(key: string): Promise<string | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
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

/** `store_name` setting (used as the default {storeName} template token). */
async function readStoreName(): Promise<string | null> {
  return readSettingString("store_name");
}

/**
 * Resolve the final message body: settings key `message_templates` (JSON
 * `{ "<template>": "<body override>" }`) merged over the built-in defaults;
 * `custom` takes `variables.body` verbatim.
 */
export async function resolveMessageBody(
  template: string,
  variables: Record<string, unknown> = {}
): Promise<string> {
  if (template === "custom") return renderTemplate(String(variables.body ?? ""), variables);
  const overrides = await readSettingObject("message_templates");
  const base = overrides?.[template] ?? MESSAGE_TEMPLATES[template] ?? "";
  return renderTemplate(base, variables);
}

// ---------------------------------------------------------------------------
// Test-only provider injection
// ---------------------------------------------------------------------------

let testProvider: MessageProvider | null = null;

/**
 * TEST-ONLY: swap the provider adapter (pass `null` to restore the real
 * env-driven resolution). Never call this from production code — it exists so
 * tests can assert send/success/failure paths without any network access.
 */
export function __setProviderForTest(provider: MessageProvider | null): void {
  testProvider = provider;
}

function resolveProvider(channel: MessageChannel): MessageProvider {
  if (testProvider) return testProvider;
  return getProvider(channel);
}

// ---------------------------------------------------------------------------
// Consent (communication_preferences)
// ---------------------------------------------------------------------------

export async function isOptedOut(
  userId: string,
  customerId: string | null,
  channel: MessageChannel
): Promise<boolean> {
  if (!customerId) return false;
  const rows = await db
    .select()
    .from(communicationPreferences)
    .where(
      and(
        eq(communicationPreferences.createdBy, userId),
        eq(communicationPreferences.customerId, customerId),
        eq(communicationPreferences.channel, channel)
      )
    )
    .limit(1);
  return !!rows[0]?.optedOut;
}

/**
 * Upsert a customer's channel consent. SQLite's UNIQUE treats NULLs as
 * distinct, so a NULL customer row is enforced select-then-update here.
 */
export async function setPreference(
  userId: string,
  customerId: string | null,
  channel: MessageChannel,
  optedOut: boolean
): Promise<CommunicationPreference> {
  const customerCond = customerId
    ? eq(communicationPreferences.customerId, customerId)
    : isNull(communicationPreferences.customerId);
  const [existing] = await db
    .select()
    .from(communicationPreferences)
    .where(
      and(
        eq(communicationPreferences.createdBy, userId),
        customerCond,
        eq(communicationPreferences.channel, channel)
      )
    )
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(communicationPreferences)
      .set({ optedOut, updatedAt: new Date() })
      .where(eq(communicationPreferences.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(communicationPreferences)
    .values({
      createdBy: userId,
      customerId,
      channel,
      optedOut,
      updatedAt: new Date(),
    })
    .returning();
  return created;
}

// ---------------------------------------------------------------------------
// Queueing
// ---------------------------------------------------------------------------

export interface QueueMessageInput {
  channel: MessageChannel;
  /** Phone / email address. Required unless `customerId` resolves one. */
  recipient?: string;
  customerId?: string;
  template: string;
  variables?: Record<string, unknown>;
  aggregateType?: string;
  aggregateId?: string;
  /** Optional pass-through for enqueueOutbox idempotency. */
  idempotencyKey?: string;
  /**
   * Optional delivery time for scheduled sends (Task 10 campaigns). Future
   * dates leave the outbox event pending until the worker's due check passes.
   */
  availableAt?: Date;
}

export interface QueueMessageResult {
  deliveryId: string;
  outboxEventId: string | null;
  status: MessageDelivery["status"];
  delivery: MessageDelivery;
}

async function customerById(
  userId: string,
  customerId: string
): Promise<{ id: string; name: string | null; phone: string | null } | null> {
  const rows = await db
    .select({ id: customers.id, name: customers.name, phone: customers.phone })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.createdBy, userId)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Queue one outbound message. Consent-gated: when the customer is opted out,
 * an `opted_out` delivery row is recorded and NO outbox event is enqueued.
 * `storeName` defaults from the `store_name` setting when not provided.
 */
export async function queueMessage(
  userId: string,
  input: QueueMessageInput
): Promise<QueueMessageResult> {
  // Idempotent replay: when the caller passes an explicit key that already
  // exists, return the original delivery instead of inserting a duplicate.
  if (input.idempotencyKey) {
    const [existingEvent] = await db
      .select()
      .from(outboxEvents)
      .where(
        and(eq(outboxEvents.createdBy, userId), eq(outboxEvents.idempotencyKey, input.idempotencyKey))
      )
      .limit(1);
    if (existingEvent) {
      let priorDeliveryId: string | undefined;
      try {
        priorDeliveryId = JSON.parse(existingEvent.payload ?? "{}").deliveryId;
      } catch {
        priorDeliveryId = undefined;
      }
      if (priorDeliveryId) {
        const [prior] = await db
          .select()
          .from(messageDeliveries)
          .where(eq(messageDeliveries.id, priorDeliveryId))
          .limit(1);
        if (prior) {
          return {
            deliveryId: prior.id,
            outboxEventId: existingEvent.id,
            status: prior.status,
            delivery: prior,
          };
        }
      }
    }
  }

  let recipient = (input.recipient ?? "").trim();
  let customerId: string | null = input.customerId ?? null;

  if (!recipient && customerId) {
    const customer = await customerById(userId, customerId);
    recipient = customer?.phone?.trim() ?? "";
    if (customer && !input.variables?.customerName) {
      input = { ...input, variables: { customerName: customer.name ?? "", ...input.variables } };
    }
  }
  if (!recipient) throw new Error("recipient is required (no phone/email to send to)");

  const optedOut = await isOptedOut(userId, customerId, input.channel);

  const variables: Record<string, unknown> = { ...(input.variables ?? {}) };
  if (!variables.storeName) {
    variables.storeName = (await readStoreName()) ?? "";
  }

  const now = new Date();
  const [delivery] = await db
    .insert(messageDeliveries)
    .values({
      createdBy: userId,
      channel: input.channel,
      recipient,
      template: input.template,
      variables: JSON.stringify(variables),
      aggregateType: input.aggregateType ?? null,
      aggregateId: input.aggregateId ?? null,
      status: optedOut ? "opted_out" : "queued",
      error: optedOut ? `Customer opted out of ${input.channel}` : null,
      attempts: 0,
      outboxEventId: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (optedOut) {
    return { deliveryId: delivery.id, outboxEventId: null, status: "opted_out", delivery };
  }

  const { id: outboxEventId } = await enqueueOutbox({
    createdBy: userId,
    type: "message.send",
    aggregateType: input.aggregateType ?? "message",
    aggregateId: input.aggregateId ?? delivery.id,
    payload: { deliveryId: delivery.id },
    availableAt: input.availableAt,
    idempotencyKey: input.idempotencyKey ?? `msg:${delivery.id}`,
  });

  const [updated] = await db
    .update(messageDeliveries)
    .set({ outboxEventId, updatedAt: new Date() })
    .where(eq(messageDeliveries.id, delivery.id))
    .returning();

  return { deliveryId: delivery.id, outboxEventId, status: "queued", delivery: updated };
}

// ---------------------------------------------------------------------------
// Outbox processing
// ---------------------------------------------------------------------------

async function ackOutbox(eventId: string, status: "done" | "failed" | "pending"): Promise<void> {
  // attempts was already incremented at claim time — ack only moves status.
  await db.update(outboxEvents).set({ status }).where(eq(outboxEvents.id, eventId));
}

async function markDeliverySent(delivery: MessageDelivery, providerId?: string): Promise<void> {
  await db
    .update(messageDeliveries)
    .set({ status: "sent", providerId: providerId ?? null, error: null, updatedAt: new Date() })
    .where(eq(messageDeliveries.id, delivery.id));

  // Reconcile the linked refill reminder only after a confirmed send.
  if (delivery.aggregateType === "refill" && delivery.aggregateId) {
    await db
      .update(refillReminders)
      .set({ status: "sent", sentAt: new Date() })
      .where(
        and(
          eq(refillReminders.id, delivery.aggregateId),
          eq(refillReminders.createdBy, delivery.createdBy),
          eq(refillReminders.status, "pending")
        )
      );
  }
}

async function markDeliveryFailed(delivery: MessageDelivery, message: string): Promise<void> {
  await db
    .update(messageDeliveries)
    .set({ status: "failed", error: message.slice(0, 500), updatedAt: new Date() })
    .where(eq(messageDeliveries.id, delivery.id));
}

export interface ProcessResult {
  outcome: "sent" | "not_configured" | "retry_scheduled" | "permanently_failed" | "skipped";
  deliveryId?: string;
}

const MAX_ATTEMPTS = 5;

/**
 * Process one `message.send` outbox event: claim → load delivery → render →
 * provider send → status update + ack. Safe to call repeatedly; skipped when
 * the event is no longer pending.
 */
export async function processMessageEvent(eventId: string): Promise<ProcessResult> {
  const [event] = await db
    .select()
    .from(outboxEvents)
    .where(eq(outboxEvents.id, eventId))
    .limit(1);
  if (!event) return { outcome: "skipped" };
  if (event.status !== "pending") return { outcome: "skipped" };

  // Claim — flip to processing and count the attempt on the event.
  await db
    .update(outboxEvents)
    .set({ status: "processing", attempts: (event.attempts ?? 0) + 1 })
    .where(eq(outboxEvents.id, eventId));

  let payload: { deliveryId?: string } = {};
  try {
    payload = JSON.parse(event.payload ?? "{}");
  } catch {
    payload = {};
  }
  const deliveryId = payload.deliveryId;
  if (!deliveryId) {
    await ackOutbox(eventId, "done");
    return { outcome: "skipped" };
  }

  const [delivery] = await db
    .select()
    .from(messageDeliveries)
    .where(eq(messageDeliveries.id, deliveryId))
    .limit(1);
  if (!delivery) {
    await ackOutbox(eventId, "done");
    return { outcome: "skipped", deliveryId };
  }
  if (delivery.status !== "queued" && delivery.status !== "sending") {
    await ackOutbox(eventId, "done");
    return { outcome: "skipped", deliveryId };
  }

  let variables: Record<string, unknown> = {};
  try {
    variables = JSON.parse(delivery.variables ?? "{}");
  } catch {
    variables = {};
  }
  const body = await resolveMessageBody(delivery.template, variables);

  // Provider resolution (env check happens before any network access).
  let provider: MessageProvider;
  try {
    provider = resolveProvider(delivery.channel);
  } catch (err) {
    if (err instanceof NotConfiguredError) {
      await markDeliveryFailed(delivery, err.message);
      await ackOutbox(eventId, "done");
      return { outcome: "not_configured", deliveryId };
    }
    throw err;
  }

  await db
    .update(messageDeliveries)
    .set({ status: "sending", updatedAt: new Date() })
    .where(eq(messageDeliveries.id, delivery.id));

  try {
    const result = await provider.send({
      channel: delivery.channel,
      recipient: delivery.recipient,
      body,
      variables,
    });
    await markDeliverySent(delivery, result?.providerId);
    await ackOutbox(eventId, "done");
    return { outcome: "sent", deliveryId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // NotConfigured is permanent — retrying cannot help until env changes.
    if (err instanceof NotConfiguredError) {
      await markDeliveryFailed(delivery, message);
      await ackOutbox(eventId, "done");
      return { outcome: "not_configured", deliveryId };
    }

    const attempts = (delivery.attempts ?? 0) + 1;
    if (attempts > MAX_ATTEMPTS) {
      await db
        .update(messageDeliveries)
        .set({
          status: "failed",
          attempts,
          error: `Giving up after ${attempts} attempts: ${message}`.slice(0, 500),
          updatedAt: new Date(),
        })
        .where(eq(messageDeliveries.id, delivery.id));
      await ackOutbox(eventId, "done");
      return { outcome: "permanently_failed", deliveryId };
    }

    // Transient — terminal-fail this event and schedule a fresh one with
    // exponential backoff: 2^attempts minutes, capped at 60 minutes.
    const backoffMinutes = Math.min(60, 2 ** attempts);
    const availableAt = new Date(Date.now() + backoffMinutes * 60_000);
    const [updated] = await db
      .update(messageDeliveries)
      .set({ status: "queued", attempts, error: message.slice(0, 500), updatedAt: new Date() })
      .where(eq(messageDeliveries.id, delivery.id))
      .returning();

    const { id: nextEventId } = await enqueueOutbox({
      createdBy: delivery.createdBy,
      type: "message.send",
      aggregateType: delivery.aggregateType ?? "message",
      aggregateId: delivery.aggregateId ?? delivery.id,
      payload: { deliveryId: delivery.id },
      availableAt,
      idempotencyKey: `msg-retry:${delivery.id}:${attempts}`,
    });
    await db
      .update(messageDeliveries)
      .set({ outboxEventId: nextEventId, updatedAt: new Date() })
      .where(eq(messageDeliveries.id, delivery.id));
    await ackOutbox(eventId, "failed");

    return { outcome: "retry_scheduled", deliveryId: updated?.id ?? deliveryId };
  }
}

/**
 * Run every due `message.send` outbox event once (limit 50). The worker is
 * system-level, NOT tenant-scoped — it intentionally does not use the tenant
 * `claimDueEvents` helper. Safe to run repeatedly (claim is status-guarded).
 */
export async function runOutboxWorkerOnce(
  limit = 50
): Promise<{ processed: number; sent: number; failed: number; retried: number }> {
  const now = new Date();
  const rows = await db
    .select({ id: outboxEvents.id })
    .from(outboxEvents)
    .where(
      and(
        eq(outboxEvents.status, "pending"),
        eq(outboxEvents.type, "message.send"),
        lte(outboxEvents.availableAt, now)
      )
    )
    .orderBy(desc(outboxEvents.createdAt))
    .limit(limit);

  let sent = 0;
  let failed = 0;
  let retried = 0;
  for (const row of rows) {
    const result = await processMessageEvent(row.id);
    if (result.outcome === "sent") sent++;
    else if (result.outcome === "not_configured" || result.outcome === "permanently_failed") failed++;
    else if (result.outcome === "retry_scheduled") retried++;
  }
  return { processed: rows.length, sent, failed, retried };
}

// ---------------------------------------------------------------------------
// Refill automation
// ---------------------------------------------------------------------------

export interface RefillDueResult {
  queued: number;
  alreadyQueued: number;
  skippedOptOut: number;
  skippedNoPhone: number;
  deliveryIds: string[];
}

/**
 * Queue `refill_reminder` messages for every due (pending, reminderDate <=
 * today) refill row. Scope: all tenants when `userId` is null (cron), one
 * tenant when set (bulk endpoint). Idempotent per refill row via outbox
 * idempotency `refill:<id>`. Does NOT mark rows sent — that happens only when
 * the delivery actually sends (see processMessageEvent reconciliation).
 */
export async function sendRefillDue(
  userId: string | null,
  channel: MessageChannel = "whatsapp"
): Promise<RefillDueResult> {
  const today = new Date().toISOString().split("T")[0];
  const conds = [
    eq(refillReminders.status, "pending"),
    lte(refillReminders.reminderDate, today),
  ];
  if (userId) conds.push(eq(refillReminders.createdBy, userId));
  const rows = await db.select().from(refillReminders).where(and(...conds));

  const result: RefillDueResult = {
    queued: 0,
    alreadyQueued: 0,
    skippedOptOut: 0,
    skippedNoPhone: 0,
    deliveryIds: [],
  };

  for (const row of rows) {
    let phone = row.customerPhone?.trim() ?? "";
    if (!phone && row.customerId) {
      const customer = await db
        .select({ phone: customers.phone })
        .from(customers)
        .where(and(eq(customers.id, row.customerId), eq(customers.createdBy, row.createdBy)))
        .limit(1);
      phone = customer[0]?.phone?.trim() ?? "";
    }
    if (!phone) {
      result.skippedNoPhone++;
      continue;
    }
    if (await isOptedOut(row.createdBy, row.customerId ?? null, channel)) {
      result.skippedOptOut++;
      continue;
    }

    // Already queued (or sent) by a previous run — outbox idempotency would
    // dedupe anyway; skip so counts reflect only NEW work.
    const [priorEvent] = await db
      .select({ id: outboxEvents.id })
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.createdBy, row.createdBy),
          eq(outboxEvents.idempotencyKey, `refill:${row.id}`)
        )
      )
      .limit(1);
    if (priorEvent) {
      result.alreadyQueued++;
      continue;
    }

    try {
      const queued = await queueMessage(row.createdBy, {
        channel,
        recipient: phone,
        customerId: row.customerId ?? undefined,
        template: "refill_reminder",
        variables: {
          customerName: row.customerName || "there",
          medicineName: row.medicineName,
        },
        aggregateType: "refill",
        aggregateId: row.id,
        idempotencyKey: `refill:${row.id}`,
      });
      result.queued++;
      if (queued.deliveryId) result.deliveryIds.push(queued.deliveryId);
    } catch {
      result.skippedNoPhone++;
    }
  }

  return result;
}
