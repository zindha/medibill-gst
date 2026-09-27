import { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { OUTBOX_STATUS, outboxEvents } from "../db/schema/index.js";
import { authGuard } from "../plugins/auth.js";

const ackSchema = z.object({
  status: z.enum(["done", "failed", "pending"]),
});

export default async function outboxRoutes(fastify: FastifyInstance) {
  // Pending events for the current tenant (worker polling).
  fastify.get("/pending", { preHandler: [authGuard] }, async (request, reply) => {
    const now = new Date();
    const rows = await db
      .select()
      .from(outboxEvents)
      .where(and(eq(outboxEvents.createdBy, request.userId!), eq(outboxEvents.status, "pending")))
      .orderBy(asc(outboxEvents.createdAt))
      .limit(100);
    const due = rows.filter((r) => !r.availableAt || r.availableAt.getTime() <= now.getTime());
    return reply.send({ success: true, data: due });
  });

  // Acknowledge an event — tenant-scoped; cannot touch other users' rows.
  fastify.post("/:id/ack", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = ackSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: "status must be done|failed|pending" });
    }
    const { id } = request.params as { id: string };
    const existing = await db
      .select()
      .from(outboxEvents)
      .where(and(eq(outboxEvents.id, id), eq(outboxEvents.createdBy, request.userId!)))
      .limit(1);
    if (!existing[0]) return reply.status(404).send({ success: false, error: "Event not found" });
    const next = parsed.data.status as (typeof OUTBOX_STATUS)[keyof typeof OUTBOX_STATUS];
    const attempts = (existing[0].attempts ?? 0) + (next === "failed" ? 1 : 0);
    const [updated] = await db
      .update(outboxEvents)
      .set({ status: next, attempts })
      .where(eq(outboxEvents.id, id))
      .returning();
    return reply.send({ success: true, data: updated });
  });
}
