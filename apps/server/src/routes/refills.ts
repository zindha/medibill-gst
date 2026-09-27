import { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/index.js";
import { refillReminders, customers, MESSAGE_CHANNELS } from "../db/schema/index.js";
import { eq, and, asc, desc, lte, sql } from "drizzle-orm";
import { authGuard } from "../plugins/auth.js";
import { generateId } from "../db/schema/index.js";
import { queueMessage, sendRefillDue } from "../services/messaging.js";
import { auditEvents } from "../services/audit.js";

const createRefillSchema = z.object({
  customerId: z.string().optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  medicineId: z.string().optional(),
  medicineName: z.string().min(1),
  lastPurchaseDate: z.string().min(1),
  /** Days from last purchase — 30 = monthly. Defaults to 30. */
  daysAfter: z.number().int().min(1).max(365).optional(),
  reminderDate: z.string().optional(),
  notes: z.string().optional(),
});

const updateRefillSchema = z.object({
  reminderDate: z.string().optional(),
  status: z.enum(["pending", "sent", "completed"]).optional(),
  notes: z.string().optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
});

export default async function refillRoutes(fastify: FastifyInstance) {
  // List — pending first, then by reminder date. ?status=&dueOnly=1 supported.
  fastify.get("/", { preHandler: [authGuard] }, async (request, reply) => {
    const { status, dueOnly } = request.query as { status?: string; dueOnly?: string };
    const conds = [eq(refillReminders.createdBy, request.userId!)];
    if (status) conds.push(eq(refillReminders.status, status as any));
    if (dueOnly === "1") {
      const today = new Date().toISOString().split("T")[0];
      conds.push(eq(refillReminders.status, "pending" as any));
      conds.push(lte(refillReminders.reminderDate, today));
    }
    const rows = await db.select().from(refillReminders)
      .where(and(...conds))
      .orderBy(asc(refillReminders.reminderDate));
    return reply.send({ success: true, data: rows });
  });

  // Due count — for dashboard badges.
  fastify.get("/due-count", { preHandler: [authGuard] }, async (request, reply) => {
    const today = new Date().toISOString().split("T")[0];
    const rows = await db.select({ count: sql<number>`COUNT(*)` }).from(refillReminders)
      .where(and(
        eq(refillReminders.createdBy, request.userId!),
        eq(refillReminders.status, "pending" as any),
        lte(refillReminders.reminderDate, today),
      ));
    return reply.send({ success: true, data: { count: rows[0]?.count ?? 0 } });
  });

  // Create — monthly default (lastPurchase + 30 days) unless reminderDate given.
  fastify.post("/", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = createRefillSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    const d = parsed.data;
    let reminderDate = d.reminderDate;
    if (!reminderDate) {
      const base = new Date(d.lastPurchaseDate);
      if (Number.isNaN(base.getTime())) return reply.status(400).send({ success: false, error: "lastPurchaseDate must be a valid date" });
      base.setDate(base.getDate() + (d.daysAfter ?? 30));
      reminderDate = base.toISOString().split("T")[0];
    }
    const [row] = await db.insert(refillReminders).values({
      id: generateId(),
      customerId: d.customerId,
      customerName: d.customerName,
      customerPhone: d.customerPhone,
      medicineId: d.medicineId,
      medicineName: d.medicineName,
      lastPurchaseDate: d.lastPurchaseDate,
      reminderDate,
      notes: d.notes,
      createdBy: request.userId!,
    }).returning();
    return reply.status(201).send({ success: true, data: row });
  });

  // Mark sent / completed / reschedule.
  fastify.put("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateRefillSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    const [existing] = await db.select().from(refillReminders)
      .where(and(eq(refillReminders.id, id), eq(refillReminders.createdBy, request.userId!))).limit(1);
    if (!existing) return reply.status(404).send({ success: false, error: "Reminder not found" });
    const patch: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.status === "sent") patch.sentAt = new Date();
    const [updated] = await db.update(refillReminders).set(patch).where(eq(refillReminders.id, id)).returning();
    return reply.send({ success: true, data: updated });
  });

  fastify.delete("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [existing] = await db.select().from(refillReminders)
      .where(and(eq(refillReminders.id, id), eq(refillReminders.createdBy, request.userId!))).limit(1);
    if (!existing) return reply.status(404).send({ success: false, error: "Reminder not found" });
    await db.delete(refillReminders).where(eq(refillReminders.id, id));
    return reply.send({ success: true, data: { removed: true } });
  });

  // Upcoming — next N days including overdue, for dashboard widgets.
  fastify.get("/upcoming", { preHandler: [authGuard] }, async (request, reply) => {
    const { days = "7" } = request.query as { days?: string };
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + Math.min(90, Math.max(1, parseInt(days, 10) || 7)));
    const rows = await db.select().from(refillReminders)
      .where(and(
        eq(refillReminders.createdBy, request.userId!),
        eq(refillReminders.status, "pending" as any),
        lte(refillReminders.reminderDate, horizon.toISOString().split("T")[0]),
      ))
      .orderBy(asc(refillReminders.reminderDate))
      .limit(25);
    return reply.send({ success: true, data: rows });
  });

  const sendChannelSchema = z.object({ channel: z.enum(MESSAGE_CHANNELS) });

  // Queue a reviewed reminder for one row. Nothing is marked sent here — the
  // refill flips to `sent` only after the delivery actually goes out.
  fastify.post("/:id/send", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = sendChannelSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: "channel must be whatsapp|sms|email" });
    }
    const { id } = request.params as { id: string };
    const [row] = await db.select().from(refillReminders)
      .where(and(eq(refillReminders.id, id), eq(refillReminders.createdBy, request.userId!))).limit(1);
    if (!row) return reply.status(404).send({ success: false, error: "Reminder not found" });

    let phone = row.customerPhone?.trim() ?? "";
    if (!phone && row.customerId) {
      const [customer] = await db.select({ phone: customers.phone }).from(customers)
        .where(and(eq(customers.id, row.customerId), eq(customers.createdBy, request.userId!))).limit(1);
      phone = customer?.phone?.trim() ?? "";
    }
    if (!phone) return reply.status(400).send({ success: false, error: "No phone number for this reminder" });

    try {
      const result = await queueMessage(request.userId!, {
        channel: parsed.data.channel,
        recipient: phone,
        customerId: row.customerId ?? undefined,
        template: "refill_reminder",
        variables: {
          customerName: row.customerName || "there",
          medicineName: row.medicineName,
        },
        aggregateType: "refill",
        aggregateId: row.id,
        // Timestamped so a manual resend is never swallowed by a previous
        // bulk/cron idempotency key.
        idempotencyKey: `refill:${row.id}:${Date.now()}`,
      });
      await auditEvents.record({
        actorId: request.userId!,
        action: "refill.reminder_queued",
        entity: "refill_reminder",
        entityId: row.id,
        metadata: { channel: parsed.data.channel, deliveryId: result.deliveryId },
      });
      return reply.status(201).send({ success: true, data: result.delivery });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err?.message ?? "Unable to queue reminder" });
    }
  });

  // Queue reminders for every due row (pending, reminderDate <= today).
  // Works regardless of the `refill_automation` setting — that setting only
  // gates the cron, not this explicit action.
  fastify.post("/send-due", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = sendChannelSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: "channel must be whatsapp|sms|email" });
    }
    const result = await sendRefillDue(request.userId!, parsed.data.channel);
    await auditEvents.record({
      actorId: request.userId!,
      action: "refill.bulk_queued",
      entity: "refill_reminder",
      metadata: { channel: parsed.data.channel, ...result, deliveryIds: undefined },
    });
    return reply.send({
      success: true,
      data: {
        queued: result.queued,
        already_queued: result.alreadyQueued,
        skipped_optout: result.skippedOptOut,
        skipped_nophone: result.skippedNoPhone,
        deliveryIds: result.deliveryIds,
      },
    });
  });
}
