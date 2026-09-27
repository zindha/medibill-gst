import { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { authGuard } from "../plugins/auth.js";
import { CUSTOMER_ORDER_STATUSES } from "../db/schema/index.js";
import {
  OrderError,
  getOrder,
  listOrders,
  transition,
  type OrderAction,
} from "../services/customerOrders.js";

const listQuerySchema = z.object({
  status: z.enum(CUSTOMER_ORDER_STATUSES).optional(),
  q: z.string().max(120).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

const reasonSchema = z.object({
  reason: z.string().min(3, "reason must be at least 3 characters").max(500),
});

const deliverSchema = z.object({
  invoiceId: z.string().min(1, "invoiceId is required").max(64),
});

/** Map OrderError to its HTTP reply; rethrow anything else. */
async function guard<T>(reply: FastifyReply, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof OrderError) {
      await reply
        .status(err.status)
        .send({ success: false, error: err.message, details: err.details });
      return null;
    }
    throw err;
  }
}

/**
 * Staff order queue (Task 14). Registered under /api/orders with authGuard.
 *
 * DOCUMENTED: this queue is INSTALL-SHARED — routes require authentication but
 * are NOT tenant-filtered, so every staff user of this single-store install
 * sees and moves every order. There are no role gates: any authenticated staff
 * member may accept/pack/ready/deliver/reject/cancel (queue work is a shared
 * counter task); every mutation is audited with the acting user id.
 */
export default async function customerOrderRoutes(fastify: FastifyInstance) {
  // Queue list — filters: status, q (customer name/phone/id), from/to, paging.
  fastify.get("/", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    const result = await guard(reply, () =>
      listOrders(request.userId!, {
        ...parsed.data,
        page: parsed.data.page ? parseInt(parsed.data.page, 10) : undefined,
        limit: parsed.data.limit ? parseInt(parsed.data.limit, 10) : undefined,
      })
    );
    if (!result) return undefined;
    return reply.send({
      success: true,
      data: result.rows,
      total: result.total,
      pagination: { page: result.page, limit: result.limit },
    });
  });

  // Detail — includes items, invoiceId and (when attached) the prescription
  // image inlined as base64 so non-owner staff can preview it.
  fastify.get("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await guard(reply, () => getOrder(request.userId!, id));
    if (!row) return undefined;
    return reply.send({ success: true, data: row });
  });

  const transitionRoute = (action: OrderAction, schema: z.ZodTypeAny = z.object({}).passthrough()) =>
    fastify.post(`/:id/${action}`, { preHandler: [authGuard] }, async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = schema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
      }
      const row = await guard(reply, () =>
        transition(request.userId!, id, action, parsed.data as any)
      );
      if (!row) return undefined;
      return reply.send({ success: true, data: row });
    });

  // pending → accepted — soft stock reservation (verify, never deduct).
  await transitionRoute("accept");
  // accepted → packed → ready (linear).
  await transitionRoute("pack");
  await transitionRoute("ready");
  // ready|accepted|packed → delivered, links the bill created on BillingPage.
  await transitionRoute("deliver", deliverSchema);
  // pending|accepted → rejected with a reason (terminal).
  await transitionRoute("reject", reasonSchema);
  // pending|accepted|packed → cancelled with a reason (terminal).
  await transitionRoute("cancel", reasonSchema);
}
