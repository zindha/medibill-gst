import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { authGuard } from "../plugins/auth.js";
import {
  addCartItem,
  analysis,
  cancelPo,
  checkout,
  confirmPo,
  createDistributor,
  createPo,
  deleteCartItem,
  getCart,
  getDistributor,
  getOrder,
  getPo,
  listAlreadyToOrder,
  listDistributors,
  listPos,
  listShortbook,
  receivePo,
  resolveShortbook,
  searchProducts,
  sendPo,
  updateCartItem,
  updateDistributor,
} from "../services/orderbook.js";

const distributorSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional().or(z.literal("")),
  city: z.string().max(100).optional(),
  pincode: z.string().max(10).optional(),
  supplierId: z.string().nullable().optional(),
  connectionStatus: z.enum(["connected", "pending", "offline"]).optional(),
  creditTerms: z.string().max(100).optional(),
  creditLimit: z.number().min(0).optional(),
});

const distributorPatchSchema = distributorSchema.partial();

const poItemSchema = z.object({
  medicineId: z.string().nullable().optional(),
  name: z.string().min(1).max(300),
  pack: z.string().max(50).optional(),
  quantity: z.number().positive(),
  freeQuantity: z.number().min(0).optional(),
  rate: z.number().min(0),
});

const poCreateSchema = z.object({
  distributorId: z.string().min(1),
  expectedDate: z.string().optional(),
  notes: z.string().max(500).optional(),
  items: z.array(poItemSchema).min(1).max(200),
});

const receiveSchema = z.object({
  receipts: z
    .array(
      z.object({
        itemId: z.string().min(1),
        receivedQuantity: z.number().min(0),
      })
    )
    .min(1)
    .max(200),
});

const shortbookResolveSchema = z.object({
  action: z.enum(["carried", "supplied", "cancelled"]),
  suppliedQuantity: z.number().min(0).optional(),
});

const cartItemSchema = z.object({
  distributorId: z.string().min(1),
  medicineId: z.string().nullable().optional(),
  name: z.string().min(1).max(300),
  pack: z.string().max(50).optional(),
  quantity: z.number().positive(),
  rate: z.number().min(0),
});

const cartUpdateSchema = z.object({
  quantity: z.number().positive(),
  rate: z.number().min(0).optional(),
});

