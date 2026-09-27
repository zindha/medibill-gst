import { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  MESSAGE_CHANNELS,
  communicationPreferences,
  customers,
  messageDeliveries,
} from "../db/schema/index.js";
import { authGuard } from "../plugins/auth.js";
import { enqueueOutbox } from "../services/outbox.js";
import {
  TEMPLATE_IDS,
  queueMessage,
  setPreference,
} from "../services/messaging.js";
import { isProviderConfigured } from "../providers/messaging.js";
import { auditEvents } from "../services/audit.js";

const channelEnum = z.enum(MESSAGE_CHANNELS);

const sendSchema = z.object({
  channel: channelEnum,
  recipient: z.string().min(1).optional(),
  customerId: z.string().min(1).optional(),
  template: z.string().min(1),
  variables: z.record(z.unknown()).optional(),
  aggregateType: z.string().min(1).optional(),
  aggregateId: z.string().min(1).optional(),
  idempotencyKey: z.string().min(1).optional(),
});

const preferenceSchema = z.object({
  customerId: z.string().min(1).nullable().optional(),
  channel: channelEnum,
  optedOut: z.boolean(),
});

/** End-of-day when `to` is a plain YYYY-MM-DD so the whole day is included. */
function upperBound(value: string): Date {
  const d = new Date(value.length === 10 ? `${value}T23:59:59.999` : value);
  return Number.isNaN(d.getTime()) ? new Date(value) : d;
}

