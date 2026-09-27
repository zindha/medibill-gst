import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { authGuard } from "../plugins/auth.js";
import {
  compareSupplierQuotes,
  createQuote,
  getRateHistory,
  getSupplierExpiryItems,
  getSupplierMetrics,
  getSupplierRecommendation,
  listQuotes,
} from "../services/procurement.js";

const compareQuerySchema = z.object({
  medicineId: z.string().min(1),
  quantity: z.string().optional(),
});

const rateHistoryQuerySchema = z.object({
  medicineId: z.string().min(1),
  supplierId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

const periodQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

const quotesQuerySchema = z.object({
  medicineId: z.string().optional(),
  supplierId: z.string().optional(),
});

const createQuoteSchema = z.object({
  supplierId: z.string().min(1),
  medicineId: z.string().min(1),
  quotedRate: z.number().min(0),
  quoteDate: z.string().optional(),
  notes: z.string().max(500).optional(),
});

const recommendationQuerySchema = z.object({
  quantity: z.string().optional(),
});

function parseQuantity(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

/**
 * Procurement routes: supplier comparison, rate history, supplier metrics,
 * expiry drill-down and manual quote records. Everything is tenant-scoped —
 * foreign supplier ids return 404, unknown medicines return empty results.
 */
export default async function procurementRoutes(fastify: FastifyInstance) {
  // GET /api/procurement/compare?medicineId=&quantity=
  fastify.get(
    "/compare",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = compareQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ success: false, error: "medicineId is required" });
      }
      const quantity = parseQuantity(parsed.data.quantity, 1);
      const data = await compareSupplierQuotes(
        request.userId!,
        parsed.data.medicineId,
        quantity
      );
      return reply.send({ success: true, data });
    }
  );

  // GET /api/procurement/recommendation?medicineId=&quantity=
  fastify.get(
    "/recommendation",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = compareQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ success: false, error: "medicineId is required" });
      }
      const recQuery = recommendationQuerySchema.safeParse(request.query);
      const quantity = parseQuantity(recQuery.success ? recQuery.data.quantity : undefined, 1);
      const data = await getSupplierRecommendation(
        request.userId!,
        parsed.data.medicineId,
        quantity
      );
      return reply.send({ success: true, data });
    }
  );

  // GET /api/procurement/rate-history?medicineId=&supplierId=&from=&to=
  fastify.get(
    "/rate-history",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = rateHistoryQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ success: false, error: "medicineId is required" });
      }
      const { medicineId, supplierId, from, to } = parsed.data;
      const rows = await getRateHistory(
        request.userId!,
        medicineId,
        supplierId || null,
        from || null,
        to || null
      );
      return reply.send({ success: true, data: { rows, count: rows.length } });
    }
  );

  // GET /api/procurement/suppliers/:id/metrics?from=&to=
  fastify.get(
    "/suppliers/:id/metrics",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const parsed = periodQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: "Validation error" });
      }
      const data = await getSupplierMetrics(
        request.userId!,
        id,
        parsed.data.from || null,
        parsed.data.to || null
      );
      if (!data) {
        return reply.status(404).send({ success: false, error: "Supplier not found" });
      }
      return reply.send({ success: true, data });
    }
  );

  // GET /api/procurement/suppliers/:id/expiry-items?from=&to=
  // Supplier-wise expiry responsibility: batch-level drill-down.
  fastify.get(
    "/suppliers/:id/expiry-items",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const parsed = periodQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: "Validation error" });
      }
      const data = await getSupplierExpiryItems(
        request.userId!,
        id,
        parsed.data.from || null,
        parsed.data.to || null
      );
      if (!data) {
        return reply.status(404).send({ success: false, error: "Supplier not found" });
      }
      return reply.send({ success: true, data });
    }
  );

  // POST /api/procurement/quotes
  fastify.post(
    "/quotes",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = createQuoteSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
      }
      const result = await createQuote(request.userId!, parsed.data);
      if (!result.ok) {
        return reply.status(404).send({
          success: false,
          error:
            result.error === "supplier_not_found"
              ? "Supplier not found"
              : "Medicine not found",
        });
      }
      return reply.status(201).send({ success: true, data: result.quote });
    }
  );

  // GET /api/procurement/quotes?medicineId=&supplierId=
  fastify.get(
    "/quotes",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = quotesQuerySchema.safeParse(request.query ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: "Validation error" });
      }
      const rows = await listQuotes(request.userId!, {
        medicineId: parsed.data.medicineId || null,
        supplierId: parsed.data.supplierId || null,
      });
      return reply.send({ success: true, data: { rows, count: rows.length } });
    }
  );
}