const posQuerySchema = z.object({
  status: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

function httpError(reply: FastifyReply, error: unknown) {
  const err = error as Error & { statusCode?: number };
  const status = err.statusCode ?? 500;
  if (status >= 500) {
    request_error: {
      // Let Fastify's logger capture unexpected failures with their stack.
      reply.log.error(err);
      break request_error;
    }
  }
  return reply.status(status).send({
    success: false,
    error: err.message || "Request failed",
  });
}

/**
 * Orderbook routes: distributor ordering workspace — distributors, product
 * search, purchase-order lifecycle, shortbook, cart and analysis. All routes
 * are tenant-scoped behind authGuard.
 */
export default async function orderbookRoutes(
  fastify: FastifyInstance
) {
  // Distributors ------------------------------------------------------------
  fastify.get(
    "/distributors",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { q } = request.query as { q?: string };
        const data = await listDistributors(request.userId!, q);
        return reply.send({ success: true, data });
      } catch (error) {
        return httpError(reply, error);
      }
    }
  );

  fastify.post(
    "/distributors",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = distributorSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: "Invalid distributor" });
      }
      try {
        const data = await createDistributor(request.userId!, parsed.data);
        return reply.status(201).send({ success: true, data });
      } catch (error) {
        return httpError(reply, error);
      }
    }
  );

  fastify.get(
    "/distributors/:id",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      try {
        const data = await getDistributor(request.userId!, id);
        return reply.send({ success: true, data });
      } catch (error) {
        return httpError(reply, error);
      }
    }
  );

  fastify.patch(
    "/distributors/:id",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const parsed = distributorPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: "Invalid distributor" });
      }
      try {
        const data = await updateDistributor(request.userId!, id, parsed.data);
        return reply.send({ success: true, data });
      } catch (error) {
        return httpError(reply, error);
      }
    }
  );

  // Products ----------------------------------------------------------------
  fastify.get(
    "/products",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { q = "", distributorId, limit } = request.query as {
        q?: string;
        distributorId?: string;
        limit?: string;
      };
      try {
        const data = await searchProducts(
          request.userId!,
          q,
          distributorId,
          limit ? Number(limit) : 50
        );
        return reply.send({ success: true, data });
      } catch (error) {
        return httpError(reply, error);
      }
    }
  );

  // Already-to-order ----------------------------------------------------------
  fastify.get(
    "/already-to-order",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const data = await listAlreadyToOrder(request.userId!);
        return reply.send({ success: true, data });
      } catch (error) {
        return httpError(reply, error);
      }
    }
  );

  // Purchase orders -----------------------------------------------------------
  fastify.get(
    "/pos",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = posQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: "Invalid filters" });
      }
      try {
        const data = await listPos(request.userId!, parsed.data);
        return reply.send({ success: true, data });
      } catch (error) {
        return httpError(reply, error);
      }
    }
  );

  fastify.post(
    "/pos",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = poCreateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: "Invalid purchase order" });
      }
      try {
        const data = await createPo(
          request.userId!,
          parsed.data.distributorId,
          parsed.data.items,
          { expectedDate: parsed.data.expectedDate, notes: parsed.data.notes }
        );
        return reply.status(201).send({ success: true, data });
      } catch (error) {
        return httpError(reply, error);
      }
    }
  );

  fastify.get(
    "/pos/:id",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      try {
        const data = await getPo(request.userId!, id);
        return reply.send({ success: true, data });
      } catch (error) {
        return httpError(reply, error);
      }
    }
  );

  fastify.post(
    "/pos/:id/send",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      try {
        const data = await sendPo(request.userId!, id);
        return reply.send({ success: true, data });
      } catch (error) {
        return httpError(reply, error);
      }
    }
  );

  fastify.post(
    "/pos/:id/confirm",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      try {
        const data = await confirmPo(request.userId!, id);
        return reply.send({ success: true, data });
      } catch (error) {
        return httpError(reply, error);
      }
    }
  );

  fastify.post(
    "/pos/:id/receive",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const parsed = receiveSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: "Invalid receipts" });
      }
      try {
        const data = await receivePo(request.userId!, id, parsed.data.receipts);
        return reply.send({ success: true, data });
      } catch (error) {
        return httpError(reply, error);
      }
    }
  );

  fastify.post(
    "/pos/:id/cancel",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      try {
        const data = await cancelPo(request.userId!, id);
        return reply.send({ success: true, data });
      } catch (error) {
        return httpError(reply, error);
      }
    }
  );

  // Shortbook -----------------------------------------------------------------
  fastify.get(
    "/shortbook",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { status } = request.query as { status?: string };
      try {
        const data = await listShortbook(request.userId!, status);
        return reply.send({ success: true, data });
      } catch (error) {
        return httpError(reply, error);
      }
    }
  );

  fastify.post(
    "/shortbook/:id/resolve",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const parsed = shortbookResolveSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: "Invalid action" });
      }
      try {
        const data = await resolveShortbook(
          request.userId!,
          id,
          parsed.data.action,
          parsed.data.suppliedQuantity ?? 0
        );
        return reply.send({ success: true, data });
      } catch (error) {
        return httpError(reply, error);
      }
    }
  );

  // Cart ----------------------------------------------------------------------
  fastify.get(
    "/cart",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const data = await getCart(request.userId!);
        return reply.send({ success: true, data });
      } catch (error) {
        return httpError(reply, error);
      }
    }
  );

  fastify.post(
    "/cart/items",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = cartItemSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: "Invalid cart item" });
      }
      try {
        const data = await addCartItem(request.userId!, parsed.data);
        return reply.status(201).send({ success: true, data });
      } catch (error) {
        return httpError(reply, error);
      }
    }
  );

  fastify.patch(
    "/cart/items/:id",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const parsed = cartUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: "Invalid update" });
      }
      try {
        const data = await updateCartItem(
          request.userId!,
          id,
          parsed.data.quantity,
          parsed.data.rate
        );
        return reply.send({ success: true, data });
      } catch (error) {
        return httpError(reply, error);
      }
    }
  );

  fastify.delete(
    "/cart/items/:id",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      try {
        const data = await deleteCartItem(request.userId!, id);
        return reply.send({ success: true, data });
      } catch (error) {
        return httpError(reply, error);
      }
    }
  );

  fastify.post(
    "/cart/checkout",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const data = await checkout(request.userId!);
        return reply.send({ success: true, data });
      } catch (error) {
        return httpError(reply, error);
      }
    }
  );

  // Orders (placed cart snapshots) ---------------------------------------------
  fastify.get(
    "/orders/:id",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      try {
        const data = await getOrder(request.userId!, id);
        return reply.send({ success: true, data });
      } catch (error) {
        return httpError(reply, error);
      }
    }
  );

  // Analysis --------------------------------------------------------------------
  fastify.get(
    "/analysis",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const data = await analysis(request.userId!);
        return reply.send({ success: true, data });
      } catch (error) {
        return httpError(reply, error);
      }
    }
  );
}
