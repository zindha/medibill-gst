import { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { authGuard } from "../plugins/auth.js";
import {
  StockAuditError,
  approveAudit,
  cancelAudit,
  createAudit,
  getAudit,
  listAudits,
  updateCount,
  upsertCount,
} from "../services/stockAudit.js";

const createSchema = z.object({
  note: z.string().max(500).optional(),
});

const listQuerySchema = z.object({
  status: z.enum(["open", "approved", "cancelled"]).optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

const countSchema = z.object({
  medicineId: z.string().min(1),
  batchId: z.string().min(1),
  countedQuantity: z.number().min(0),
});

const updateCountSchema = z.object({
  countedQuantity: z.number().min(0),
});

const approveSchema = z.object({
  reason: z.string().min(1),
});

const cancelSchema = z.object({
  reason: z.string().min(1).optional(),
});

/** Map StockAuditError to its HTTP reply; rethrow anything else. */
async function guard<T>(reply: FastifyReply, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof StockAuditError) {
      await reply
        .status(err.status)
        .send({ success: false, error: err.message, details: err.details });
      return null;
    }
    throw err;
  }
}

export default async function stockAuditRoutes(fastify: FastifyInstance) {
  // Create — a session always starts "open"; counting is scan-driven (no rows yet).
  fastify.post("/", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = createSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    const row = await guard(reply, () => createAudit(request.userId!, parsed.data));
    if (!row) return undefined;
    return reply.status(201).send({ success: true, data: row });
  });

  // List — tenant-scoped sessions with a per-audit counts summary.
  fastify.get("/", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    const result = await listAudits(request.userId!, {
      status: parsed.data.status,
      page: parsed.data.page ? parseInt(parsed.data.page, 10) : undefined,
      limit: parsed.data.limit ? parseInt(parsed.data.limit, 10) : undefined,
    });
    return reply.send({
      success: true,
      data: result.rows,
      total: result.total,
      pagination: { page: result.page, limit: result.limit },
    });
  });

  // Detail — counted rows (variance vs frozen expected + live batch quantity)
  // plus batches still awaiting a count.
  fastify.get("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = await guard(reply, () => getAudit(request.userId!, id));
    if (!data) return undefined;
    return reply.send({ success: true, data });
  });

  // Count — upsert on (auditId, batchId): first insert freezes expected,
  // a repeat updates counted_quantity/counted_at on the same row.
  fastify.post("/:id/counts", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = countSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    const result = await guard(reply, () => upsertCount(request.userId!, id, parsed.data));
    if (!result) return undefined;
    return reply.send({ success: true, data: { ...result.row, created: result.created } });
  });

  // Update an existing count row by id (alternative to the session upsert).
  fastify.put("/counts/:countId", { preHandler: [authGuard] }, async (request, reply) => {
    const { countId } = request.params as { countId: string };
    const parsed = updateCountSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    const row = await guard(reply, () => updateCount(request.userId!, countId, parsed.data));
    if (!row) return undefined;
    return reply.send({ success: true, data: row });
  });

  // Approve — admin/pharmacist only; writes adjustment transactions atomically.
  fastify.post("/:id/approve", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = approveSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    const result = await guard(reply, () =>
      approveAudit(request.userId!, id, { reason: parsed.data.reason })
    );
    if (!result) return undefined;
    return reply.send({ success: true, data: result });
  });

  // Cancel — open sessions only; counts are kept for history.
  fastify.post("/:id/cancel", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = cancelSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    const row = await guard(reply, () => cancelAudit(request.userId!, id, parsed.data.reason));
    if (!row) return undefined;
    return reply.send({ success: true, data: row });
  });
}