export default async function messageRoutes(fastify: FastifyInstance) {
  // Queue one message. Recipient resolves from customerId → customers.phone
  // when omitted (400 when neither yields a destination).
  fastify.post("/send", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = sendSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    const body = parsed.data;
    if (!body.recipient && !body.customerId) {
      return reply
        .status(400)
        .send({ success: false, error: "recipient or customerId is required" });
    }

    try {
      const result = await queueMessage(request.userId!, {
        channel: body.channel,
        recipient: body.recipient,
        customerId: body.customerId,
        template: body.template,
        variables: body.variables,
        aggregateType: body.aggregateType,
        aggregateId: body.aggregateId,
        idempotencyKey: body.idempotencyKey,
      });
      await auditEvents.record({
        actorId: request.userId!,
        action: "message.queued",
        entity: "message_delivery",
        entityId: result.deliveryId,
        metadata: { channel: body.channel, template: body.template, status: result.status },
      });
      return reply.status(201).send({ success: true, data: result.delivery });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err?.message ?? "Unable to queue message" });
    }
  });

  // Delivery history — tenant-scoped, filterable by aggregate/channel/status/date.
  fastify.get("/", { preHandler: [authGuard] }, async (request, reply) => {
    const { aggregateType, aggregateId, channel, status, from, to, page = "1", limit = "50" } =
      request.query as {
        aggregateType?: string;
        aggregateId?: string;
        channel?: string;
        status?: string;
        from?: string;
        to?: string;
        page?: string;
        limit?: string;
      };

    const conds = [eq(messageDeliveries.createdBy, request.userId!)];
    if (aggregateType) conds.push(eq(messageDeliveries.aggregateType, aggregateType));
    if (aggregateId) conds.push(eq(messageDeliveries.aggregateId, aggregateId));
    if (channel) conds.push(eq(messageDeliveries.channel, channel as any));
    if (status) conds.push(eq(messageDeliveries.status, status as any));
    if (from) conds.push(gte(messageDeliveries.createdAt, new Date(from)));
    if (to) conds.push(lte(messageDeliveries.createdAt, upperBound(to)));
    const where = and(...conds);

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    const counts = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(messageDeliveries)
      .where(where);
    const rows = await db
      .select()
      .from(messageDeliveries)
      .where(where)
      .orderBy(desc(messageDeliveries.createdAt), desc(messageDeliveries.id))
      .limit(limitNum)
      .offset(offset);

    return reply.send({
      success: true,
      data: rows,
      total: counts[0]?.count ?? 0,
      pagination: { page: pageNum, limit: limitNum },
    });
  });

  // Provider health — env presence booleans only, never secret values.
  fastify.get("/providers", { preHandler: [authGuard] }, async (_request, reply) => {
    return reply.send({
      success: true,
      data: {
        whatsapp: isProviderConfigured("whatsapp"),
        sms: isProviderConfigured("sms"),
        email: isProviderConfigured("email"),
      },
    });
  });

  // Opt-out list (+ linked customer details for the preferences UI).
  fastify.get("/preferences", { preHandler: [authGuard] }, async (request, reply) => {
    const rows = await db
      .select({
        id: communicationPreferences.id,
        customerId: communicationPreferences.customerId,
        channel: communicationPreferences.channel,
        optedOut: communicationPreferences.optedOut,
        updatedAt: communicationPreferences.updatedAt,
        customerName: customers.name,
        customerPhone: customers.phone,
      })
      .from(communicationPreferences)
      .leftJoin(customers, eq(communicationPreferences.customerId, customers.id))
      .where(eq(communicationPreferences.createdBy, request.userId!))
      .orderBy(desc(communicationPreferences.updatedAt));
    return reply.send({ success: true, data: rows });
  });

  // Upsert consent for one customer + channel.
  fastify.put("/preferences", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = preferenceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    const { customerId, channel, optedOut } = parsed.data;
    if (customerId) {
      const [customer] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(and(eq(customers.id, customerId), eq(customers.createdBy, request.userId!)))
        .limit(1);
      if (!customer) return reply.status(404).send({ success: false, error: "Customer not found" });
    }
    const pref = await setPreference(request.userId!, customerId ?? null, channel, optedOut);
    await auditEvents.record({
      actorId: request.userId!,
      action: optedOut ? "communication.opt_out" : "communication.opt_in",
      entity: "communication_preference",
      entityId: pref.id,
      metadata: { customerId: customerId ?? null, channel },
    });
    return reply.send({ success: true, data: pref });
  });

  // Re-queue a failed delivery with a fresh outbox event (consent is NOT
  // bypassed — opted_out deliveries can never be retried).
  fastify.post("/:id/retry", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [delivery] = await db
      .select()
      .from(messageDeliveries)
      .where(and(eq(messageDeliveries.id, id), eq(messageDeliveries.createdBy, request.userId!)))
      .limit(1);
    if (!delivery) return reply.status(404).send({ success: false, error: "Delivery not found" });
    if (delivery.status === "opted_out") {
      return reply
        .status(400)
        .send({ success: false, error: "Customer opted out — delivery cannot be retried" });
    }
    if (delivery.status !== "failed") {
      return reply
        .status(400)
        .send({ success: false, error: "Only failed deliveries can be retried" });
    }

    const { id: outboxEventId } = await enqueueOutbox({
      createdBy: request.userId!,
      type: "message.send",
      aggregateType: delivery.aggregateType ?? "message",
      aggregateId: delivery.aggregateId ?? delivery.id,
      payload: { deliveryId: delivery.id },
      idempotencyKey: `msg-retry:${delivery.id}:${Date.now()}`,
    });

    const [updated] = await db
      .update(messageDeliveries)
      .set({ status: "queued", error: null, outboxEventId, updatedAt: new Date() })
      .where(eq(messageDeliveries.id, delivery.id))
      .returning();

    await auditEvents.record({
      actorId: request.userId!,
      action: "message.retried",
      entity: "message_delivery",
      entityId: delivery.id,
      metadata: { channel: delivery.channel, template: delivery.template },
    });
    return reply.send({ success: true, data: updated });
  });

  // Convenience: which templates exist (built-in + custom) for the composer.
  fastify.get("/templates", { preHandler: [authGuard] }, async (_request, reply) => {
    return reply.send({ success: true, data: [...TEMPLATE_IDS] });
  });
}
