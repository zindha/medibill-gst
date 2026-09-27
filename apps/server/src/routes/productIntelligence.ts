import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { authGuard } from "../plugins/auth.js";
import {
  addSubstituteLink,
  getAlternatives,
  listSubstituteLinks,
  searchProducts,
} from "../services/productIntelligence.js";

const alternativesQuerySchema = z.object({
  medicineId: z.string().min(1),
  inStock: z.enum(["true", "false", "1", "0"]).optional(),
  maxPrice: z.string().optional(),
  sameSchedule: z.enum(["true", "false", "1", "0"]).optional(),
});

const searchQuerySchema = z.object({
  q: z.string().optional(),
  composition: z.string().optional(),
  limit: z.string().optional(),
});

const linksQuerySchema = z.object({
  medicineId: z.string().min(1),
});

const addSubstituteSchema = z.object({
  medicineId: z.string().min(1),
  substituteMedicineId: z.string().min(1),
  reason: z.string().max(500).optional(),
});

function parseBool(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined) return fallback;
  return v === "true" || v === "1";
}

/**
 * Product intelligence routes: alternatives to a medicine, salt search across
 * tenant stock + the reference catalog, and explicit substitute links.
 * Everything is tenant-scoped — foreign/unknown medicine IDs return 404.
 */
export default async function productIntelligenceRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/alternatives",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = alternativesQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ success: false, error: "medicineId is required", details: parsed.error.flatten() });
      }

      const { medicineId, inStock, maxPrice, sameSchedule } = parsed.data;
      let price: number | undefined;
      if (maxPrice !== undefined && maxPrice !== "") {
        price = Number(maxPrice);
        if (!Number.isFinite(price) || price < 0) {
          return reply.status(400).send({ success: false, error: "maxPrice must be a number" });
        }
      }

      const result = await getAlternatives(request.userId!, medicineId, {
        inStock: parseBool(inStock, false),
        maxPrice: price,
        sameSchedule: parseBool(sameSchedule, true),
      });
      if (!result) {
        return reply.status(404).send({ success: false, error: "Medicine not found" });
      }
      return reply.send({ success: true, data: result });
    }
  );

  fastify.get(
    "/search",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = searchQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
      }
      const limit = Math.min(Math.max(parseInt(parsed.data.limit ?? "20", 10) || 20, 1), 50);
      const data = await searchProducts(
        request.userId!,
        parsed.data.q ?? "",
        parsed.data.composition,
        limit
      );
      return reply.send({ success: true, data });
    }
  );

  fastify.post(
    "/substitutes",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = addSubstituteSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
      }
      const { medicineId, substituteMedicineId, reason } = parsed.data;
      const result = await addSubstituteLink(request.userId!, medicineId, substituteMedicineId, reason);
      if (result === "same_medicine") {
        return reply.status(400).send({ success: false, error: "A medicine cannot substitute itself" });
      }
      if (result === "not_found") {
        return reply.status(404).send({ success: false, error: "Medicine not found" });
      }
      return reply.status(201).send({ success: true, data: result });
    }
  );

  fastify.get(
    "/links",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = linksQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ success: false, error: "medicineId is required", details: parsed.error.flatten() });
      }
      const links = await listSubstituteLinks(request.userId!, parsed.data.medicineId);
      return reply.send({ success: true, data: links });
    }
  );
}
